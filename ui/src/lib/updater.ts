import { execFile } from "node:child_process";
import { existsSync, promises as fs, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runScan } from "./agent";
import { dataDir, isTopLevel, loadResult, type Pkg } from "./data";
import { I18nError } from "./i18n";
import type { PM } from "./pm";
import { bestCompatible, fetchDoc, stableVersions } from "./registry";
import { loadReport, malwareAdvisoriesFor, malwarePackages, runSecurityCheck } from "./security";
import { compare } from "./semver";

/**
 * Fixes, upgrades and uninstalls, run by the local UI server (never by pkgscan).
 * The client only names WHICH installation to act on; the server decides the command itself
 * from the scan + OSV report, so nothing user-typed reaches the package manager.
 *
 * npm and pnpm are separate workspaces: the active workspace (cookie "pm") decides which
 * scan file is used and which package manager runs. npm is never run on pnpm data, or vice versa.
 *
 * Guardrails: --ignore-scripts (+ npm_config_ignore_scripts=true), no shell (node + the
 * manager's JS entry via execFile), package.json / lockfile backup before any project change,
 * one operation at a time, rescan + OSV re-check afterwards.
 */

export type Manager = "npm" | "pnpm";
export type ActionKind = "direct" | "transitive" | "global" | "globalParent";

export type UpdateAction = {
  kind: ActionKind;
  manager: Manager;
  root: string;
  name: string;
  version: string;
  fix: string;
  /** package that is actually installed/updated (differs from name for globalParent) */
  target: string;
  /** arguments for the package manager CLI */
  args: string[];
  /** working directory for the command */
  cwd: string;
  /** human-readable command for the confirmation dialog */
  display: string;
};

export type UpdateOutcome = {
  status: "fixed" | "partial" | "notFixed";
  /** versions of the package found in this folder after the update */
  after: string[];
  log: string;
  backup: string | null;
};

const NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i;
const VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const NPM_COMMON = ["--ignore-scripts", "--no-audit", "--no-fund"];
const PNPM_COMMON = ["--ignore-scripts", "--config.confirm-modules-purge=false"];

// ---------------------------------------------------------------------------------------------
// Locating the package managers (always run as `node <entry.js>`, never through a shell)
// ---------------------------------------------------------------------------------------------

function npmCli(): string {
  const cli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (!existsSync(/*turbopackIgnore: true*/ cli)) throw new I18nError("fix.err.noNpm");
  return cli;
}

/** Same rules as agent/pnpm.go pnpmHome(). */
export function pnpmHome(): string {
  if (process.env.PNPM_HOME) return process.env.PNPM_HOME;
  const home = os.homedir();
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "pnpm");
  if (process.platform === "darwin") return path.join(home, "Library", "pnpm");
  return path.join(process.env.XDG_DATA_HOME || path.join(home, ".local", "share"), "pnpm");
}

function newestFile(candidates: string[]): string | null {
  const existing = candidates.filter((f) => existsSync(/*turbopackIgnore: true*/ f));
  existing.sort((a, b) => statSync(/*turbopackIgnore: true*/ b).mtimeMs - statSync(/*turbopackIgnore: true*/ a).mtimeMs);
  return existing[0] ?? null;
}

/**
 * pnpm's JS entry point, in order:
 *  1. LIBPACK_PNPM_PATH
 *  2. the entry referenced by <PNPM_HOME>/pnpm.CMD (the pnpm the user actually runs on Windows)
 *  3. <PNPM_HOME>/global/<v>/<group>/node_modules/pnpm/bin/pnpm.(mjs|cjs)
 *  4. pnpm installed with npm -g
 */
function pnpmCli(): string {
  if (process.env.LIBPACK_PNPM_PATH && existsSync(/*turbopackIgnore: true*/ process.env.LIBPACK_PNPM_PATH)) {
    return process.env.LIBPACK_PNPM_PATH;
  }
  const home = pnpmHome();
  try {
    const cmd = readFileSync(/*turbopackIgnore: true*/ path.join(home, "pnpm.CMD"), "utf8");
    const m = /%~dp0\\?([^"\r\n]*?pnpm\.(?:mjs|cjs))/i.exec(cmd);
    if (m) {
      const p = path.join(home, m[1]);
      if (existsSync(/*turbopackIgnore: true*/ p)) return p;
    }
  } catch {
    /* no pnpm.CMD (not Windows or not a standalone install) */
  }
  const candidates: string[] = [];
  const globalDir = path.join(home, "global");
  try {
    for (const v of readdirSync(/*turbopackIgnore: true*/ globalDir)) {
      for (const g of readdirSync(/*turbopackIgnore: true*/ path.join(globalDir, v))) {
        for (const f of ["pnpm.mjs", "pnpm.cjs"]) candidates.push(path.join(globalDir, v, g, "node_modules", "pnpm", "bin", f));
      }
    }
  } catch {
    /* no global dir */
  }
  const npmGlobal = process.platform === "win32" && process.env.APPDATA ? path.join(process.env.APPDATA, "npm", "node_modules") : "/usr/local/lib/node_modules";
  for (const f of ["pnpm.mjs", "pnpm.cjs"]) candidates.push(path.join(npmGlobal, "pnpm", "bin", f));
  const found = newestFile(candidates);
  if (!found) throw new I18nError("fix.err.noPnpm");
  return found;
}


/** npm --prefix for a scanned global node_modules dir (Windows: <prefix>/node_modules, else <prefix>/lib/node_modules). */
function globalPrefix(root: string): string {
  return process.platform === "win32" ? path.dirname(root) : path.dirname(path.dirname(root));
}

// ---------------------------------------------------------------------------------------------
// Command builder: one place that knows npm vs pnpm syntax
// ---------------------------------------------------------------------------------------------

type Op =
  | { op: "set"; spec: string }        // install / update a direct dependency to an exact version
  | { op: "updateDeep"; name: string } // update a transitive dependency within allowed ranges
  | { op: "remove"; name: string };    // uninstall a direct dependency

function buildCommand(manager: Manager, scope: "project" | "global", root: string, o: Op): { args: string[]; cwd: string; display: string } {
  const quote = (s: string) => (/[\s"]/.test(s) ? `"${s}"` : s);
  if (manager === "npm") {
    if (scope === "global") {
      const prefix = globalPrefix(root);
      const verb = o.op === "remove" ? "uninstall" : "install";
      const target = o.op === "set" ? o.spec : o.name;
      const args = [verb, "-g", "--prefix", prefix, ...NPM_COMMON, target];
      return { args, cwd: prefix, display: `npm ${verb} -g --prefix ${quote(prefix)} ${NPM_COMMON.join(" ")} ${target}` };
    }
    const args =
      o.op === "set" ? ["install", ...NPM_COMMON, o.spec]
      : o.op === "updateDeep" ? ["update", ...NPM_COMMON, o.name]
      : ["uninstall", ...NPM_COMMON, o.name];
    return { args, cwd: root, display: `cd ${quote(root)} && npm ${args.join(" ")}` };
  }
  // pnpm
  if (scope === "global") {
    // `pnpm remove` rejects --ignore-scripts; scripts are still disabled via npm_config_ignore_scripts.
    const args = o.op === "remove" ? ["remove", "-g", o.name] : ["add", "-g", "--ignore-scripts", o.op === "set" ? o.spec : o.name];
    return { args, cwd: pnpmHome(), display: `pnpm ${args.join(" ")}` };
  }
  const args =
    o.op === "set" ? ["update", ...PNPM_COMMON, o.spec] // keeps dependencies / devDependencies placement
    : o.op === "updateDeep" ? ["update", ...PNPM_COMMON, "--depth", "Infinity", o.name]
    : ["remove", o.name];
  return { args, cwd: root, display: `cd ${quote(root)} && pnpm ${args.join(" ")}` };
}

function runTool(manager: Manager, args: string[], cwd: string): Promise<{ code: number; log: string }> {
  const cli = manager === "pnpm" ? pnpmCli() : npmCli();
  const env: NodeJS.ProcessEnv = { ...process.env, npm_config_ignore_scripts: "true" };
  if (manager === "pnpm") {
    // pnpm refuses global operations unless its global bin dir is on PATH.
    const home = pnpmHome();
    env.PNPM_HOME = home;
    const pathKey = Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "PATH";
    env[pathKey] = [path.join(home, "bin"), home, env[pathKey] ?? ""].join(path.delimiter);
  }
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [cli, ...args],
      { cwd, timeout: 10 * 60_000, windowsHide: true, shell: false, maxBuffer: 20 * 1024 * 1024, env },
      (err, stdout, stderr) => {
        const log = `${stdout}\n${stderr}`.trim().split(/\r?\n/).slice(-60).join("\n");
        const code = err ? (typeof (err as NodeJS.ErrnoException).code === "number" ? Number((err as NodeJS.ErrnoException).code) : 1) : 0;
        resolve({ code, log });
      },
    );
  });
}

// ---------------------------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------------------------

/** <root>/<parent>/... or <root>/@scope/<parent>/... → top-level package that contains this file (npm layout). */
function topLevelParent(sourceFile: string, root: string): string | null {
  const parts = sourceFile.slice(root.length).replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length === 0) return null;
  return parts[0].startsWith("@") && parts[1] ? `${parts[0]}/${parts[1]}` : parts[0];
}

async function findRecord(pm: PM, root: string, name: string, version: string): Promise<Pkg> {
  if (!NAME_RE.test(name) || !VERSION_RE.test(version)) throw new I18nError("common.badRequest");
  const res = await loadResult(pm);
  const rec = res?.packages.find((p) => p.project_root === root && p.name === name && p.version === version);
  if (!rec) throw new I18nError("fix.err.notInScan");
  return rec;
}

function requirePackageJson(root: string) {
  if (!existsSync(/*turbopackIgnore: true*/ path.join(root, "package.json"))) throw new I18nError("fix.err.noPackageJson");
}

/** Smallest fixed version above the installed one, from the saved OSV report. */
async function fixVersionFor(pm: PM, name: string, version: string): Promise<string | null> {
  const report = await loadReport(pm);
  // Per advisory: the nearest fix above the installed version (e.g. 7.5.4 → 7.5.5, not 8.0.1).
  // Then the highest of those, so every advisory on this version is covered.
  const nearest: string[] = [];
  for (const a of report?.advisories ?? []) {
    if (a.kind !== "vuln") continue;
    for (const h of a.hits) {
      if (h.name !== name || h.version !== version) continue;
      const above = h.fixed
        .filter((f) => VERSION_RE.test(f) && (compare(f, version) ?? 0) > 0)
        .sort((x, y) => compare(x, y) ?? 0);
      if (above.length) nearest.push(above[0]);
    }
  }
  nearest.sort((x, y) => compare(x, y) ?? 0);
  return nearest.length ? nearest[nearest.length - 1] : null;
}

async function backupProject(root: string): Promise<string | null> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(dataDir(), "backups", stamp, root.replace(/[:\\/]+/g, "_").replace(/^_+/, ""));
  let copied = 0;
  for (const f of ["package.json", "package-lock.json", "pnpm-lock.yaml"]) {
    const src = path.join(/*turbopackIgnore: true*/ root, f);
    if (existsSync(/*turbopackIgnore: true*/ src)) {
      await fs.mkdir(dir, { recursive: true });
      await fs.copyFile(src, path.join(dir, f));
      copied++;
    }
  }
  return copied ? dir : null;
}

async function rescanAndRecheck(pm: PM) {
  await runScan(pm);
  const after = await loadResult(pm);
  if (after) {
    try {
      await runSecurityCheck(after.packages, after.scanned_at, pm);
    } catch {
      /* offline: the security page will show "stale" until the next check */
    }
  }
  return after;
}

/**
 * Versions of `name` in the folder after an operation. pnpm 10+ moves a global package into a
 * new global group folder on every add/update, so for pnpm globals we look across all groups.
 */
function versionsAfter(pkgs: Pkg[], root: string, name: string, manager: Manager, scope: "project" | "global"): string[] {
  const match = (p: Pkg) =>
    p.name === name &&
    (manager === "pnpm" && scope === "global" ? p.scope === "global" && p.manager === "pnpm" && isTopLevel(p) : p.project_root === root);
  return [...new Set(pkgs.filter(match).map((p) => p.version))];
}

let running = false;

async function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  if (running) throw new I18nError("fix.err.busy");
  running = true;
  try {
    return await fn();
  } finally {
    running = false;
  }
}

// ---------------------------------------------------------------------------------------------
// Fix a vulnerability (target = nearest OSV fix)
// ---------------------------------------------------------------------------------------------

export async function planAction(pm: PM, root: string, name: string, version: string): Promise<UpdateAction> {
  const rec = await findRecord(pm, root, name, version);
  const report = await loadReport(pm);
  if (malwarePackages(report).some((m) => m.name === name && m.version === version)) throw new I18nError("fix.err.malware");
  const fix = await fixVersionFor(pm, name, version);
  if (!fix) throw new I18nError("fix.err.noFix");
  const manager: Manager = pm;
  const base = { manager, root, name, version, fix };

  if (rec.scope === "global") {
    if (isTopLevel(rec)) {
      return { ...base, kind: "global", target: name, ...buildCommand(manager, "global", root, { op: "set", spec: `${name}@${fix}` }) };
    }
    // nested inside another global package: update that parent (npm layout only)
    const parent = manager === "npm" ? topLevelParent(rec.source_file, root) : null;
    if (!parent || !NAME_RE.test(parent)) throw new I18nError("fix.err.noParent");
    return { ...base, kind: "globalParent", target: parent, ...buildCommand(manager, "global", root, { op: "set", spec: `${parent}@latest` }) };
  }

  requirePackageJson(root);
  if (rec.direct) {
    return { ...base, kind: "direct", target: name, ...buildCommand(manager, "project", root, { op: "set", spec: `${name}@${fix}` }) };
  }
  return { ...base, kind: "transitive", target: name, ...buildCommand(manager, "project", root, { op: "updateDeep", name }) };
}

// ---------------------------------------------------------------------------------------------
// Upgrade (target picked in the Updates tab)
// ---------------------------------------------------------------------------------------------

/**
 * The target must be exactly one of the two choices the planner offers (newest compatible, or
 * registry latest), re-verified here against a fresh registry read, and must not be flagged as
 * malware by OSV.
 */
export async function planUpgrade(pm: PM, root: string, name: string, version: string, target: string): Promise<UpdateAction> {
  if (!VERSION_RE.test(target)) throw new I18nError("common.badRequest");
  const rec = await findRecord(pm, root, name, version);
  if (!isTopLevel(rec)) throw new I18nError("upd.err.notDirect");
  const report = await loadReport(pm);
  if (malwarePackages(report).some((m) => m.name === name && m.version === version)) throw new I18nError("fix.err.malware");

  let doc;
  try {
    doc = await fetchDoc(name, true);
  } catch (e) {
    throw new I18nError("reg.err.connect", { msg: (e as Error).message });
  }
  if (!doc) throw new I18nError("reg.err.notFound");
  const allowed = new Set([bestCompatible(version, stableVersions(doc)), doc["dist-tags"]?.latest].filter((v): v is string => !!v));
  if (!allowed.has(target) || (compare(target, version) ?? 0) <= 0) throw new I18nError("upd.err.badTarget");

  let bad: string[];
  try {
    bad = await malwareAdvisoriesFor(name, target);
  } catch (e) {
    throw new I18nError("upd.err.osv", { msg: (e as Error).message });
  }
  if (bad.length) throw new I18nError("upd.err.targetMalware", { ids: bad.join(", ") });

  const manager: Manager = pm;
  const scope = rec.scope === "global" ? "global" : "project";
  if (scope === "project") requirePackageJson(root);
  return {
    kind: scope === "global" ? "global" : "direct",
    manager, root, name, version, fix: target, target: name,
    ...buildCommand(manager, scope, root, { op: "set", spec: `${name}@${target}` }),
  };
}

/** Runs a fix (no target: nearest OSV fix) or an upgrade (target picked in the Updates tab). */
export async function applyAction(pm: PM, root: string, name: string, version: string, target?: string): Promise<UpdateOutcome & { action: UpdateAction }> {
  return exclusive(async () => {
    // re-plan server-side; never trust a client command
    const action = target ? await planUpgrade(pm, root, name, version, target) : await planAction(pm, root, name, version);
    const backup = action.kind === "direct" || action.kind === "transitive" ? await backupProject(root) : null;
    const { code, log } = await runTool(action.manager, action.args, action.cwd);
    if (code !== 0) throw new I18nError("fix.err.npmFailed", { log: log.slice(-1500) });

    const after = await rescanAndRecheck(pm);
    const scope = action.kind === "global" || action.kind === "globalParent" ? "global" : "project";
    const versions = versionsAfter(after?.packages ?? [], root, name, action.manager, scope);
    const stillBad = versions.filter((v) => (compare(v, action.fix) ?? 1) < 0);
    const status = stillBad.length === 0 ? "fixed" : stillBad.length < versions.length ? "partial" : "notFixed";
    return { action, status, after: versions, log, backup };
  });
}

// ---------------------------------------------------------------------------------------------
// Uninstall
// ---------------------------------------------------------------------------------------------

export type UninstallAction = {
  kind: "direct" | "global";
  manager: Manager;
  root: string;
  name: string;
  version: string;
  args: string[];
  cwd: string;
  display: string;
};

export type UninstallOutcome = {
  /** removed: gone from this folder; stillPresent: another package still depends on it */
  status: "removed" | "stillPresent";
  after: string[];
  log: string;
  backup: string | null;
};

/**
 * Only packages the user controls directly can be removed: direct dependencies of a project,
 * or top-level global packages. Nested/transitive copies belong to their parent package.
 * Malicious packages are allowed here on purpose — removing them is the recommended action.
 */
export async function planUninstall(pm: PM, root: string, name: string, version: string): Promise<UninstallAction> {
  const rec = await findRecord(pm, root, name, version);
  if (!isTopLevel(rec)) throw new I18nError("un.err.notDirect");
  const manager: Manager = pm;
  const scope = rec.scope === "global" ? "global" : "project";
  if (scope === "project") requirePackageJson(root);
  return { kind: scope === "global" ? "global" : "direct", manager, root, name, version, ...buildCommand(manager, scope, root, { op: "remove", name }) };
}

export async function applyUninstall(pm: PM, root: string, name: string, version: string): Promise<UninstallOutcome & { action: UninstallAction }> {
  return exclusive(async () => {
    const action = await planUninstall(pm, root, name, version); // re-plan server-side
    const backup = action.kind === "direct" ? await backupProject(root) : null;
    const { code, log } = await runTool(action.manager, action.args, action.cwd);
    if (code !== 0) throw new I18nError("fix.err.npmFailed", { log: log.slice(-1500) });

    const after = await rescanAndRecheck(pm);
    const versions = versionsAfter(after?.packages ?? [], root, name, action.manager, action.kind === "global" ? "global" : "project");
    return { action, status: versions.length === 0 ? "removed" : "stillPresent", after: versions, log, backup };
  });
}
