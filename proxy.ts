/**
 * In Next 16 the middleware file is called `proxy.ts`. Creating `middleware.ts`
 * instead silently does nothing.
 *
 * Only presence of the cookie is checked here — the signature is verified in
 * the page itself. Proxy runs on every request and should stay cheap; it is an
 * optimistic check, not the security boundary.
 */
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/login") || pathname.startsWith("/api/cron")) {
    return NextResponse.next();
  }

  if (!request.cookies.get("ads_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|webp)$).*)"],
};
