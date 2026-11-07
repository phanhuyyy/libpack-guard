import { execFile } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { runScan } from "./agent";
import { dataDir, isTopLevelGlobal, loadResult, type Pkg } from "./data";
import { I18nError } from "./i18n";
import { bestCompatible, fetchDoc, stableVersions } from "./registry";
import { loadReport, malwareAdvisoriesFor, malwarePackages, runSecurityCheck } from "./security";
import { compare } from "./semver";

/**
 * One-click fixes for vulnerable packages, run by the local UI server (never by pkgscan).
 * The client only names WHICH installation to fix; the server decides the command itself
 * from the scan + OSV report, so nothing user-typed reaches npm.
 *
 * Guardrails: --ignore-scripts, no shell (node + npm-cli.js via execFile), package.json /
 * lockfile backup before any project change, one update at a time, rescan + re-check after.
 */

export type ActionKind = "direct" | "transitive" | "global" | "globalParent";

export type UpdateAction = {
  kind: ActionKind;
  root: string;
  name: string;
  version: string;
  fix: string;
  /** package that is actually installed/updated (differs from name for globalParent) */
  target: string;
  /** npm arguments, without the npm binary */
  args: string[];
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
const COMMON = ["--ignore-scripts", "--no-audit", "--no-fund"];

function npmCli(): string {
  const cli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (!existsSync(/*turbopackIgnore: true*/ cli)) throw new I18nError("fix.err.noNpm");
  return cli;
}

/** <root>/<parent>/... or <root>/@scope/<parent>/... → top-level package that contains this file. */
function topLevelParent(sourceFile: string, root: string): string | null {
  const parts = sourceFile.slice(root.length).replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length === 0) return null;
  return parts[0].startsWith("@") && parts[1] ? `${parts[0]}/${parts[1]}` : parts[0];
}

/** npm --prefix for a scanned global node_modules dir (Windows: <prefix>/node_modules, else <prefix>/lib/node_modules). */
function globalPrefix(root: string): string {
  return process.platform === "win32" ? path.dirname(root) : path.dirname(path.dirname(root));
}

/** Smallest fixed version above the installed one, from the saved OSV report. */
async function fixVersionFor(name: string, version: string): Promise<string | null> {
  const report = await loadReport();
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

export async function planAction(root: string, name: string, version: string): Promise<UpdateAction> {
  if (!NAME_RE.test(name) || !VERSION_RE.test(version)) throw new I18nError("common.badRequest");
  const res = await loadResult();
  const rec: Pkg | undefined = res?.packages.find((p) => p.project_root === root && p.name === name && p.version === version);
  if (!rec) throw new I18nError("fix.err.notInScan");
  const report = await loadReport();
  if (malwarePackages(report).some((m) => m.name === name && m.version === version)) throw new I18nError("fix.err.malware");

  const fix = await fixVersionFor(name, version);
  if (!fix) throw new I18nError("fix.err.noFix");

  if (rec.scope === "global") {
    const prefix = globalPrefix(root);
    if (isTopLevelGlobal(rec.source_file, root)) {
      const spec = `${name}@${fix}`;
      const args = ["install", "-g", "--prefix", prefix, ...COMMON, spec];
      return { kind: "global", root, name, version, fix, target: name, args, display: `npm install -g --prefix "${prefix}" ${COMMON.join(" ")} ${spec}` };
    }
    const parent = topLevelParent(rec.source_file, root);
    if (!parent || !NAME_RE.test(parent)) throw new I18nError("fix.err.noParent");
    const spec = `${parent}@latest`;
    const args = ["install", "-g", "--prefix", prefix, ...COMMON, spec];
    return { kind: "globalParent", root, name, version, fix, target: parent, args, display: `npm install -g --prefix "${prefix}" ${COMMON.join(" ")} ${spec}` };
  }

  if (!existsSync(/*turbopackIgnore: true*/ path.join(root, "package.json"))) throw new I18nError("fix.err.noPackageJson");
  if (rec.direct) {
    const spec = `${name}@${fix}`;
    const args = ["install", ...COMMON, spec];
    return { kind: "direct", root, name, version, fix, target: name, args, display: `cd "${root}" && npm install ${COMMON.join(" ")} ${spec}` };
  }
  const args = ["update", ...COMMON, name];
  return { kind: "transitive", root, name, version, fix, target: name, args, display: `cd "${root}" && npm update ${COMMON.join(" ")} ${name}` };
}

async function backupProject(root: string): Promise<string | null> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(dataDir(), "backups", stamp, root.replace(/[:\\/]+/g, "_").replace(/^_+/, ""));
  let copied = 0;
  for (const f of ["package.json", "package-lock.json"]) {
    const src = path.join(/*turbopackIgnore: true*/ root, f);
    if (existsSync(/*turbopackIgnore: true*/ src)) {
      await fs.mkdir(dir, { recursive: true });
      await fs.copyFile(src, path.join(dir, f));
      copied++;
    }
  }
  return copied ? dir : null;
}

function runNpm(args: string[], cwd: string): Promise<{ code: number; log: string }> {
  const cli = npmCli();
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [cli, ...args],
      { cwd, timeout: 10 * 60_000, windowsHide: true, shell: false, maxBuffer: 20 * 1024 * 1024, env: { ...process.env, npm_config_ignore_scripts: "true" } },
      (err, stdout, stderr) => {
        const log = `${stdout}\n${stderr}`.trim().split(/\r?\n/).slice(-60).join("\n");
        const code = err ? (typeof (err as NodeJS.ErrnoException).code === "number" ? Number((err as NodeJS.ErrnoException).code) : 1) : 0;
        resolve({ code, log });
      },
    );
  });
}

/**
 * Upgrade a direct dependency / top-level global package to a version the user picked in the
 * Updates tab. The target must be exactly one of the two choices the planner offers
 * (newest compatible, or registry latest), re-verified here against a fresh registry read,
 * and must not be flagged as malware by OSV.
 */
export async function planUpgrade(root: string, name: string, version: string, target: string): Promise<UpdateAction> {
  if (!NAME_RE.test(name) || !VERSION_RE.test(version) || !VERSION_RE.test(target)) throw new I18nError("common.badRequest");
  const res = await loadResult();
  const rec = res?.packages.find((p) => p.project_root === root && p.name === name && p.version === version);
  if (!rec) throw new I18nError("fix.err.notInScan");
  const isGlobal = rec.scope === "global";
  if (isGlobal ? !isTopLevelGlobal(rec.source_file, root) : !rec.direct) throw new I18nError("upd.err.notDirect");
  const report = await loadReport();
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

  const spec = `${name}@${target}`;
  if (isGlobal) {
    const prefix = globalPrefix(root);
    const args = ["install", "-g", "--prefix", prefix, ...COMMON, spec];
    return { kind: "global", root, name, version, fix: target, target: name, args, display: `npm install -g --prefix "${prefix}" ${COMMON.join(" ")} ${spec}` };
  }
  if (!existsSync(/*turbopackIgnore: true*/ path.join(root, "package.json"))) throw new I18nError("fix.err.noPackageJson");
  const args = ["install", ...COMMON, spec];
  return { kind: "direct", root, name, version, fix: target, target: name, args, display: `cd "${root}" && npm install ${COMMON.join(" ")} ${spec}` };
}

let running = false;

/** Runs a fix (no target: nearest OSV fix) or an upgrade (target picked in the Updates tab). */
export async function applyAction(root: string, name: string, version: string, target?: string): Promise<UpdateOutcome & { action: UpdateAction }> {
  if (running) throw new I18nError("fix.err.busy");
  running = true;
  try {
    // re-plan server-side; never trust a client command
    const action = target ? await planUpgrade(root, name, version, target) : await planAction(root, name, version);
    const backup = action.kind === "direct" || action.kind === "transitive" ? await backupProject(root) : null;
    const cwd = action.kind === "global" || action.kind === "globalParent" ? globalPrefix(root) : root;
    const { code, log } = await runNpm(action.args, cwd);
    if (code !== 0) throw new I18nError("fix.err.npmFailed", { log: log.slice(-1500) });

    await runScan();
    const after = await loadResult();
    const versions = [...new Set((after?.packages ?? []).filter((p) => p.project_root === root && p.name === name).map((p) => p.version))];
    const stillBad = versions.filter((v) => (compare(v, action.fix) ?? 1) < 0);
    const status = stillBad.length === 0 ? "fixed" : stillBad.length < versions.length ? "partial" : "notFixed";
    if (after) {
      try {
        await runSecurityCheck(after.packages, after.scanned_at);
      } catch {
        /* offline: the security page will show "stale" until the next check */
      }
    }
    return { action, status, after: versions, log, backup };
  } finally {
    running = false;
  }
}
