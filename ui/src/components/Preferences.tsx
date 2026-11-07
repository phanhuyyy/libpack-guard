"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LOCALE_META, LOCALES, type Locale, type Theme } from "@/lib/i18n";
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

/** Theme (light / dark / system) and language switchers, stored in cookies so the server renders them directly. */
export default function Preferences({ initialTheme }: { initialTheme: Theme }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [pending, startTransition] = useTransition();

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
