import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { AppMark } from "@/components/Brand";
import { I18nProvider } from "@/components/I18nProvider";
import NavLinks from "@/components/NavLinks";
import Preferences from "@/components/Preferences";
import { LOCALE_META } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import "./globals.css";

// Downloaded once at build time and self-hosted: the app still works offline.
// Chinese glyphs fall back to the system CJK font (see --font-stack in globals.css).
const inter = Inter({ subsets: ["latin", "vietnamese"], variable: "--font-inter", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: `libpack · ${t("app.tagline")}`, template: "%s · libpack" },
    description: t("app.tagline"),
  };
}

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f19" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, theme, t, pm } = await getI18n();
  return (
    <html
      lang={LOCALE_META[locale].html}
      data-theme={theme === "system" ? undefined : theme}
      className={inter.variable}
      suppressHydrationWarning
    >
      <body>
        <I18nProvider locale={locale}>
          <header className="topbar">
            <div className="topbar-inner">
              <Link href="/" className="brand" aria-label="libpack">
                <AppMark size={32} />
                <span className="brand-text">
                  <b>LIBPACK</b>
                </span>
              </Link>
              <NavLinks />
              <Preferences initialTheme={theme} pm={pm} />
            </div>
          </header>
          <main id="main">{children}</main>
          <footer className="footer">
            <AppMark size={18} />
            <span>{t("app.footer")}</span>
          </footer>
        </I18nProvider>
      </body>
    </html>
  );
}
