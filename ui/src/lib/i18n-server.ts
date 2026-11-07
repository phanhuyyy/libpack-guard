import { cookies, headers } from "next/headers";
import {
  formatDate,
  formatNumber,
  I18nError,
  isLocale,
  isTheme,
  makeT,
  negotiate,
  type Locale,
  type T,
  type Theme,
} from "./i18n";

export type ServerI18n = {
  locale: Locale;
  theme: Theme;
  t: T;
  fd: (iso: string, dateOnly?: boolean) => string;
  fn: (n: number) => string;
};

/** Locale from the "lang" cookie, else Accept-Language. Theme from the "theme" cookie. */
export async function getI18n(): Promise<ServerI18n> {
  const c = await cookies();
  const lang = c.get("lang")?.value;
  const locale = isLocale(lang) ? lang : negotiate((await headers()).get("accept-language"));
  const th = c.get("theme")?.value;
  return {
    locale,
    theme: isTheme(th) ? th : "system",
    t: makeT(locale),
    fd: (iso, dateOnly) => formatDate(iso, locale, dateOnly),
    fn: (n) => formatNumber(n, locale),
  };
}

/** Turns any thrown error into a localized message. */
export function errorMessage(e: unknown, t: T): string {
  if (e instanceof I18nError) return t(e.key, e.params);
  return (e as Error)?.message || t("common.unknownError");
}
