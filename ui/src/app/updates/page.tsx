import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Brand";
import UpdatePlanner, { type Candidate } from "@/components/UpdatePlanner";
import { isTopLevelGlobal, loadResult } from "@/lib/data";
import { getI18n } from "@/lib/i18n-server";
import { loadReport, malwarePackages } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.updates") };
}

export default async function UpdatesPage() {
  const [{ t, fn }, res, report] = await Promise.all([getI18n(), loadResult(), loadReport()]);
  if (!res) {
    return (
      <div className="card empty">
        <h1>{t("common.noData")}</h1>
        <p><Link href="/">{t("common.noDataHint")}</Link></p>
      </div>
    );
  }

  // Only packages the user controls directly: direct deps of projects, top-level global installs.
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  const rootsWithDirect = new Set<string>();
  const projectRoots = new Set<string>();
  for (const p of res.packages) {
    if (p.scope === "project") projectRoots.add(p.project_root);
    const eligible = p.scope === "global" ? isTopLevelGlobal(p.source_file, p.project_root) : !!p.direct;
    if (!eligible) continue;
    if (p.scope === "project") rootsWithDirect.add(p.project_root);
    const key = `${p.project_root}\u0000${p.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ root: p.project_root, scope: p.scope, name: p.name, version: p.version });
  }
  const skipped = [...projectRoots].filter((r) => !rootsWithDirect.has(r)).length;

  const malware = malwarePackages(report).map((m) => `${m.name}@${m.version}`);
  const vulnFixes: Record<string, string[]> = {};
  for (const a of report?.advisories ?? []) {
    if (a.kind !== "vuln") continue;
    for (const h of a.hits) (vulnFixes[`${h.name}@${h.version}`] ??= []).push(...h.fixed);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow"><Icon name="refresh" size={14} /> {t("nav.updates")}</div>
          <h1>{t("upd.title")}</h1>
          <div className="subtitle">{t("upd.subtitle")}</div>
        </div>
      </div>

      <p className="notice"><Icon name="shield" size={16} /> <span>{t("upd.safety")}</span></p>

      <UpdatePlanner
        candidates={candidates}
        windows={res.machine.os === "windows"}
        malware={malware}
        vulnFixes={vulnFixes}
        scopeText={t("upd.scope", { n: fn(candidates.length), p: fn(new Set(candidates.map((c) => c.root)).size) })}
        skippedText={skipped ? t("upd.skipped", { n: skipped }) : null}
      />
    </>
  );
}
