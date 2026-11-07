import { promises as fs } from "node:fs";
import path from "node:path";
import { dataDir, type Pkg } from "./data";
import type { PM } from "./pm";

const OSV = "https://api.osv.dev/v1";
const BATCH = 1000;

export type Severity = "critical" | "high" | "moderate" | "low" | "unknown";

export type Advisory = {
  id: string;
  kind: "malware" | "vuln";
  severity: Severity;
  summary: string;
  aliases: string[];
  published?: string;
  url: string;
  /** affected name@version pairs found on this machine, with fixed versions per package name */
  hits: { name: string; version: string; fixed: string[] }[];
};

export type SecurityReport = {
  checked_at: string;
  scan_at: string;
  queried: number;
  advisories: Advisory[];
  errors: string[];
};

export const severityRank: Record<Severity, number> = { critical: 0, high: 1, moderate: 2, low: 3, unknown: 4 };

/** Malware advisories grouped per affected name@version (one package can match several advisories). */
export function malwarePackages(report: SecurityReport | null) {
  const map = new Map<string, { name: string; version: string; advisories: Advisory[] }>();
  for (const a of report?.advisories ?? []) {
    if (a.kind !== "malware") continue;
    for (const h of a.hits) {
      const key = `${h.name}@${h.version}`;
      const g = map.get(key) ?? { name: h.name, version: h.version, advisories: [] };
      g.advisories.push(a);
      map.set(key, g);
    }
  }
  return [...map.values()].sort((x, y) => x.name.localeCompare(y.name));
}

function reportPath(pm: PM) {
  return path.join(dataDir(), `security-${pm}.json`);
}

export async function loadReport(pm: PM): Promise<SecurityReport | null> {
  try {
    return JSON.parse(await fs.readFile(reportPath(pm), "utf8")) as SecurityReport;
  } catch {
    return null;
  }
}

async function saveReport(r: SecurityReport, pm: PM) {
  await fs.mkdir(dataDir(), { recursive: true });
  const file = reportPath(pm);
  await fs.writeFile(file + ".tmp", JSON.stringify(r));
  await fs.rename(file + ".tmp", file);
}

type OsvVuln = {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  published?: string;
  database_specific?: { severity?: string; cwe_ids?: string[] };
  affected?: {
    package?: { name?: string; ecosystem?: string };
    ranges?: { events?: { fixed?: string }[] }[];
  }[];
};

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`OSV HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function getVuln(id: string): Promise<OsvVuln> {
  const res = await fetch(`${OSV}/vulns/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!res.ok) throw new Error(`OSV ${id}: ${res.status}`);
  return (await res.json()) as OsvVuln;
}

/**
 * Structured signals only (keyword matching on descriptions gave false positives such as
 * "a malicious package could ..." in ordinary path-traversal advisories):
 *  - OpenSSF malicious-packages entries: MAL-* id or alias
 *  - GitHub malware advisories: CWE-506 "Embedded Malicious Code"
 */
function isMalware(v: OsvVuln): boolean {
  if (v.id.startsWith("MAL-") || (v.aliases ?? []).some((a) => a.startsWith("MAL-"))) return true;
  return (v.database_specific?.cwe_ids ?? []).includes("CWE-506");
}

/**
 * Asks OSV about one exact name@version (used before upgrading to it).
 * Returns the ids of malware advisories (empty = none known). Throws if OSV is unreachable.
 */
export async function malwareAdvisoriesFor(name: string, version: string): Promise<string[]> {
  const res = await postJSON<{ vulns?: OsvVuln[] }>(`${OSV}/query`, { package: { name, ecosystem: "npm" }, version });
  return (res.vulns ?? []).filter(isMalware).map((v) => v.id);
}

function severityOf(v: OsvVuln): Severity {
  if (isMalware(v)) return "critical";
  switch ((v.database_specific?.severity ?? "").toUpperCase()) {
    case "CRITICAL": return "critical";
    case "HIGH": return "high";
    case "MODERATE":
    case "MEDIUM": return "moderate";
    case "LOW": return "low";
    default: return "unknown";
  }
}

const running = new Map<PM, Promise<SecurityReport>>();

/**
 * Sends only package names + versions (no paths, no machine info) to api.osv.dev
 * and stores the result in <datadir>/security-<pm>.json.
 */
export function runSecurityCheck(pkgs: Pkg[], scanAt: string, pm: PM): Promise<SecurityReport> {
  const cur = running.get(pm);
  if (cur) return cur;
  const p = doCheck(pkgs, scanAt, pm).finally(() => {
    running.delete(pm);
  });
  running.set(pm, p);
  return p;
}

async function doCheck(pkgs: Pkg[], scanAt: string, pm: PM): Promise<SecurityReport> {
  const pairs = [...new Map(pkgs.map((p) => [`${p.name}@${p.version}`, { name: p.name, version: p.version }])).values()];
  const errors: string[] = [];
  const idToPairs = new Map<string, { name: string; version: string }[]>();

  for (let i = 0; i < pairs.length; i += BATCH) {
    const chunk = pairs.slice(i, i + BATCH);
    const body = { queries: chunk.map((p) => ({ package: { name: p.name, ecosystem: "npm" }, version: p.version })) };
    const res = await postJSON<{ results: { vulns?: { id: string }[] }[] }>(`${OSV}/querybatch`, body);
    res.results.forEach((r, j) => {
      for (const v of r.vulns ?? []) {
        const list = idToPairs.get(v.id) ?? [];
        list.push(chunk[j]);
        idToPairs.set(v.id, list);
      }
    });
  }

  const ids = [...idToPairs.keys()];
  const details = new Map<string, OsvVuln>();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(8, ids.length) }, async () => {
      while (next < ids.length) {
        const id = ids[next++];
        try {
          details.set(id, await getVuln(id));
        } catch (e) {
          errors.push((e as Error).message);
          details.set(id, { id });
        }
      }
    }),
  );

  const advisories: Advisory[] = ids.map((id) => {
    const v = details.get(id)!;
    const fixedFor = (name: string) =>
      (v.affected ?? [])
        .filter((a) => a.package?.name === name && (a.package?.ecosystem ?? "npm").toLowerCase() === "npm")
        .flatMap((a) => (a.ranges ?? []).flatMap((r) => (r.events ?? []).map((e) => e.fixed).filter((f): f is string => !!f)));
    return {
      id,
      kind: isMalware(v) ? "malware" : "vuln",
      severity: severityOf(v),
      summary: v.summary || (v.details ?? "").split("\n")[0].slice(0, 300) || "—",
      aliases: v.aliases ?? [],
      published: v.published,
      url: `https://osv.dev/vulnerability/${id}`,
      hits: idToPairs.get(id)!.map((p) => ({ ...p, fixed: [...new Set(fixedFor(p.name))] })),
    };
  });
  advisories.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.id.localeCompare(b.id));

  const report: SecurityReport = {
    checked_at: new Date().toISOString(),
    scan_at: scanAt,
    queried: pairs.length,
    advisories,
    errors: [...new Set(errors)].slice(0, 10),
  };
  await saveReport(report, pm);
  return report;
}
