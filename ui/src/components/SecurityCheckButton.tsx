"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "./Brand";
import { useI18n } from "./I18nProvider";

export default function SecurityCheckButton({ again = false }: { again?: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/security", { method: "POST" });
      const body = await res.json();
      if (!body.ok) setErr(body.error ?? t("common.unknownError"));
      else router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scan">
      {err && <span role="alert" className="msg err">{err}</span>}
      <button onClick={run} disabled={busy} className="primary" aria-busy={busy}>
        {busy ? <span className="spinner" /> : <Icon name="shield" size={16} />}
        {busy ? t("sec.checking") : again ? t("sec.recheck") : t("sec.check")}
      </button>
    </div>
  );
}
