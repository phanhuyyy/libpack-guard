"use client";

import { createContext, useContext, useMemo } from "react";
import { formatDate, formatNumber, makeT, type Locale, type T } from "@/lib/i18n";

type Ctx = { locale: Locale; t: T; fd: (iso: string, dateOnly?: boolean) => string; fn: (n: number) => string };

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo<Ctx>(
    () => ({
      locale,
      t: makeT(locale),
      fd: (iso, dateOnly) => formatDate(iso, locale, dateOnly),
      fn: (n) => formatNumber(n, locale),
    }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
