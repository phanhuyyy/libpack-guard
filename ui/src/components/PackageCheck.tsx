"use client";

import { useState } from "react";
import { diff } from "@/lib/semver";
import { Icon } from "./Brand";
import CopyText from "./CopyText";
import { useI18n } from "./I18nProvider";
import { lookup, type Lookup } from "./registry-client";

/** "Check for updates" for one package, comparing every installed version. */
export default function PackageCheck({ name, versions }: { name: string; versions: string[] }) {
  const { t, fd } = useI18n();
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<Lookup | null>(null);

  async function check() {
    setBusy(true);
    setR(await lookup(name, versions));
    setBusy(false);
  }

  const info = r?.info;
  return (
    <section className="card">
      <div className="card-head">
        <h2><Icon name="refresh" /> {t("reg.title")}</h2>
        <button onClick={check} disabled={busy} className="primary" aria-busy={busy}>
          {busy ? <span className="spinner" /> : <Icon name="search" size={16} />}
          {busy ? t("reg.checking") : r ? t("reg.recheck") : t("reg.check")}
        </button>
      </div>
      {!r && (
        <p className="notice" style={{ marginBottom: 0 }}>
          <Icon name="globe" size={16} /> <span>{t("reg.notice")}</span>
        </p>
      )}
      {r?.error && <p className="notice err" style={{ marginBottom: 0 }}><Icon name="alert" size={16} /> <span>{r.error}</span></p>}
      {info && (
        <>
          <div className="latest-box">
            <div>
              <div className="label">{t("reg.latest")}</div>
              <div className="value">{info.latest ?? "—"}</div>
            </div>
            <div>
              <div className="label">{t("reg.modified")}</div>
              <div className="value" style={{ fontSize: 16 }}>{info.modified ? fd(info.modified, true) : "—"}</div>
            </div>
            <div>
              <div className="label">{t("reg.count")}</div>
              <div className="value" style={{ fontSize: 16 }}>{info.versionCount}</div>
            </div>
          </div>
          {info.latestDeprecated && (
            <p className="notice err"><Icon name="alert" size={16} /> <span>{t("reg.deprecatedPkg", { msg: info.latestDeprecated })}</span></p>
          )}
          <div className="table-wrap" style={{ marginBottom: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>{t("reg.installed")}</th>
                  <th>{t("reg.status")}</th>
                  <th>{t("reg.note")}</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => {
                  const d = info.latest ? diff(v, info.latest) : "unknown";
                  return (
                    <tr key={v}>
                      <td><span className="version">{v}</span></td>
                      <td><span className={`badge ${d}`}>{t(`diff.${d}`)}</span></td>
                      <td>
                        {info.deprecated[v] && <span className="err">{t("reg.deprecated", { msg: info.deprecated[v] })}</span>}
                        {info.missing.includes(v) && <span className="err">{t("reg.missing")}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {info.latest && (
            <p style={{ margin: "16px 0 0" }} className="copy">
              <span className="muted">{t("reg.updateCmd")}</span>
              <CopyText text={`npm install ${name}@${info.latest}`} />
            </p>
          )}
        </>
      )}
    </section>
  );
}
