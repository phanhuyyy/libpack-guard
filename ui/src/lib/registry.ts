import { compare } from "./semver";

/** npm registry access shared by /api/registry and the updater (server only). */

const REGISTRY = (process.env.NPM_REGISTRY_URL || "https://registry.npmjs.org").replace(/\/+$/, "");
const TTL_MS = 30 * 60_000;

export const NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i;

export type Abbrev = {
  modified?: string;
  "dist-tags"?: Record<string, string>;
  versions?: Record<string, { deprecated?: string }>;
};

const cache = new Map<string, { at: number; doc: Abbrev | null }>();

/** Abbreviated metadata (much smaller than the full document). null = not on the registry. */
export async function fetchDoc(name: string, fresh = false): Promise<Abbrev | null> {
  const hit = cache.get(name);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.doc;
  const res = await fetch(`${REGISTRY}/${name.replace("/", "%2f")}`, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (res.status === 404) {
    cache.set(name, { at: Date.now(), doc: null });
    return null;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = (await res.json()) as Abbrev;
  cache.set(name, { at: Date.now(), doc });
  return doc;
}

/** Stable (no pre-release), non-deprecated versions. */
export function stableVersions(doc: Abbrev): string[] {
  const all = doc.versions ?? {};
  return Object.keys(all).filter((v) => !v.includes("-") && !all[v].deprecated);
}

function parse(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Newest version newer than `installed` with the same major (and same minor when major is 0). */
export function bestCompatible(installed: string, candidates: string[]): string | null {
  const cur = parse(installed);
  if (!cur) return null;
  let best: string | null = null;
  for (const c of candidates) {
    const p = parse(c);
    if (!p || p[0] !== cur[0] || (cur[0] === 0 && p[1] !== cur[1])) continue;
    if ((compare(c, installed) ?? 0) <= 0) continue;
    if (!best || (compare(c, best) ?? 0) > 0) best = c;
  }
  return best;
}
