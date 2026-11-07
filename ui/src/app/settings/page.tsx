import { existsSync } from "node:fs";
import type { Metadata } from "next";
import { Icon } from "@/components/Brand";
import ScanSettings from "@/components/ScanSettings";
import { defaultRoots, readConfig } from "@/lib/config";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.settings") };
}

export default async function SettingsPage() {
  const [{ t }, cfg] = await Promise.all([getI18n(), readConfig()]);
  // only offer default folders that actually exist on this machine
  const defaults = defaultRoots().filter((r) => existsSync(/*turbopackIgnore: true*/ r));
  const roots = cfg.source === "default" ? defaults : cfg.roots;
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow"><Icon name="folder" size={14} /> {t("nav.settings")}</div>
          <h1>{t("set.title")}</h1>
          <div className="subtitle">{t("set.subtitle")}</div>
        </div>
      </div>
      <ScanSettings initialRoots={roots} initialDepth={cfg.max_depth} defaults={defaults} source={cfg.source} />
    </>
  );
}
