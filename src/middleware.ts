import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(_req: NextRequest) {
  // 認証を無効化して素通し
  if (process.env.AMICA_AUTH_ENABLED !== "true") {
    return NextResponse.next();
  }

  // ...existing code...
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|sw.js|api/health).*)"],
};