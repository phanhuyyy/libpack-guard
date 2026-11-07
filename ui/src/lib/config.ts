import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { agentPath } from "./agent";
import { dataDir } from "./data";
import { I18nError } from "./i18n";

export const DEFAULT_MAX_DEPTH = 8;
export const MAX_ROOTS = 50;

export type ScanConfig = {
  roots: string[];
  max_depth: number;
  /** where the effective config came from */
  source: "ui" | "agent" | "default";
};

/** Same list as agent/config.go defaultRoots(). */
export function defaultRoots(): string[] {
  const home = os.homedir();
  const names =
    process.platform === "win32"
      ? ["source", "Documents", "code", "projects", "repos", "Desktop"]
      : ["code", "projects", "src", "dev", "repos", "Documents", "Desktop"];
  return names.map((n) => path.join(/*turbopackIgnore: true*/ home, n));
}

export function uiConfigPath() {
  return path.join(dataDir(), "config.json");
}

async function readJSON(file: string): Promise<{ roots?: string[]; max_depth?: number } | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

/** Mirrors the agent's lookup order: <datadir>/config.json, then config.json next to pkgscan, then defaults. */
export async function readConfig(): Promise<ScanConfig> {
  const candidates: [ScanConfig["source"], string][] = [
    ["ui", uiConfigPath()],
    ["agent", path.join(path.dirname(agentPath()), "config.json")],
  ];
  for (const [source, file] of candidates) {
    const c = await readJSON(file);
    if (!c) continue;
    return {
      roots: c.roots?.length ? c.roots : defaultRoots(),
      max_depth: c.max_depth && c.max_depth > 0 ? c.max_depth : DEFAULT_MAX_DEPTH,
      source,
    };
  }
  return { roots: defaultRoots(), max_depth: DEFAULT_MAX_DEPTH, source: "default" };
}

export async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** Validates and writes <datadir>/config.json (besides security-<pm>.json and backups/). */
export async function saveConfig(input: { roots: unknown; max_depth: unknown }): Promise<ScanConfig> {
  if (!Array.isArray(input.roots) || input.roots.some((r) => typeof r !== "string")) {
    throw new I18nError("set.err.list");
  }
  const depth = Number(input.max_depth);
  if (!Number.isInteger(depth) || depth < 1 || depth > 20) throw new I18nError("set.err.depth");

  const seen = new Set<string>();
  const roots: string[] = [];
  for (const raw of input.roots as string[]) {
    const r = path.resolve(raw.trim());
    if (!path.isAbsolute(raw.trim())) throw new I18nError("set.err.notAbs", { p: raw });
    const key = process.platform === "win32" ? r.toLowerCase() : r;
    if (seen.has(key)) continue;
    if (!(await isDirectory(r))) throw new I18nError("set.err.notExist", { p: r });
    seen.add(key);
    roots.push(r);
  }
  if (roots.length === 0) throw new I18nError("set.err.atLeastOne");
  if (roots.length > MAX_ROOTS) throw new I18nError("set.err.max", { n: MAX_ROOTS });

  await fs.mkdir(dataDir(), { recursive: true });
  const file = uiConfigPath();
  await fs.writeFile(file + ".tmp", JSON.stringify({ roots, max_depth: depth }, null, 2));
  await fs.rename(file + ".tmp", file);
  return { roots, max_depth: depth, source: "ui" };
}

const HIDDEN = new Set(["system volume information", "config.msi", "recovery", "msocache", "perflogs"]);

export type DirListing = {
  path: string;
  parent: string | null;
  dirs: { name: string; path: string; hasProject: boolean }[];
};

/** Lists real subdirectories (no symlinks / junctions, no hidden or system folders). */
export async function listDirs(p: string): Promise<DirListing> {
  const abs = path.resolve(p);
  const entries = await fs.readdir(abs, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory() && !e.isSymbolicLink())
    .map((e) => e.name)
    .filter((n) => !n.startsWith(".") && !n.startsWith("$") && !HIDDEN.has(n.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, "vi", { sensitivity: "base" }))
    .slice(0, 1000)
    .map((name) => {
      const full = path.join(abs, name);
      return {
        name,
        path: full,
        hasProject: existsSync(path.join(full, "package.json")) || existsSync(path.join(full, "node_modules")),
      };
    });
  const parent = path.dirname(abs);
  return { path: abs, parent: parent === abs ? null : parent, dirs };
}

export type Shortcut = { kind: "drive" | "home" | "dir"; label: string; path: string };

/** Starting points for the folder picker: drives (Windows) or "/", home, and existing default roots. */
export function shortcuts(): Shortcut[] {
  const out: Shortcut[] = [];
  if (process.platform === "win32") {
    for (const l of "CDEFGHIJKLMNOPQRSTUVWXYZ") {
      const d = `${l}:\\`;
      if (existsSync(/*turbopackIgnore: true*/ d)) out.push({ kind: "drive", label: `${l}:`, path: d });
    }
  } else {
    out.push({ kind: "drive", label: "/", path: "/" });
  }
  out.push({ kind: "home", label: "", path: os.homedir() });
  for (const r of defaultRoots()) if (existsSync(/*turbopackIgnore: true*/ r)) out.push({ kind: "dir", label: path.basename(r), path: r });
  return out;
}
