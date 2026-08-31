import { NextResponse } from "next/server";

const SESSION_COOKIE = "cip_session";

// Real auth gate: /dashboard/** requires a CIP session (set by
// lib/cipSession.js's loginCip after a successful login); an
// already-authenticated visit to the login page skips straight to
// /dashboard instead of showing the form again.
export function proxy(request) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (pathname.startsWith("/dashboard") && !hasSession) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (pathname === "/" && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
