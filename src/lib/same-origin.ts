/**
 * Same-origin check for the public JSON APIs (a light CSRF guard).
 *
 * Behind a hosting proxy (Render, Netlify…) `request.url` can carry the
 * internal address rather than the public domain, so comparing the browser's
 * Origin with `new URL(request.url).origin` wrongly rejects every real request.
 * Compare the Origin's host with the Host the browser actually used instead
 * (`x-forwarded-host` / `host`), falling back to the request URL.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  let host: string;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const first = (v: string | null) => v?.split(",")[0]?.trim().toLowerCase() || null;
  const candidates = [
    first(request.headers.get("x-forwarded-host")),
    first(request.headers.get("host")),
    new URL(request.url).host.toLowerCase(),
  ];
  return candidates.includes(host);
}
