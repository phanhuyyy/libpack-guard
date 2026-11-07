import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Brand";
import FixButton from "@/components/FixButton";
import UninstallButton from "@/components/UninstallButton";
import SecurityCheckButton from "@/components/SecurityCheckButton";
import { loadResult, type Pkg } from "@/lib/data";
import { analyzeScripts } from "@/lib/heuristics";
import type { T } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { loadReport, malwarePackages, type Advisory } from "@/lib/security";
import { compare } from "@/lib/semver";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.security") };
}

function installsOf(pkgs: Pkg[], name: string, version: string) {
  return pkgs.filter((p) => p.name === name && p.version === version);
}

/** Smallest fixed version above the installed one (the upgrade the user actually needs). */
function nearestFix(installed: string, fixed: string[]): string | null {
  const above = fixed.filter((f) => (compare(f, installed) ?? 0) > 0);
  if (above.length === 0) return null;
  return above.sort((a, b) => compare(a, b) ?? 0)[0];
}

function Where({ installs, t }: { installs: Pkg[]; t: T }) {
  const roots = [...new Set(installs.map((i) => i.project_root))];
  return (
    <>
      {roots.slice(0, 3).map((r) => (
        <div key={r}>
          <Link href={`/project?root=${encodeURIComponent(r)}`}>{r}</Link>
        </div>
      ))}
      {roots.length > 3 && <div className="muted">{t("sec.more", { n: roots.length - 3 })}</div>}
    </>
  );
}

function PkgLink({ name, version }: { name: string; version: string }) {
  return (
    <>
      <Link className="pkg-name" href={`/package?name=${encodeURIComponent(name)}`}>{name}</Link>{" "}
      <span className="version">{version}</span>
    </>
  );
}

export default async function SecurityPage() {
  const { t, fd, fn, pm } = await getI18n();
  const [res, report] = await Promise.all([loadResult(pm), loadReport(pm)]);
  if (!res) {
    return (
      <div className="card empty">
        <h1>{t("common.noData")}</h1>
        <p><Link href="/">{t("common.noDataHint")}</Link></p>
      </div>
    );
  }

  const scripts = analyzeScripts(res.packages);
  const suspicious = scripts.filter((s) => s.level !== "info");
  const infoScripts = scripts.filter((s) => s.level === "info");

  const advisories = report?.advisories ?? [];
  const malware = malwarePackages(report);
  const vulns = advisories.filter((a) => a.kind === "vuln");
  const highVulns = vulns.filter((v) => v.severity === "critical" || v.severity === "high");
  const stale = report && report.scan_at !== res.scanned_at;
  const rowsOf = (list: Advisory[]) => list.flatMap((a) => a.hits.map((h) => ({ a, h })));

  const stats = [
    { cls: malware.length ? "danger" : "", icon: "bug", value: report ? fn(malware.length) : "—", label: t("sec.stat.malware") },
    { cls: suspicious.length ? "warning" : "", icon: "terminal", value: fn(suspicious.length), label: t("sec.stat.scripts") },
    { cls: "", icon: "alert", value: report ? fn(highVulns.length) : "—", label: t("sec.stat.high") },
    { cls: "", icon: "shield", value: report ? fn(vulns.length - highVulns.length) : "—", label: t("sec.stat.other") },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow"><Icon name="shield" size={14} /> {t("nav.security")}</div>
          <h1>{t("sec.title")}</h1>
          <div className="subtitle">
            <span><Icon name="clock" size={15} /> {t("common.scannedAt", { t: fd(res.scanned_at) })}</span>
            <span>
              <Icon name="shield" size={15} />{" "}
              {report ? t("sec.checkedAt", { t: fd(report.checked_at), n: fn(report.queried) }) : t("sec.notChecked")}
            </span>
          </div>
        </div>
        <SecurityCheckButton again={!!report} />
      </div>

      <p className="notice"><Icon name="globe" size={16} /> <span>{t("sec.privacy")}</span></p>
      {stale && <p className="notice err"><Icon name="alert" size={16} /> <span>{t("sec.stale")}</span></p>}
      {report && report.errors.length > 0 && (
        <p className="notice err"><Icon name="alert" size={16} /> <span>{t("sec.partial", { e: report.errors.join("; ") })}</span></p>
      )}

      <div className="stats">
        {stats.map((s) => (
          <div key={s.label} className={`stat ${s.cls}`}>
            <div className="ico"><Icon name={s.icon} size={22} /></div>
            <div><div className="value">{s.value}</div><div className="label">{s.label}</div></div>
          </div>
        ))}
      </div>

      {/* ---------- Malware ---------- */}
      {malware.length > 0 && (
        <section className="card alert-card">
          <div className="card-head">
            <h2><Icon name="bug" /> {t("sec.malware.title")}</h2>
          </div>
          <div className="steps">
            <b>{t("sec.malware.todo")}</b>
            <ol>
              <li>{t("sec.malware.s1")}</li>
              <li>{t("sec.malware.s2")}</li>
              <li>{t("sec.malware.s3")}</li>
              <li>{t("sec.malware.s4")}</li>
            </ol>
          </div>
          <div className="table-wrap">
            <table className="fixed mal">
              <thead><tr><th>{t("common.package")}</th><th>{t("sec.col.alert")}</th><th>{t("common.location")}</th><th>{t("un.col")}</th></tr></thead>
              <tbody>
                {malware.map((m) => (
                  <tr key={m.name + m.version}>
                    <td><PkgLink name={m.name} version={m.version} /></td>
                    <td>
                      {m.advisories.map((a) => (
                        <div key={a.id} style={{ marginBottom: 4 }}>
                          <a href={a.url} target="_blank" rel="noreferrer"><b>{a.id}</b></a> · {a.summary}
                        </div>
                      ))}
                    </td>
                    <td className="path where"><Where installs={installsOf(res.packages, m.name, m.version)} t={t} /></td>
                    <td>
                      <UninstallButton
                        name={m.name}
                        version={m.version}
                        roots={[...new Set(installsOf(res.packages, m.name, m.version).map((p) => p.project_root))]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {report && malware.length === 0 && (
        <p className="notice ok-notice"><Icon name="check" size={16} /> <span>{t("sec.malware.clean")}</span></p>
      )}

      {/* ---------- Suspicious install scripts ---------- */}
      <section className="card">
        <div className="card-head">
          <h2><Icon name="terminal" /> {t("sec.scripts.title")} <span className="count">({suspicious.length})</span></h2>
          <span className="muted small-text">{t("sec.scripts.hint")}</span>
        </div>
        {suspicious.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>{t("sec.scripts.none")}</p>
        ) : (
          <div className="table-wrap">
            <table className="fixed scripts">
              <thead>
                <tr><th>{t("common.package")}</th><th>{t("sec.scripts.level")}</th><th>{t("sec.scripts.signals")}</th><th>{t("common.location")}</th><th>{t("un.col")}</th></tr>
              </thead>
              <tbody>
                {suspicious.map((s) => (
                  <tr key={s.name + s.version}>
                    <td><PkgLink name={s.name} version={s.version} /></td>
                    <td><span className={`badge ${s.level === "critical" ? "major" : "minor"}`}>{t(`script.${s.level}`)}</span></td>
                    <td>
                      <div className="chips" style={{ marginBottom: 6 }}>
                        {s.reasons.map((r) => <span key={r} className="badge bad">{t(r)}</span>)}
                      </div>
                      {Object.entries(s.scripts).map(([hook, text]) => (
                        <div key={hook} className="script"><span className="muted">{hook}:</span> <code>{text}</code></div>
                      ))}
                    </td>
                    <td className="path where"><Where installs={s.installs} t={t} /></td>
                    <td>
                      <UninstallButton name={s.name} version={s.version} roots={[...new Set(s.installs.map((p) => p.project_root))]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small-text" style={{ margin: suspicious.length ? "16px 0 0" : "12px 0 0" }}>{t("sec.scripts.disclaimer")}</p>
      </section>

      {/* ---------- Vulnerabilities ---------- */}
      <section className="card">
        <div className="card-head">
          <h2>
            <Icon name="alert" /> {t("sec.vulns.title")}{" "}
            <span className="count">({report ? fn(vulns.length) : t("sec.vulns.notChecked")})</span>
          </h2>
        </div>
        {!report && <p className="muted" style={{ margin: 0 }}>{t("sec.vulns.hint")}</p>}
        {report && vulns.length === 0 && <p className="muted" style={{ margin: 0 }}>{t("sec.vulns.none")}</p>}
        {vulns.length > 0 && (
          <div className="table-wrap">
            <table className="fixed vuln">
              <thead>
                <tr>
                  <th>{t("sec.col.severity")}</th><th>{t("common.package")}</th><th>{t("sec.col.vuln")}</th>
                  <th>{t("sec.col.fix")}</th><th>{t("common.location")}</th><th>{t("fix.col")}</th>
                </tr>
              </thead>
              <tbody>
                {rowsOf(vulns).map(({ a, h }) => {
                  const fix = nearestFix(h.version, h.fixed);
                  const roots = [...new Set(installsOf(res.packages, h.name, h.version).map((p) => p.project_root))];
                  return (
                    <tr key={a.id + h.name + h.version}>
                      <td><span className={`badge sev-${a.severity}`}>{t(`sev.${a.severity}`)}</span></td>
                      <td><PkgLink {...h} /></td>
                      <td>
                        <a href={a.url} target="_blank" rel="noreferrer">{a.aliases.find((x) => x.startsWith("CVE-")) ?? a.id}</a>
                        <div className="small-text">{a.summary}</div>
                      </td>
                      <td>{fix ? <span className="version">{fix}</span> : <span className="muted">{t("sec.noFix")}</span>}</td>
                      <td className="path where"><Where installs={installsOf(res.packages, h.name, h.version)} t={t} /></td>
                      <td>{fix && roots.length > 0 ? <FixButton name={h.name} version={h.version} roots={roots} /> : <span className="muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------- Info: other install scripts ---------- */}
      {infoScripts.length > 0 && (
        <section className="card">
          <details>
            <summary>
              <h2>{t("sec.info.title", { n: infoScripts.length })}</h2>
              <span className="muted small-text">· {t("sec.info.hint")}</span>
            </summary>
            <div className="table-wrap" style={{ marginTop: 14 }}>
              <table>
                <thead><tr><th>{t("common.package")}</th><th>Script</th></tr></thead>
                <tbody>
                  {infoScripts.map((s) => (
                    <tr key={s.name + s.version}>
                      <td><PkgLink name={s.name} version={s.version} /></td>
                      <td>
                        {Object.keys(s.scripts).length === 0 && <span className="muted">{t("sec.info.lockOnly")}</span>}
                        {Object.entries(s.scripts).map(([hook, text]) => (
                          <div key={hook} className="script"><span className="muted">{hook}:</span> <code>{text}</code></div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      )}
    </>
  );
}
