const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * True when the request comes from this UI itself:
 *  - Host must be a loopback name (blocks DNS-rebinding style access)
 *  - Origin must match Host (blocks other web pages from calling local actions)
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return false;
  try {
    const h = new URL(`http://${host}`).hostname;
    return LOCAL_HOSTS.has(h) && new URL(origin).host === host;
  } catch {
    return false;
  }
}
