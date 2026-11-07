import type { Metadata } from "next";
import Link from "next/link";
import { Icon, ScopeBadge } from "@/components/Brand";
import PackageCheck from "@/components/PackageCheck";
import { loadResult } from "@/lib/data";
import { analyzeScripts } from "@/lib/heuristics";
import { getI18n } from "@/lib/i18n-server";
import { loadReport } from "@/lib/security";
import { compare } from "@/lib/semver";

export const dynamic = "force-dynamic";

type SP = Promise<{ name?: string }>;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const { name } = await searchParams;
  return { title: name || "Package" };
}

function safeUrl(u?: string): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default async function PackagePage({ searchParams }: { searchParams: SP }) {
  const [{ name = "" }, { t }, res, report] = await Promise.all([searchParams, getI18n(), loadResult(), loadReport()]);
  const rows = res?.packages.filter((p) => p.name === name) ?? [];

  if (!name || rows.length === 0) {
    return (
      <div className="card empty">
        <h1>{t("pkg.notFound", { name })}</h1>
        <p><Link href="/packages">← {t("pkg.back")}</Link></p>
      </div>
    );
  }

  const meta = rows.find((r) => r.description || r.author || r.homepage) ?? rows[0];
  const license = rows.find((r) => r.license)?.license;
  const versions = [...new Set(rows.map((r) => r.version))].sort((a, b) => compare(b, a) ?? a.localeCompare(b));
  const homepage = safeUrl(meta.homepage);
  const repo = safeUrl(meta.repository);
  const npmUrl = `https://www.npmjs.com/package/${name}`;
  const advisories = (report?.advisories ?? []).filter((a) => a.hits.some((h) => h.name === name));
  const scriptFindings = analyzeScripts(rows);
  const hasMalware = advisories.some((a) => a.kind === "malware");

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/packages" className="eyebrow"><Icon name="back" size={14} /> {t("pkg.back")}</Link>
          <h1 style={{ wordBreak: "break-all" }}>{name}</h1>
          {meta.description && <div className="subtitle">{meta.description}</div>}
        </div>
      </div>

      {(advisories.length > 0 || scriptFindings.length > 0) && (
        <section className={`card${hasMalware ? " alert-card" : ""}`}>
          <div className="card-head">
            <h2><Icon name="shield" /> {t("pkg.securityTitle")}</h2>
            <Link href="/security" className="btn small">{t("pkg.securityPage")}</Link>
          </div>
          {advisories.map((a) => {
            const mine = a.hits.filter((h) => h.name === name);
            const fixed = [...new Set(mine.flatMap((h) => h.fixed))];
            return (
              <div key={a.id} style={{ marginBottom: 12 }}>
                <span className={`badge ${a.kind === "malware" ? "sev-critical" : `sev-${a.severity}`}`} style={{ marginLeft: 0 }}>
                  {a.kind === "malware" ? t("pkg.malware") : t(`sev.${a.severity}`)}
                </span>{" "}
                <a href={a.url} target="_blank" rel="noreferrer"><b>{a.id}</b></a> · {a.summary}
                <div className="small-text muted">
                  {t("pkg.affects", { v: mine.map((h) => h.version).join(", ") })}
                  {fixed.length > 0 && ` · ${t("pkg.fixedIn", { v: fixed.join(", ") })}`}
                </div>
              </div>
            );
          })}
          {scriptFindings.map((s) => (
            <div key={s.version} style={{ marginBottom: 12 }}>
              <span className={`badge ${s.level === "critical" ? "major" : s.level === "high" ? "minor" : "info"}`} style={{ marginLeft: 0 }}>
                {t(`script.${s.level}`)}
              </span>{" "}
              <span className="version">{s.version}</span> {s.reasons.map((r) => t(r)).join(" · ")}
              {Object.entries(s.scripts).map(([hook, text]) => (
                <div key={hook} className="script"><span className="muted">{hook}:</span> <code>{text}</code></div>
              ))}
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2><Icon name="box" /> {t("pkg.info")}</h2>
          <span className="muted small-text">{t("pkg.infoSource")}</span>
        </div>
        <dl className="kv">
          <dt>{t("pkg.versions")}</dt>
          <dd className="chips">{versions.map((v) => <span key={v} className="version">{v}</span>)}</dd>
          <dt>{t("common.license")}</dt>
          <dd>{license || <span className="muted">—</span>}</dd>
          <dt>{t("pkg.author")}</dt>
          <dd>{meta.author || <span className="muted">—</span>}</dd>
          <dt>{t("pkg.installCount")}</dt>
          <dd>{rows.length}</dd>
        </dl>
        <div className="links">
          <a className="btn small" href={npmUrl} target="_blank" rel="noreferrer"><Icon name="external" size={15} /> {t("pkg.npmPage")}</a>
          {homepage && <a className="btn small" href={homepage} target="_blank" rel="noreferrer"><Icon name="globe" size={15} /> {t("pkg.homepage")}</a>}
          {repo && <a className="btn small" href={repo} target="_blank" rel="noreferrer"><Icon name="link" size={15} /> {t("pkg.repo")}</a>}
        </div>
      </section>

      <PackageCheck name={name} versions={versions} />

      <section className="card">
        <div className="card-head">
          <h2><Icon name="folder" /> {t("pkg.installedAt")} <span className="count">({rows.length})</span></h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("common.version")}</th>
                <th>{t("common.type")}</th>
                <th>{t("common.folder")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.version + p.project_root + p.source_file}>
                  <td>
                    <span className="version">{p.version}</span>
                    {p.direct && <span className="badge info">{t("common.direct")}</span>}
                  </td>
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
      </section>
    </>
  );
}
