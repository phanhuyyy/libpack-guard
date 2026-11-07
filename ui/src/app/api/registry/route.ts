import { getI18n } from "@/lib/i18n-server";
import { bestCompatible, fetchDoc, NAME_RE, stableVersions, type Abbrev } from "@/lib/registry";
import type { RegistryInfo } from "@/lib/registry-types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name") ?? "";
  const { t } = await getI18n();
  if (!NAME_RE.test(name) || name.length > 214) {
    return Response.json({ error: t("reg.err.invalidName") }, { status: 400 });
  }
  const versions = (url.searchParams.get("versions") ?? "").split(",").filter(Boolean).slice(0, 100);
  let doc: Abbrev | null;
  try {
    doc = await fetchDoc(name);
  } catch (e) {
    return Response.json({ error: t("reg.err.connect", { msg: (e as Error).message }) }, { status: 502 });
  }
  if (!doc) {
    return Response.json({ error: t("reg.err.notFound") }, { status: 404 });
  }
  const all = doc.versions ?? {};
  const latest = doc["dist-tags"]?.latest ?? null;
  const info: RegistryInfo = {
    name,
    latest,
    modified: doc.modified ?? null,
    versionCount: Object.keys(all).length,
    latestDeprecated: (latest && all[latest]?.deprecated) || null,
    deprecated: {},
    missing: [],
    inMajor: {},
  };
  const stable = stableVersions(doc);
  for (const v of versions) {
    if (!all[v]) info.missing.push(v);
    else if (all[v].deprecated) info.deprecated[v] = all[v].deprecated!;
    info.inMajor[v] = bestCompatible(v, stable);
  }
  return Response.json(info);
}
