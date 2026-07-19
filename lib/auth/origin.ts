export function getRequestOrigin(request: Request) {
  const proto = request.headers.get("x-forwarded-proto");
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    return `${proto ?? new URL(request.url).protocol.replace(":", "")}://${host}`;
  }
  return process.env.AUTH_URL;
}
