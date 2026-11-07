import type { Metadata } from "next";
import Link from "next/link";
import { Icon, ScopeBadge } from "@/components/Brand";
import ProjectTable from "@/components/ProjectTable";
import { isTopLevelGlobal, loadResult } from "@/lib/data";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

type SP = Promise<{ root?: string; all?: string }>;

const folderName = (root: string) => root.split(/[\\/]/).filter(Boolean).pop() ?? root;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const { root = "" } = await searchParams;
  return { title: folderName(root) || "Project" };
}


export default async function ProjectPage({ searchParams }: { searchParams: SP }) {
  const [{ root = "", all }, { t, fd }, res] = await Promise.all([searchParams, getI18n(), loadResult()]);
  const pkgs = res?.packages.filter((p) => p.project_root === root) ?? [];

  if (!root || pkgs.length === 0) {
    return (
      <div className="card empty">
        <h1>{t("proj.notFound")}</h1>
        <p><Link href="/">← {t("proj.back")}</Link></p>
      </div>
    );
  }

  const isGlobal = pkgs[0].scope === "global";
  const directCount = pkgs.filter((p) => p.direct).length;
  const topCount = isGlobal ? pkgs.filter((p) => isTopLevelGlobal(p.source_file, root)).length : directCount;
  // Default: direct dependencies (if the lockfile says which). Global dirs: top-level packages only.
  const canFilter = directCount > 0 || isGlobal;
  const showAll = all === "1" || !canFilter;
  const rows = pkgs
    .filter((p) => showAll || (isGlobal ? isTopLevelGlobal(p.source_file, root) : p.direct))
    .map((p) => ({ name: p.name, version: p.version, direct: !!p.direct, license: p.license }));
  const href = (a: boolean) => `/project?root=${encodeURIComponent(root)}${a ? "&all=1" : ""}`;

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/" className="eyebrow"><Icon name="back" size={14} /> {t("proj.back")}</Link>
          <h1 style={{ wordBreak: "break-all" }}>
            {isGlobal ? t("proj.globalTitle") : folderName(root)} <ScopeBadge scope={pkgs[0].scope} t={t} />
          </h1>
          <div className="subtitle">
            <span className="path">{root}</span>
            <span><Icon name="clock" size={15} /> {fd(res!.scanned_at)}</span>
          </div>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <h2><Icon name="layers" /> {t("proj.list")}</h2>
          {canFilter && (
            <div className="segmented" role="tablist">
              <Link href={href(false)} role="tab" aria-selected={!showAll} className={`seg-link${showAll ? "" : " on"}`}>
                {isGlobal ? t("proj.topLevel", { n: topCount }) : t("proj.directOnly", { n: topCount })}
              </Link>
              <Link href={href(true)} role="tab" aria-selected={showAll} className={`seg-link${showAll ? " on" : ""}`}>
                {t("proj.all", { n: pkgs.length })}
              </Link>
            </div>
          )}
        </div>
        <ProjectTable rows={rows} />
      </section>
    </>
  );
}
