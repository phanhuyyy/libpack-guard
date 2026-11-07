"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "./Brand";
import { useI18n } from "./I18nProvider";

export default function ScanButton({ first = false }: { first?: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function scan() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/scan", { method: "POST" });
      const body = await res.json();
      setMsg(body.ok ? { ok: true, text: t("scan.done") } : { ok: false, text: body.error ?? t("common.unknownError") });
      if (body.ok) router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scan">
      {msg && <span role="status" className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</span>}
      <button onClick={scan} disabled={busy} className="primary" aria-busy={busy}>
        {busy ? <span className="spinner" /> : <Icon name="refresh" size={16} />}
        {busy ? t("scan.running") : first ? t("scan.now") : t("scan.button")}
      </button>
    </div>
  );
}
