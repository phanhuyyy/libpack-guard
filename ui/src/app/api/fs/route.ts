import { listDirs, shortcuts } from "@/lib/config";
import { sameOrigin } from "@/lib/http";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

/** POST { path?: string } → subfolders of path (folder names only, never file contents). */
export async function POST(req: Request) {
  const { t } = await getI18n();
  if (!sameOrigin(req)) return Response.json({ error: t("common.forbidden") }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { path?: unknown };
  if (body.path === undefined || body.path === "") {
    return Response.json({ shortcuts: shortcuts() });
  }
  if (typeof body.path !== "string" || body.path.length > 1000) {
    return Response.json({ error: t("fs.err.invalid") }, { status: 400 });
  }
  try {
    return Response.json(await listDirs(body.path));
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    const msg =
      code === "ENOENT" ? t("fs.err.notFound") :
      code === "EPERM" || code === "EACCES" ? t("fs.err.noPerm") :
      code === "ENOTDIR" ? t("fs.err.notDir") : (e as Error).message;
    return Response.json({ error: msg }, { status: 400 });
  }
}
