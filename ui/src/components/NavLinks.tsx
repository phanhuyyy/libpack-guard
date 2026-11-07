"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MessageKey } from "@/lib/i18n";
import { Icon } from "./Brand";
import { useI18n } from "./I18nProvider";

const LINKS: { href: string; label: MessageKey; icon: string; match: (p: string) => boolean }[] = [
  { href: "/", label: "nav.overview", icon: "layers", match: (p) => p === "/" || p.startsWith("/project") },
  { href: "/packages", label: "nav.search", icon: "search", match: (p) => p.startsWith("/package") },
  { href: "/updates", label: "nav.updates", icon: "refresh", match: (p) => p.startsWith("/updates") },
  { href: "/security", label: "nav.security", icon: "shield", match: (p) => p.startsWith("/security") },
  { href: "/settings", label: "nav.settings", icon: "folder", match: (p) => p.startsWith("/settings") },
];

export default function NavLinks() {
  const path = usePathname();
  const { t } = useI18n();
  return (
    <nav aria-label={t("nav.menu")}>
      {LINKS.map((l) => {
        const active = l.match(path);
        return (
          <Link key={l.href} href={l.href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
            <Icon name={l.icon} size={16} />
            <span>{t(l.label)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
