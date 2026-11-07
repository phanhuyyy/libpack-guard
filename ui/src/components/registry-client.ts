import type { RegistryInfo } from "@/lib/registry-types";

export type Lookup = { info?: RegistryInfo; error?: string };

export async function lookup(name: string, versions: string[]): Promise<Lookup> {
  const q = new URLSearchParams({ name, versions: versions.join(",") });
  try {
    const res = await fetch(`/api/registry?${q}`);
    const body = await res.json();
    return res.ok ? { info: body as RegistryInfo } : { error: body.error ?? `HTTP ${res.status}` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Runs fn over items with limited concurrency, reporting each result as it arrives. */
export async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}
