"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { diff, type Diff } from "@/lib/semver";
import { Icon } from "./Brand";
import { useI18n } from "./I18nProvider";
import { lookup, pool, type Lookup } from "./registry-client";

type Row = { name: string; version: string; direct: boolean; license?: string };

const MAX_CHECK = 300;

export default function ProjectTable({ rows }: { rows: Row[] }) {
  const { t } = useI18n();
  const [results, setResults] = useState<Record<string, Lookup>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [onlyOutdated, setOnlyOutdated] = useState(false);
  const [filter, setFilter] = useState("");

  const names = useMemo(() => [...new Set(rows.map((r) => r.name))], [rows]);
  const toCheck = names.slice(0, MAX_CHECK);

  async function checkAll() {
    setBusy(true);
    setProgress(0);
    let done = 0;
    await pool(toCheck, 6, async (name) => {
      const versions = rows.filter((r) => r.name === name).map((r) => r.version);
      const r = await lookup(name, versions);
      setResults((prev) => ({ ...prev, [name]: r }));
      setProgress(++done);
    });
    setBusy(false);
  }

  function statusOf(row: Row): { d: Diff | null; note?: string } {
    const r = results[row.name];
    if (!r) return { d: null };
    if (r.error) return { d: "unknown", note: r.error };
    const info = r.info!;
    return {
      d: info.latest ? diff(row.version, info.latest) : "unknown",
      note: info.deprecated[row.version] ? t("reg.deprecated", { msg: info.deprecated[row.version] }) : undefined,
    };
  }

  const isOutdated = (r: Row) => {
    const s = statusOf(r);
    return !!s.note || (!!s.d && s.d !== "current" && s.d !== "ahead" && s.d !== "unknown");
  };
  const checked = Object.keys(results).length > 0;
  const outdatedCount = checked ? rows.filter(isOutdated).length : 0;
  const q = filter.trim().toLowerCase();
  const shown = rows.filter((r) => (!onlyOutdated || isOutdated(r)) && (!q || r.name.toLowerCase().includes(q)));

  return (
    <>
      <div className="row">
        <button onClick={checkAll} disabled={busy} className="primary" aria-busy={busy}>
          {busy ? <span className="spinner" /> : <Icon name="refresh" size={16} />}
          {busy ? t("proj.checking", { done: progress, total: toCheck.length }) : t("proj.checkAll")}
        </button>
        {busy && (
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={toCheck.length} aria-valuenow={progress}>
            <span style={{ width: `${(progress / Math.max(1, toCheck.length)) * 100}%` }} />
          </div>
        )}
        {checked && !busy && (
          <span className={outdatedCount ? "badge minor" : "badge current"} style={{ marginLeft: 0 }}>
            {outdatedCount ? t("proj.outdated", { n: outdatedCount }) : t("proj.allCurrent")}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <input type="text" placeholder={t("proj.filter")} aria-label={t("proj.filter")} value={filter} onChange={(e) => setFilter(e.target.value)} />
        <label>
          <input type="checkbox" checked={onlyOutdated} onChange={(e) => setOnlyOutdated(e.target.checked)} /> {t("proj.onlyOutdated")}
        </label>
      </div>
      {names.length > MAX_CHECK && <p className="notice"><Icon name="alert" size={16} /> <span>{t("proj.limit", { n: MAX_CHECK })}</span></p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("common.package")}</th>
              <th>{t("reg.installed")}</th>
              <th>{t("proj.latestCol")}</th>
              <th>{t("reg.status")}</th>
              <th>{t("common.license")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const s = statusOf(row);
              const latest = results[row.name]?.info?.latest;
              return (
                <tr key={row.name + "@" + row.version}>
                  <td>
                    <Link className="pkg-name" href={`/package?name=${encodeURIComponent(row.name)}`}>{row.name}</Link>
                    {row.direct && <span className="badge info">{t("common.direct")}</span>}
                  </td>
                  <td><span className="version">{row.version}</span></td>
                  <td>{latest ? <span className="version">{latest}</span> : <span className="muted">—</span>}</td>
                  <td>
                    {s.d ? <span className={`badge ${s.d}`}>{t(`diff.${s.d}`)}</span> : <span className="muted">—</span>}
                    {s.note && <div className="err small-text">{s.note}</div>}
                  </td>
                  <td className="muted">{row.license ?? ""}</td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 24 }}>{t("proj.noMatch")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
