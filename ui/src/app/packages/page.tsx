import type { Metadata } from "next";
import Link from "next/link";
import { Icon, ScopeBadge } from "@/components/Brand";
import { loadResult } from "@/lib/data";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.search") };
}

const MAX_ROWS = 500;

type SP = Promise<{ q?: string; v?: string; exact?: string }>;

export default async function PackagesPage({ searchParams }: { searchParams: SP }) {
  const [{ q = "", v = "", exact }, { t, fd, fn }, res] = await Promise.all([searchParams, getI18n(), loadResult()]);
  const query = q.trim().toLowerCase();
  const ver = v.trim();
  const isExact = exact === "1";

  const matches =
    res && query
      ? res.packages.filter((p) => {
          const n = p.name.toLowerCase();
          return (isExact ? n === query : n.includes(query)) && (!ver || p.version === ver);
        })
      : [];
  const dirs = new Set(matches.map((m) => m.project_root)).size;

  return (
    <>
      <div className="search-hero">
        <div className="eyebrow"><Icon name="search" size={14} /> {t("search.eyebrow")}</div>
        <h1>{t("search.title")}</h1>
        <p>{t("search.subtitle")}</p>
        <form className="search" method="get" role="search">
          <div className="field">
            <Icon name="search" size={18} />
            <input type="text" name="q" defaultValue={q} placeholder={t("search.placeholder")} aria-label={t("search.placeholder")} autoFocus />
          </div>
          <input type="text" className="ver" name="v" defaultValue={v} placeholder={t("search.versionPlaceholder")} aria-label={t("search.versionPlaceholder")} />
          <label>
            <input type="checkbox" name="exact" value="1" defaultChecked={isExact} /> {t("search.exact")}
          </label>
          <button className="primary" type="submit">{t("search.submit")}</button>
        </form>
      </div>

      {!res && <p className="notice err"><Icon name="alert" size={16} /> <span>{t("common.noData")} — {t("common.noDataHint")}</span></p>}

      {res && query && (
        <section className="card">
          <div className="card-head">
            <h2>{matches.length === 0 ? t("search.none") : t("search.result", { n: fn(matches.length), d: fn(dirs) })}</h2>
            <span className="muted small-text">{t("search.asOf", { t: fd(res.scanned_at) })}</span>
          </div>
          {matches.length === 0 && (
            <p className="muted" style={{ margin: 0 }}>
              {t("search.noneDetail", { q, v: ver ? t("search.noneVersion", { v: ver }) : "" })}
            </p>
          )}
          {matches.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("common.package")}</th>
                    <th>{t("common.version")}</th>
                    <th>{t("common.type")}</th>
                    <th>{t("common.folder")}</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.slice(0, MAX_ROWS).map((p) => (
                    <tr key={p.name + p.version + p.project_root + p.source_file}>
                      <td>
                        <Link className="pkg-name" href={`/package?name=${encodeURIComponent(p.name)}`}>{p.name}</Link>
                        {p.direct && <span className="badge info">{t("common.direct")}</span>}
                      </td>
                      <td><span className="version">{p.version}</span></td>
                      <td><ScopeBadge scope={p.scope} t={t} /></td>
                      <td className="path">
                        <Link href={`/project?root=${encodeURIComponent(p.project_root)}`}>{p.project_root}</Link>
                        <div className="muted small-text" title={p.source_file}>{p.source_file.slice(p.project_root.length)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {matches.length > MAX_ROWS && <p className="muted" style={{ padding: "12px 0 0" }}>{t("search.truncated", { n: MAX_ROWS })}</p>}
        </section>
      )}
    </>
  );
}
