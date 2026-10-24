import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/onboarding", "/radar", "/shows", "/calendar", "/profile", "/connections", "/setup", "/artists", "/merch", "/cart", "/plans"];

/** Optimistic check only: every page and API route re-checks the session server-side. */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  const hasCookie =
    req.cookies.has("authjs.session-token") || req.cookies.has("__Secure-authjs.session-token");
  if (!hasCookie) return NextResponse.redirect(new URL("/", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
