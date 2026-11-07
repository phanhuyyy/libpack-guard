import type { T } from "@/lib/i18n";

/** Neutral app mark: a package box in a rounded square. */
export function AppMark({ size = 30 }: { size?: number }) {
  return (
    <span className="app-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" />
      </svg>
    </span>
  );
}

const ICONS: Record<string, string> = {
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  box: "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8",
  layers: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5",
  refresh: "M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  computer: "M4 5h16v10H4zM8 19h8M12 15v4",
  drive: "M4 14h16v5H4zM4 14l2-9h12l2 9M8 16.5h.01",
  home: "M4 11l8-7 8 7v9H4zM10 20v-5h4v5",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  back: "M15 18l-6-6 6-6",
  up: "M12 19V5M6 11l6-6 6 6",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z",
  alert: "M12 3l10 18H2L12 3zM12 10v5M12 18v.01",
  bug: "M9 9h6v8a3 3 0 0 1-6 0V9zM9 9a3 3 0 0 1 6 0M4 13h5M15 13h5M5 7l3 2M19 7l-3 2M5 19l3-2M19 19l-3-2",
  terminal: "M4 5h16v14H4zM7 9l3 3-3 3M12 15h5",
  check: "M5 12l5 5 9-10",
  plus: "M12 5v14M5 12h14",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  x: "M6 6l12 12M18 6L6 18",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  monitor: "M3 4h18v12H3zM8 20h8M12 16v4",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
};

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="icon">
      <path d={ICONS[name] ?? ""} />
    </svg>
  );
}

export function ScopeBadge({ scope, t }: { scope: "global" | "project"; t: T }) {
  return scope === "global"
    ? <span className="badge global">{t("common.global")}</span>
    : <span className="badge project">{t("common.project")}</span>;
}
