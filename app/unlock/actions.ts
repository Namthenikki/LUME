'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { OWNER_COOKIE, ownerCookieOptions, ownerToken, passwordMatches } from '@/lib/auth';

export async function unlockAction(_prev: { error: string } | null, form: FormData): Promise<{ error: string }> {
  const password = String(form.get('password') ?? '');
  const next = String(form.get('next') ?? '');

  if (!passwordMatches(password)) {
    await new Promise((r) => setTimeout(r, 700)); // slows down guessing
    return { error: 'That password doesn’t match. It’s OWNER_PASSWORD in your settings.' };
  }
  (await cookies()).set(OWNER_COOKIE, ownerToken(), ownerCookieOptions);
  redirect(next.startsWith('/dashboard') ? next : '/dashboard');
}
