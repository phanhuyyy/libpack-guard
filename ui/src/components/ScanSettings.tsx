"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "./Brand";
import FolderPicker from "./FolderPicker";
import { useI18n } from "./I18nProvider";

type Props = {
  initialRoots: string[];
  initialDepth: number;
  defaults: string[];
  source: "ui" | "agent" | "default";
};

export default function ScanSettings({ initialRoots, initialDepth, defaults, source }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const [roots, setRoots] = useState(initialRoots);
  const [depth, setDepth] = useState(initialDepth);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<"save" | "scan" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(roots) !== JSON.stringify(initialRoots) || depth !== initialDepth;

  function add(p: string) {
    const key = p.toLowerCase();
    if (!roots.some((r) => r.toLowerCase() === key)) setRoots([...roots, p]);
    setPicking(false);
    setMsg(null);
  }

  async function save(andScan: boolean) {
    setBusy(andScan ? "scan" : "save");
    setMsg(null);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roots, max_depth: depth }),
      });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error);
      setRoots(body.config.roots);
      if (andScan) {
        const s = await (await fetch("/api/scan", { method: "POST" })).json();
        if (!s.ok) throw new Error(s.error);
        setMsg({ ok: true, text: t("set.savedScanned") });
      } else {
        setMsg({ ok: true, text: t("set.saved") });
      }
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message || t("common.unknownError") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2><Icon name="folder" /> {t("set.roots")} <span className="count">({roots.length})</span></h2>
          <div className="chips">
            <button onClick={() => { setRoots(defaults); setMsg(null); }} title={defaults.join("\n")}>{t("set.useDefaults")}</button>
            <button className="primary" onClick={() => setPicking(true)} disabled={picking}>
              <Icon name="plus" size={16} /> {t("set.add")}
            </button>
          </div>
        </div>
        <p className="muted small-text" style={{ marginTop: 0 }}>{t(`set.src.${source}`)}</p>

        {picking && <FolderPicker onPick={add} onClose={() => setPicking(false)} />}

        {roots.length === 0 ? (
          <p className="notice err"><Icon name="alert" size={16} /> <span>{t("set.empty")}</span></p>
        ) : (
          <ul className="root-list">
            {roots.map((r) => (
              <li key={r}>
                <Icon name="folder" size={16} />
                <span className="path grow">{r}</span>
                <button className="small" onClick={() => setRoots(roots.filter((x) => x !== r))} aria-label={`${t("set.remove")} ${r}`}>
                  <Icon name="x" size={13} /> {t("set.remove")}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small-text" style={{ marginBottom: 0 }}>{t("set.globalNote")}</p>
      </section>

      <section className="card">
        <div className="card-head">
          <h2><Icon name="layers" /> {t("set.depth")}</h2>
        </div>
        <div className="range-row">
          <input type="range" min={1} max={20} value={depth} onChange={(e) => setDepth(Number(e.target.value))} aria-label={t("set.depth")} />
          <b style={{ minWidth: 70 }}>{t("set.depthValue", { n: depth })}</b>
        </div>
        <p className="muted small-text" style={{ margin: 0 }}>{t("set.depthHint")}</p>
      </section>

      <div className="save-bar">
        {msg && <span role="status" className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</span>}
        {dirty && !msg && <span className="muted">{t("set.unsaved")}</span>}
        <button onClick={() => save(false)} disabled={!!busy || roots.length === 0}>
          {busy === "save" && <span className="spinner dark" />} {t("set.save")}
        </button>
        <button className="primary" onClick={() => save(true)} disabled={!!busy || roots.length === 0}>
          {busy === "scan" ? <span className="spinner" /> : <Icon name="refresh" size={16} />}
          {busy === "scan" ? t("scan.running") : t("set.saveScan")}
        </button>
      </div>
    </>
  );
}
