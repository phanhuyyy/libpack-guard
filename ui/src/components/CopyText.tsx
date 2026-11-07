"use client";

import { useState } from "react";
import { Icon } from "./Brand";
import { useI18n } from "./I18nProvider";

export default function CopyText({ text }: { text: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <span className="copy">
      <code>{text}</code>
      <button
        className="small"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked: user can still select the text */
          }
        }}
      >
        <Icon name={copied ? "check" : "copy"} size={14} />
        {copied ? t("common.copied") : t("common.copy")}
      </button>
    </span>
  );
}
