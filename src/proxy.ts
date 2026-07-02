import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPaths = [
  "/sign-in",
  "/sign-up",
  "/verify-2fa",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/invite",
  "/accept-invitation",
  "/api/auth",
  "/n/",
  "/api/stream/",
  "/api/health",
  "/api/paddle/webhook",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    const response = NextResponse.next();
    response.headers.set("x-pathname", pathname);
    return response;
  }

  // Check for Better Auth session cookie
  const sessionToken =
    request.cookies.get("better-auth.session_token") ??
    request.cookies.get("__Secure-better-auth.session_token");

  if (!sessionToken) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Forward pathname as a request header so Server Components can read it
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("x-pathname", pathname);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|logo.svg|sitemap.xml|robots.txt).*)",
  ],
};
