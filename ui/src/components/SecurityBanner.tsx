import Link from "next/link";
import type { Pkg } from "@/lib/data";
import { analyzeScripts } from "@/lib/heuristics";
import type { T } from "@/lib/i18n";
import { malwarePackages, type SecurityReport } from "@/lib/security";
import { Icon } from "./Brand";

/** Summary strip for the overview page. Script analysis is offline; the OSV part uses the last saved report. */
export default function SecurityBanner({ pkgs, report, t }: { pkgs: Pkg[]; report: SecurityReport | null; t: T }) {
  const malware = malwarePackages(report).length;
  const severe = report?.advisories.filter((a) => a.kind === "vuln" && (a.severity === "critical" || a.severity === "high")).length ?? 0;
  const scripts = analyzeScripts(pkgs).filter((s) => s.level !== "info");
  const critScripts = scripts.filter((s) => s.level === "critical").length;

  let cls = "ok";
  let icon = "check";
  let text: string;
  if (malware > 0) {
    cls = "danger";
    icon = "bug";
    text = t("banner.malware", { n: malware });
  } else if (scripts.length > 0) {
    cls = critScripts ? "danger" : "warning";
    icon = "terminal";
    text = t("banner.scripts", { n: scripts.length, crit: critScripts ? t("banner.scriptsCrit", { n: critScripts }) : "" });
  } else if (!report) {
    cls = "info";
    icon = "shield";
    text = t("banner.notChecked");
  } else if (severe) {
    cls = "warning";
    icon = "alert";
    text = t("banner.cleanHigh", { n: severe });
  } else {
    text = t("banner.clean");
  }

  return (
    <div className={`banner ${cls}`} role={cls === "danger" ? "alert" : "status"}>
      <Icon name={icon} size={22} />
      <div className="grow"><b>{text}</b></div>
      <Link href="/security" className="btn small">{report ? t("banner.details") : t("banner.check")}</Link>
    </div>
  );
}
