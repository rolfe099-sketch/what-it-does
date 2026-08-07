import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('session');
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

// Signed-in pages only. The API is deliberately excluded so that webhooks and
// public endpoints keep working — which means every route under /api has to
// establish who is asking for itself.
export const config = {
  matcher: ['/dashboard/:path*', '/projects/:path*', '/settings/:path*', '/admin/:path*'],
};
