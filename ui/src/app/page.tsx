import type { Metadata } from "next";
import Link from "next/link";
import { AppMark, Icon, ScopeBadge } from "@/components/Brand";
import ScanButton from "@/components/ScanButton";
import SecurityBanner from "@/components/SecurityBanner";
import { loadResult, resultPath, summarizeProjects } from "@/lib/data";
import { getI18n } from "@/lib/i18n-server";
import { loadReport } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  // the layout's title template does not apply to the page in its own segment
  return { title: { absolute: `${t("nav.overview")} · libpack` } };
}

export default async function Home() {
  const { t, fd, fn, pm } = await getI18n();
  const [res, report] = await Promise.all([loadResult(pm), loadReport(pm)]);

  if (!res) {
    return (
      <div className="card empty">
        <AppMark size={72} />
        <h1>{t("home.welcome")}</h1>
        <p><span className="badge info" style={{ marginLeft: 0 }}>{pm}</span></p>
        <p className="muted">{t("home.welcomeText")}</p>
        <p className="muted small-text">{t("home.savedAt", { path: resultPath(pm) })}</p>
        <ScanButton first />
      </div>
    );
  }

  const projects = summarizeProjects(res.packages);
  const projectCount = projects.filter((p) => p.scope === "project").length;
  const uniqueNames = new Set(res.packages.map((p) => p.name)).size;
  const globalCount = res.packages.filter((p) => p.scope === "global").length;
  const maxTotal = Math.max(1, ...projects.map((p) => p.total));

  const stats = [
    { cls: "primary", icon: "layers", value: fn(res.packages.length), label: t("home.stat.installs") },
    { cls: "", icon: "box", value: fn(uniqueNames), label: t("home.stat.unique") },
    { cls: "", icon: "folder", value: fn(projectCount), label: t("home.stat.projects") },
    { cls: "", icon: "globe", value: fn(globalCount), label: t("home.stat.global") },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow"><Icon name="layers" size={14} /> {t("nav.overview")}</div>
          <h1>{t("home.title", { host: res.machine.hostname, pm })}</h1>
          <div className="subtitle">
            <span><Icon name="clock" size={15} /> {t("common.scannedAt", { t: fd(res.scanned_at) })}</span>
            <span><Icon name="computer" size={15} /> {res.machine.os}/{res.machine.arch} · {res.machine.username}</span>
          </div>
        </div>
        <ScanButton />
      </div>

      <SecurityBanner pkgs={res.packages} report={report} t={t} />

      <div className="stats">
        {stats.map((s) => (
          <div key={s.label} className={`stat ${s.cls}`}>
            <div className="ico"><Icon name={s.icon} size={22} /></div>
            <div><div className="value">{s.value}</div><div className="label">{s.label}</div></div>
          </div>
        ))}
      </div>

      <section className="card">
        <div className="card-head">
          <h2><Icon name="folder" /> {t("home.projects")} <span className="count">({projects.length})</span></h2>
          <Link href="/packages" className="btn small"><Icon name="search" size={15} /> {t("nav.search")}</Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("common.folder")}</th>
                <th>{t("common.type")}</th>
                <th>{t("home.col.direct")}</th>
                <th>{t("home.col.total")}</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.root}>
                  <td className="path">
                    <Link href={`/project?root=${encodeURIComponent(p.root)}`}>{p.root}</Link>
                  </td>
                  <td><ScopeBadge scope={p.scope} t={t} /></td>
                  <td className="num">{p.direct || <span className="muted">—</span>}</td>
                  <td style={{ minWidth: 170 }}>
                    <div className="row" style={{ margin: 0, flexWrap: "nowrap" }}>
                      <span className="num" style={{ minWidth: 44, fontWeight: 600 }}>{fn(p.total)}</span>
                      <div className="bar"><span style={{ width: `${(p.total / maxTotal) * 100}%` }} /></div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2><Icon name="search" /> {t("home.roots")}</h2>
          <Link href="/settings" className="btn small"><Icon name="folder" size={15} /> {t("home.change")}</Link>
        </div>
        <div className="chips">
          {res.roots.map((r) => (
            <code key={r}>{r}</code>
          ))}
        </div>
      </section>
    </>
  );
}
