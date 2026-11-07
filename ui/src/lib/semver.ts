type Parsed = { nums: [number, number, number]; pre: string };

function parse(v: string): Parsed | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(v.trim());
  if (!m) return null;
  return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? "" };
}

function cmpPre(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return 1; // release > prerelease
  if (!b) return -1;
  const pa = a.split("."), pb = b.split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    const na = /^\d+$/.test(pa[i]) ? Number(pa[i]) : NaN;
    const nb = /^\d+$/.test(pb[i]) ? Number(pb[i]) : NaN;
    if (!isNaN(na) && !isNaN(nb)) {
      if (na !== nb) return na - nb;
    } else if (pa[i] !== pb[i]) {
      return pa[i] < pb[i] ? -1 : 1;
    }
  }
  return 0;
}

export function compare(a: string, b: string): number | null {
  const pa = parse(a), pb = parse(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] - pb.nums[i];
  return cmpPre(pa.pre, pb.pre);
}

export type Diff = "current" | "major" | "minor" | "patch" | "prerelease" | "ahead" | "unknown";

/** How far `installed` is behind `latest`. */
export function diff(installed: string, latest: string): Diff {
  const c = compare(installed, latest);
  if (c === null) return "unknown";
  if (c === 0) return "current";
  if (c > 0) return "ahead";
  const a = parse(installed)!, b = parse(latest)!;
  if (a.nums[0] !== b.nums[0]) return "major";
  if (a.nums[1] !== b.nums[1]) return "minor";
  if (a.nums[2] !== b.nums[2]) return "patch";
  return "prerelease";
}
