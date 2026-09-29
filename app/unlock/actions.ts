'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { OWNER_COOKIE, ownerCookieOptions, ownerToken, passwordMatches } from '@/lib/auth';

export async function unlockAction(_prev: { error: string } | null, form: FormData): Promise<{ error: string }> {
  const password = String(form.get('password') ?? '');
  const next = String(form.get('next') ?? '');

  if (!passwordMatches(password)) {
    await new Promise((r) => setTimeout(r, 700)); // slows down guessing
    return { error: 'That password doesn’t match. It’s OWNER_PASSWORD in your settings.' };
  }
  const h = await headers();
  const https = (h.get('x-forwarded-proto') ?? new URL(h.get('origin') ?? 'http://x').protocol.replace(':', '')) === 'https';
  (await cookies()).set(OWNER_COOKIE, ownerToken(), ownerCookieOptions(https));
  redirect(next.startsWith('/dashboard') ? next : '/dashboard');
}
