import { saveConfig } from "@/lib/config";
import { sameOrigin } from "@/lib/http";
import { errorMessage, getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { t } = await getI18n();
  if (!sameOrigin(req)) return Response.json({ ok: false, error: t("common.forbidden") }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { roots?: unknown; max_depth?: unknown } | null;
  if (!body) return Response.json({ ok: false, error: t("common.badRequest") }, { status: 400 });
  try {
    const cfg = await saveConfig({ roots: body.roots, max_depth: body.max_depth });
    return Response.json({ ok: true, config: cfg });
  } catch (e) {
    return Response.json({ ok: false, error: errorMessage(e, t) }, { status: 400 });
  }
}
