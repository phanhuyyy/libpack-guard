"use client";

import { useRef, useState } from "react";
import { Icon } from "./Brand";
import { useI18n } from "./I18nProvider";

type Action = { kind: "direct" | "global"; display: string };
type Outcome = { status: "fixed" | "partial" | "notFixed"; after: string[]; log: string; backup: string | null };

type Phase =
  | { phase: "idle" }
  | { phase: "planning" }
  | { phase: "ready"; action: Action }
  | { phase: "running"; action: Action }
  | { phase: "done"; action: Action; outcome: Outcome }
  | { phase: "error"; error: string; action?: Action };

async function post(body: object) {
  const res = await fetch("/api/fix", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}

type Props = {
  root: string;
  name: string;
  version: string;
  target: string;
  /** called when the dialog is closed after a run, with the versions now installed in this folder */
  onDone: (after: string[], ok: boolean) => void;
};

/** Per-row "Update" in the Updates tab: confirm dialog with the exact command, then run it. */
export default function UpgradeButton({ root, name, version, target, onDone }: Props) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [s, setS] = useState<Phase>({ phase: "idle" });
  const busy = s.phase === "running";

  async function open() {
    dialog.current?.showModal();
    setS({ phase: "planning" });
    const r = await post({ root, name, version, target, mode: "plan" }).catch((e) => ({ ok: false, error: String(e) }));
    setS(r.ok ? { phase: "ready", action: r.action } : { phase: "error", error: r.error });
  }

  async function run(action: Action) {
    setS({ phase: "running", action });
    const r = await post({ root, name, version, target, mode: "apply" }).catch((e) => ({ ok: false, error: String(e) }));
    if (r.ok) {
      // report to the parent only when the dialog closes, so the result stays visible
      setS({ phase: "done", action, outcome: r });
    } else {
      setS({ phase: "error", error: r.error, action });
    }
  }

  function close() {
    if (busy) return;
    dialog.current?.close();
    if (s.phase === "done") onDone(s.outcome.after, s.outcome.status === "fixed");
  }

  const action = "action" in s ? s.action : undefined;

  return (
    <>
      <button className="small primary" onClick={open} disabled={!target}>
        <Icon name="refresh" size={14} /> {t("upd.run")}
      </button>
      <dialog ref={dialog} className="modal" onCancel={(e) => { e.preventDefault(); close(); }}
        aria-label={t("upd.dialog.title", { name, from: version, to: target })}>
        <div className="modal-head">
          <h2><Icon name="refresh" /> {t("upd.dialog.title", { name, from: version, to: target })}</h2>
          <button className="small" onClick={close} disabled={busy}><Icon name="x" size={14} /> {t("fix.close")}</button>
        </div>
        <p className="notice" style={{ marginBottom: 14 }}><Icon name="shield" size={16} /> <span>{t("upd.guard")}</span></p>
        <div className="fix-item">
          <div className="path small-text" style={{ fontWeight: 600 }}>{root}</div>
          {s.phase === "planning" && <div className="muted"><span className="spinner dark" /> {t("fix.planning")}</div>}
          {action && (
            <>
              <div>{t(action.kind === "global" ? "upd.kind.global" : "upd.kind.direct", { to: target })}</div>
              <div className="ok small-text"><Icon name="check" size={13} /> {t("upd.osvOk", { name, to: target })}</div>
              <div className="muted small-text">{t("fix.willRun")}</div>
              <code className="cmd-line">{action.display}</code>
            </>
          )}
          {s.phase === "ready" && (
            <div>
              <button className="primary" onClick={() => run(s.action)}><Icon name="refresh" size={15} /> {t("fix.confirm")}</button>
            </div>
          )}
          {s.phase === "running" && <div className="row" style={{ margin: 0 }}><span className="spinner dark" /> <b>{t("fix.running")}</b></div>}
          {s.phase === "done" && (
            <>
              <p className={`notice ${s.outcome.status === "fixed" ? "ok-notice" : "err"}`} style={{ margin: 0 }}>
                <Icon name={s.outcome.status === "fixed" ? "check" : "alert"} size={16} />
                <span>{t(s.outcome.status === "fixed" ? "upd.result.done" : "upd.result.notDone", { v: s.outcome.after.join(", ") || "—" })}</span>
              </p>
              {s.outcome.backup && <div className="muted small-text">{t("fix.backup", { p: s.outcome.backup })}</div>}
              <details>
                <summary className="small-text">{t("fix.showLog")}</summary>
                <pre className="log">{s.outcome.log || "—"}</pre>
              </details>
            </>
          )}
          {s.phase === "error" && <pre className="notice err log" style={{ margin: 0 }}>{s.error}</pre>}
        </div>
      </dialog>
    </>
  );
}
