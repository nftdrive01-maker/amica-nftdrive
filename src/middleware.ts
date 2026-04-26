import { auth } from "./auth"

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthRoute = req.nextUrl.pathname.startsWith("/api/auth");
  const isLoginRoute = req.nextUrl.pathname === "/login";

  if (isAuthRoute) return undefined;

  if (!isLoggedIn && !isLoginRoute) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return Response.redirect(loginUrl);
  }

  if (isLoggedIn && isLoginRoute) {
    const homeUrl = new URL("/", req.nextUrl.origin);
    return Response.redirect(homeUrl);
  }

  return undefined;
})

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.json|splashscreen.html|build|.*\\.png|.*\\.jpg|.*\\.vrm|.*\\.svg).*)"],
}
