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
  "/api/sentry-config",
  "/api/paddle/webhook",
  "/api/github/webhook",
];

/**
 * Per-request CSP. 'strict-dynamic' + nonce: only scripts Next renders with
 * this nonce run, plus scripts those load (Paddle.js). Next reads the nonce
 * from the request's CSP header and attaches it during SSR, which is why the
 * root layout forces dynamic rendering. React needs eval in dev only.
 */
function contentSecurityPolicy(nonce: string): string {
  const devEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  return [
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval}`,
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!publicPaths.some((p) => pathname.startsWith(p))) {
    // Check for Better Auth session cookie
    const sessionToken =
      request.cookies.get("better-auth.session_token") ??
      request.cookies.get("__Secure-better-auth.session_token");

    if (!sessionToken) {
      const signInUrl = new URL("/sign-in", request.url);
      signInUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);

  // Forward pathname and nonce as request headers so Server Components can read them
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("x-pathname", pathname);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|logo.svg|og-image.png|sitemap.xml|robots.txt|openapi.json).*)",
  ],
};
