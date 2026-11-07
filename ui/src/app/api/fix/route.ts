import { sameOrigin } from "@/lib/http";
import { errorMessage, getI18n } from "@/lib/i18n-server";
import { applyAction, planAction, planUpgrade } from "@/lib/updater";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

/**
 * POST { root, name, version, mode: "plan" | "apply", target? }
 * Without target: fix a vulnerability (server picks the nearest OSV fix).
 * With target: upgrade to a version offered in the Updates tab (server re-verifies it).
 * The client only identifies an installation from the scan; the server builds the npm command.
 */
export async function POST(req: Request) {
  const { t, pm } = await getI18n();
  if (!sameOrigin(req)) return Response.json({ ok: false, error: t("common.forbidden") }, { status: 403 });
  const body = (await req.json().catch(() => null)) as
    | { root?: unknown; name?: unknown; version?: unknown; mode?: unknown; target?: unknown }
    | null;
  if (
    !body || typeof body.root !== "string" || typeof body.name !== "string" || typeof body.version !== "string" ||
    (body.target !== undefined && typeof body.target !== "string")
  ) {
    return Response.json({ ok: false, error: t("common.badRequest") }, { status: 400 });
  }
  const target = body.target as string | undefined;
  try {
    if (body.mode === "apply") {
      const out = await applyAction(pm, body.root, body.name, body.version, target);
      return Response.json({ ok: true, ...out });
    }
    const action = target
      ? await planUpgrade(pm, body.root, body.name, body.version, target)
      : await planAction(pm, body.root, body.name, body.version);
    return Response.json({ ok: true, action });
  } catch (e) {
    return Response.json({ ok: false, error: errorMessage(e, t) }, { status: 400 });
  }
}
