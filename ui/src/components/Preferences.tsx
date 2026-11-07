"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LOCALE_META, LOCALES, type Locale, type Theme } from "@/lib/i18n";
import { PMS, type PM } from "@/lib/pm";
import { Icon } from "./Brand";
import { useI18n } from "./I18nProvider";

const YEAR = 60 * 60 * 24 * 365;

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${YEAR}; samesite=lax`;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

const THEME_ICONS: Record<Theme, string> = { light: "sun", dark: "moon", system: "monitor" };

/**
 * Package-manager workspace (npm / pnpm), language and theme switchers, stored in cookies so
 * the server renders them directly.
 */
export default function Preferences({ initialTheme, pm }: { initialTheme: Theme; pm: PM }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [pending, startTransition] = useTransition();

  function choosePm(next: PM) {
    if (next === pm) return;
    setCookie("pm", next);
    startTransition(() => router.refresh());
  }

  function chooseTheme(next: Theme) {
    setTheme(next);
    setCookie("theme", next);
    applyTheme(next);
  }

  function chooseLocale(next: Locale) {
    if (next === locale) return;
    setCookie("lang", next);
    document.documentElement.lang = LOCALE_META[next].html;
    startTransition(() => router.refresh());
  }

  return (
    <div className="prefs">
      <div className="segmented pm-switch" role="radiogroup" aria-label={t("pm.label")} title={t("pm.hint")}>
        {PMS.map((m) => (
          <button
            key={m}
            role="radio"
            aria-checked={m === pm}
            className={m === pm ? "on" : undefined}
            onClick={() => choosePm(m)}
            disabled={pending}
          >
            <Icon name="box" size={14} /> {m}
          </button>
        ))}
      </div>
      <div className="segmented" role="radiogroup" aria-label={t("lang.label")}>
        {LOCALES.map((l) => (
          <button
            key={l}
            role="radio"
            aria-checked={l === locale}
            className={l === locale ? "on" : undefined}
            onClick={() => chooseLocale(l)}
            title={LOCALE_META[l].label}
            disabled={pending}
          >
            {LOCALE_META[l].short}
          </button>
        ))}
      </div>
      <div className="segmented" role="radiogroup" aria-label={t("theme.label")}>
        {(["light", "dark", "system"] as Theme[]).map((th) => (
          <button
            key={th}
            role="radio"
            aria-checked={th === theme}
            className={th === theme ? "on" : undefined}
            onClick={() => chooseTheme(th)}
            title={t(`theme.${th}`)}
            aria-label={t(`theme.${th}`)}
          >
            <Icon name={THEME_ICONS[th]} size={15} />
          </button>
        ))}
      </div>
    </div>
  );
}
