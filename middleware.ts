import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  console.log(`[Middleware] ${req.method} ${req.nextUrl.pathname}`);
  // You must return something — usually the request continues as-is:
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/protected/:path*'],
};
