import { type NextRequest, NextResponse } from 'next/server';
import { isOwnerToken, OWNER_COOKIE } from './lib/auth';

/** The app pages need the owner cookie; anyone else is sent to the unlock page. */
export function proxy(request: NextRequest) {
  if (isOwnerToken(request.cookies.get(OWNER_COOKIE)?.value)) return NextResponse.next();
  const unlock = new URL('/unlock', request.url);
  unlock.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(unlock);
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
