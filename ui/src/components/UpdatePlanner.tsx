"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { compare } from "@/lib/semver";
import { fullScript, groupByRoot, inlineCommand, type Selected } from "@/lib/update-script";
import { Icon } from "./Brand";
import CopyText from "./CopyText";
import UpgradeButton from "./UpgradeButton";
import { useI18n } from "./I18nProvider";
import { lookup, pool, type Lookup } from "./registry-client";

export type Candidate = { root: string; scope: "global" | "project"; name: string; version: string; manager: "npm" | "pnpm" };

type Props = {
  candidates: Candidate[];
  windows: boolean;
  malware: string[];
  vulnFixes: Record<string, string[]>;
  scopeText: string;
  skippedText: string | null;
};

type Row = Candidate & {
  key: string;
  minor: string | null; // newest compatible (same major)
  major: string | null; // newer major, opt-in
  malicious: boolean;
};

const keyOf = (c: Candidate) => `${c.root}\u0000${c.name}`;
const newer = (a: string | null | undefined, b: string) => !!a && !a.includes("-") && (compare(a, b) ?? 0) > 0;

export default function UpdatePlanner({ candidates, windows, malware, vulnFixes, scopeText, skippedText }: Props) {
  const { t, fn } = useI18n();
  const [results, setResults] = useState<Record<string, Lookup>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [choice, setChoice] = useState<Record<string, string>>({}); // key -> target version ("" = skip)
  const [copiedAll, setCopiedAll] = useState(false);
  // rows updated from the UI in this session: key -> versions now installed
  const [done, setDone] = useState<Record<string, string[]>>({});

  const names = useMemo(() => [...new Set(candidates.map((c) => c.name))], [candidates]);
  const malwareSet = useMemo(() => new Set(malware), [malware]);
  const checked = Object.keys(results).length > 0;

  async function check() {
    setBusy(true);
    setProgress(0);
    const fresh: Record<string, Lookup> = {};
    let done = 0;
    await pool(names, 6, async (name) => {
      const versions = [...new Set(candidates.filter((c) => c.name === name).map((c) => c.version))];
      fresh[name] = await lookup(name, versions);
      setProgress(++done);
    });
    setResults(fresh);
    // default selection: compatible (patch/minor) updates only
    const next: Record<string, string> = {};
    for (const c of candidates) {
      const m = fresh[c.name]?.info?.inMajor[c.version];
      next[keyOf(c)] = m && !malwareSet.has(`${c.name}@${c.version}`) ? m : "";
    }
    setChoice(next);
    setBusy(false);
  }

  const rows: Row[] = useMemo(() => {
    if (!checked) return [];
    const out: Row[] = [];
    for (const c of candidates) {
      const info = results[c.name]?.info;
      if (!info) continue;
      const minor = info.inMajor[c.version] ?? null;
      const major = newer(info.latest, minor ?? c.version) && info.latest !== minor ? info.latest : null;
      const malicious = malwareSet.has(`${c.name}@${c.version}`);
      if (minor || major || malicious) out.push({ ...c, key: keyOf(c), minor, major, malicious });
    }
    return out;
  }, [checked, candidates, results, malwareSet]);

  const failed = checked ? names.filter((n) => results[n]?.error).length : 0;

  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) map.set(r.root, [...(map.get(r.root) ?? []), r]);
    return [...map.entries()].sort(([a, ra], [b, rb]) =>
      ra[0].scope !== rb[0].scope ? (ra[0].scope === "global" ? -1 : 1) : a.localeCompare(b),
    );
  }, [rows]);

  const selected: Selected[] = rows
    .filter((r) => !r.malicious && choice[r.key] && !done[r.key])
    .map((r) => ({ root: r.root, global: r.scope === "global", name: r.name, target: choice[r.key], manager: r.manager }));
  const planGroups = groupByRoot(selected);
  const script = planGroups.length ? fullScript(planGroups, windows, new Date().toISOString()) : "";

  function fixesVuln(r: Row): boolean {
    const target = choice[r.key];
    if (!target) return false;
    return (vulnFixes[`${r.name}@${r.version}`] ?? []).some(
      (f) => (compare(f, r.version) ?? 0) > 0 && (compare(target, f) ?? -1) >= 0,
    );
  }

  function setGroup(groupRows: Row[], on: boolean) {
    setChoice((prev) => {
      const next = { ...prev };
      for (const r of groupRows) if (!r.malicious) next[r.key] = on ? (r.minor ?? "") : "";
      return next;
    });
  }

  function download() {
    const blob = new Blob([script], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = windows ? "libpack-update.ps1" : "libpack-update.sh";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2><Icon name="refresh" /> {t("upd.title")}</h2>
          <button className="primary" onClick={check} disabled={busy || names.length === 0} aria-busy={busy}>
            {busy ? <span className="spinner" /> : <Icon name="search" size={16} />}
            {busy ? t("upd.checking", { done: progress, total: names.length }) : checked ? t("upd.recheck") : t("upd.check")}
          </button>
        </div>
        <p className="muted" style={{ margin: 0 }}>{scopeText}</p>
        {skippedText && <p className="muted small-text" style={{ margin: "6px 0 0" }}>{skippedText}</p>}
        {busy && (
          <div className="progress" style={{ width: "100%", marginTop: 12 }} role="progressbar" aria-valuemin={0} aria-valuemax={names.length} aria-valuenow={progress}>
            <span style={{ width: `${(progress / Math.max(1, names.length)) * 100}%` }} />
          </div>
        )}
        {!checked && !busy && <p className="notice" style={{ margin: "12px 0 0" }}><Icon name="globe" size={16} /> <span>{t("upd.network")}</span></p>}
        {failed > 0 && <p className="notice err" style={{ margin: "12px 0 0" }}><Icon name="alert" size={16} /> <span>{t("upd.err", { n: failed })}</span></p>}
        {checked && !busy && rows.length === 0 && (
          <p className="notice ok-notice" style={{ margin: "12px 0 0" }}><Icon name="check" size={16} /> <span>{t("upd.none")}</span></p>
        )}
      </section>

      {groups.map(([root, groupRows]) => {
        const global = groupRows[0].scope === "global";
        const n = groupRows.filter((r) => choice[r.key] && !done[r.key]).length;
        const selectable = groupRows.filter((r) => !r.malicious && r.minor && !done[r.key]);
        const allOn = selectable.length > 0 && selectable.every((r) => choice[r.key]);
        return (
          <section key={root} className="card">
            <div className="card-head">
              <h2 style={{ minWidth: 0 }}>
                <Icon name={global ? "globe" : "folder"} />
                <Link href={`/project?root=${encodeURIComponent(root)}`} className="path" style={{ fontWeight: 600 }}>{root}</Link>
                {global && <span className="badge global">{t("common.global")}</span>}
              </h2>
              <div className="chips">
                <span className="badge info">{t("upd.count", { n })}</span>
                {selectable.length > 0 && (
                  <label>
                    <input type="checkbox" checked={allOn} onChange={(e) => setGroup(groupRows, e.target.checked)} /> {t("upd.selectAll")}
                  </label>
                )}
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("common.package")}</th>
                    <th>{t("reg.installed")}</th>
                    <th>{t("upd.col.target")}</th>
                    <th>{t("proj.latestCol")}</th>
                    <th>{t("upd.col.action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {groupRows.map((r) => (
                    <tr key={r.key}>
                      <td>
                        <Link className="pkg-name" href={`/package?name=${encodeURIComponent(r.name)}`}>{r.name}</Link>
                        {fixesVuln(r) && <span className="badge current">{t("upd.fixesVuln")}</span>}
                      </td>
                      <td><span className="version">{r.version}</span></td>
                      <td>
                        {done[r.key] ? (
                          <span className="badge current" style={{ marginLeft: 0 }}>{t("upd.updated", { v: done[r.key].join(", ") })}</span>
                        ) : r.malicious ? (
                          <span className="badge sev-critical" style={{ marginLeft: 0 }}>{t("upd.malware")}</span>
                        ) : (
                          <select
                            className="select"
                            value={choice[r.key] ?? ""}
                            onChange={(e) => setChoice((p) => ({ ...p, [r.key]: e.target.value }))}
                            aria-label={`${t("upd.col.target")} ${r.name}`}
                          >
                            <option value="">—</option>
                            {r.minor && <option value={r.minor}>{r.minor}</option>}
                            {r.major && <option value={r.major}>{t("upd.majorOpt", { v: r.major })}</option>}
                          </select>
                        )}
                        {!r.minor && r.major && !r.malicious && !choice[r.key] && (
                          <div className="muted small-text">{t("upd.majorOnly")}</div>
                        )}
                      </td>
                      <td>{r.major ?? r.minor ? <span className="version">{r.major ?? r.minor}</span> : null}</td>
                      <td>
                        {!r.malicious && !done[r.key] && (
                          <UpgradeButton
                            root={r.root}
                            name={r.name}
                            version={r.version}
                            target={choice[r.key] ?? ""}
                            onDone={(after, ok) => ok && setDone((p) => ({ ...p, [r.key]: after }))}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {checked && rows.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2><Icon name="terminal" /> {t("upd.commands")}</h2>
            {planGroups.length > 0 && (
              <div className="chips">
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(script);
                      setCopiedAll(true);
                      setTimeout(() => setCopiedAll(false), 1500);
                    } catch { /* clipboard blocked */ }
                  }}
                >
                  <Icon name={copiedAll ? "check" : "copy"} size={15} /> {copiedAll ? t("common.copied") : t("upd.copyAll")}
                </button>
                <button className="primary" onClick={download}>
                  <Icon name="external" size={15} /> {t("upd.download", { ext: windows ? ".ps1" : ".sh" })}
                </button>
              </div>
            )}
          </div>
          {planGroups.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>{t("upd.noneSelected")}</p>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                {t("upd.summary", { n: fn(selected.length), p: fn(planGroups.length) })}
              </p>
              <div className="cmd-list">
                {planGroups.map((g) => (
                  <div key={g.root} className="cmd">
                    <div className="path small-text">{g.root}</div>
                    <CopyText text={inlineCommand(g, windows)} />
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
