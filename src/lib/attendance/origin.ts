// NextRequest.nextUrl may use an internal loopback host behind the dev server.
// Compare the browser Origin with the actual request Host, keeping CSRF protection.
export function sameRequestOrigin(origin: string | null, host: string | null): string {
 if (!origin || !host) throw new Error('คำขอไม่ถูกต้อง');
 try {
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.host !== host) throw new Error();
  return url.origin;
 } catch { throw new Error('คำขอไม่ถูกต้อง'); }
}

// Resolve a post-login path against this origin. Browsers strip tabs/newlines from URLs,
// so prefix checks alone allow "/\t/evil.example" to become "//evil.example".
export function safeNext(next: string | undefined, origin: string): string {
 try {
  const url = new URL(next || '/', origin);
  return url.origin === origin ? url.pathname + url.search + url.hash : '/';
 } catch { return '/'; }
}
