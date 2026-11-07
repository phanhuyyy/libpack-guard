import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export type Pkg = {
  ecosystem: "npm";
  name: string;
  version: string;
  scope: "global" | "project";
  project_root: string;
  source_file: string;
  direct?: boolean;
  description?: string;
  license?: string;
  author?: string;
  homepage?: string;
  repository?: string;
  install_scripts?: Record<string, string>;
  has_install_script?: boolean;
};

export type ScanResult = {
  machine: { hostname: string; os: string; arch: string; username: string };
  agent_version: string;
  scanned_at: string;
  roots: string[];
  packages: Pkg[];
};

/** Same logic as agent/datadir.go. */
export function dataDir(): string {
  if (process.env.LIBPACK_DATA_DIR) return process.env.LIBPACK_DATA_DIR;
  const home = os.homedir();
  switch (process.platform) {
    case "win32":
      return path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "libpack");
    case "darwin":
      return path.join(home, "Library", "Application Support", "libpack");
    default:
      return path.join(process.env.XDG_DATA_HOME || path.join(home, ".local", "share"), "libpack");
  }
}

export function resultPath(): string {
  return path.join(dataDir(), "latest.json");
}

let cache: { mtimeMs: number; data: ScanResult } | null = null;

/** Returns the latest scan, or null if no scan has been run yet. Re-parses only when the file changes. */
export async function loadResult(): Promise<ScanResult | null> {
  const file = resultPath();
  let stat;
  try {
    stat = await fs.stat(file);
  } catch {
    return null;
  }
  if (cache && cache.mtimeMs === stat.mtimeMs) return cache.data;
  let data: ScanResult;
  try {
    data = JSON.parse(await fs.readFile(file, "utf8")) as ScanResult;
  } catch (e) {
    console.error(`latest.json is corrupt, ignoring: ${(e as Error).message}`);
    return null; // treated as "no scan yet": the user can simply scan again
  }
  data.packages ??= [];
  cache = { mtimeMs: stat.mtimeMs, data };
  return data;
}

export type ProjectSummary = {
  root: string;
  scope: "global" | "project";
  total: number;
  direct: number;
};

export function summarizeProjects(pkgs: Pkg[]): ProjectSummary[] {
  const map = new Map<string, ProjectSummary>();
  for (const p of pkgs) {
    let s = map.get(p.project_root);
    if (!s) {
      s = { root: p.project_root, scope: p.scope, total: 0, direct: 0 };
      map.set(p.project_root, s);
    }
    s.total++;
    if (p.direct) s.direct++;
  }
  return [...map.values()].sort((a, b) =>
    a.scope !== b.scope ? (a.scope === "global" ? -1 : 1) : a.root.localeCompare(b.root),
  );
}

/** For a global node_modules dir: true for <root>/<name> and <root>/@scope/<name>, false for nested deps. */
export function isTopLevelGlobal(sourceFile: string, root: string): boolean {
  const rel = sourceFile.slice(root.length).replace(/\\/g, "/").replace(/^\//, "");
  return !rel.includes("node_modules/");
}
