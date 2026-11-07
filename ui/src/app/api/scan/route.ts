import { runScan } from "@/lib/agent";
import { sameOrigin } from "@/lib/http";
import { errorMessage, getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { t, pm } = await getI18n();
  if (!sameOrigin(req)) return Response.json({ ok: false, error: t("common.forbidden") }, { status: 403 });
  try {
    const message = await runScan(pm);
    return Response.json({ ok: true, message });
  } catch (e) {
    return Response.json({ ok: false, error: errorMessage(e, t) }, { status: 500 });
  }
}
