"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Icon } from "./Brand";
import { useI18n } from "./I18nProvider";

type Action = { kind: "direct" | "global"; display: string };
type Outcome = { status: "removed" | "stillPresent"; after: string[]; log: string; backup: string | null };

type ItemState =
  | { phase: "planning" }
  | { phase: "ready"; action: Action }
  | { phase: "running"; action: Action }
  | { phase: "done"; action: Action; outcome: Outcome }
  | { phase: "error"; error: string; action?: Action };

async function post(body: object) {
  const res = await fetch("/api/uninstall", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}

/** "Uninstall" button: previews the exact npm command per folder, runs it only after confirmation. */
export default function UninstallButton({ name, version, roots }: { name: string; version: string; roots: string[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<Record<string, ItemState>>({});
  const [changed, setChanged] = useState(false);
  const anyRunning = Object.values(items).some((s) => s.phase === "running");

  const set = (root: string, s: ItemState) => setItems((prev) => ({ ...prev, [root]: s }));

  async function open() {
    dialog.current?.showModal();
    setItems(Object.fromEntries(roots.map((r) => [r, { phase: "planning" } as ItemState])));
    await Promise.all(
      roots.map(async (root) => {
        const r = await post({ root, name, version, mode: "plan" }).catch((e) => ({ ok: false, error: String(e) }));
        set(root, r.ok ? { phase: "ready", action: r.action } : { phase: "error", error: r.error });
      }),
    );
  }

  async function run(root: string, action: Action) {
    set(root, { phase: "running", action });
    const r = await post({ root, name, version, mode: "apply" }).catch((e) => ({ ok: false, error: String(e) }));
    if (r.ok) {
      set(root, { phase: "done", action, outcome: r });
      setChanged(true);
    } else {
      set(root, { phase: "error", error: r.error, action });
    }
  }

  function close() {
    if (anyRunning) return;
    dialog.current?.close();
    if (changed) router.refresh();
  }

  return (
    <>
      <button className="small danger-ghost" onClick={open}>
        <Icon name="trash" size={14} /> {t("un.button")}
      </button>
      <dialog ref={dialog} className="modal" onCancel={(e) => { e.preventDefault(); close(); }} aria-label={t("un.title", { name, version })}>
        <div className="modal-head">
          <h2><Icon name="trash" /> {t("un.title", { name, version })}</h2>
          <button className="small" onClick={close} disabled={anyRunning}><Icon name="x" size={14} /> {t("fix.close")}</button>
        </div>
        <p className="notice" style={{ marginBottom: 10 }}><Icon name="shield" size={16} /> <span>{t("un.guard")}</span></p>
        <p className="notice err" style={{ marginBottom: 14 }}><Icon name="alert" size={16} /> <span>{t("un.warn")}</span></p>

        {roots.map((root) => {
          const s = items[root];
          const action = s && "action" in s ? s.action : undefined;
          return (
            <div key={root} className="fix-item">
              <div className="path small-text" style={{ fontWeight: 600 }}>{root}</div>
              {s?.phase === "planning" && <div className="muted"><span className="spinner dark" /> {t("fix.planning")}</div>}
              {action && (
                <>
                  <div>{t(action.kind === "global" ? "un.kind.global" : "un.kind.direct")}</div>
                  <div className="muted small-text">{t("fix.willRun")}</div>
                  <code className="cmd-line">{action.display}</code>
                </>
              )}
              {s?.phase === "ready" && (
                <div>
                  <button className="danger" onClick={() => run(root, s.action)} disabled={anyRunning}>
                    <Icon name="trash" size={15} /> {t("un.confirm")}
                  </button>
                </div>
              )}
              {s?.phase === "running" && <div className="row" style={{ margin: 0 }}><span className="spinner dark" /> <b>{t("un.running")}</b></div>}
              {s?.phase === "done" && (
                <>
                  <p className={`notice ${s.outcome.status === "removed" ? "ok-notice" : "err"}`} style={{ margin: 0 }}>
                    <Icon name={s.outcome.status === "removed" ? "check" : "alert"} size={16} />
                    <span>{t(`un.status.${s.outcome.status}`, { v: s.outcome.after.join(", ") || "—" })}</span>
                  </p>
                  {s.outcome.backup && <div className="muted small-text">{t("fix.backup", { p: s.outcome.backup })}</div>}
                  <details>
                    <summary className="small-text">{t("fix.showLog")}</summary>
                    <pre className="log">{s.outcome.log || "—"}</pre>
                  </details>
                </>
              )}
              {s?.phase === "error" && <pre className="notice err log" style={{ margin: 0 }}>{s.error}</pre>}
            </div>
          );
        })}
      </dialog>
    </>
  );
}
