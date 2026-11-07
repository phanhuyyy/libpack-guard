import { loadResult } from "@/lib/data";
import { sameOrigin } from "@/lib/http";
import { getI18n } from "@/lib/i18n-server";
import { malwarePackages, runSecurityCheck } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { t, pm } = await getI18n();
  if (!sameOrigin(req)) return Response.json({ ok: false, error: t("common.forbidden") }, { status: 403 });
  const res = await loadResult(pm);
  if (!res) return Response.json({ ok: false, error: t("common.noData") }, { status: 400 });
  try {
    const report = await runSecurityCheck(res.packages, res.scanned_at, pm);
    return Response.json({
      ok: true,
      malware: malwarePackages(report).length,
      vulns: report.advisories.filter((a) => a.kind === "vuln").length,
    });
  } catch (e) {
    return Response.json({ ok: false, error: t("sec.err.osv", { msg: (e as Error).message }) }, { status: 502 });
  }
}
