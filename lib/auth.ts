import { createHmac, timingSafeEqual } from 'node:crypto';
import { requireEnv } from './env';

export const OWNER_COOKIE = 'lume_owner';

function sign(value: string): string {
  return createHmac('sha256', requireEnv('AUTH_SECRET')).update(value).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** True if the request carries `Authorization: Bearer <CRON_SECRET>` (what the scheduler sends). */
export function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(request.headers.get('authorization') ?? '', `Bearer ${secret}`);
}

/*
 * Owner login: entering OWNER_PASSWORD once sets a year-long httpOnly cookie holding a signature
 * of a fixed value. Nobody can forge it without AUTH_SECRET; changing AUTH_SECRET signs every device out.
 */

export function ownerToken(): string {
  return sign('owner:v1');
}

export function isOwnerToken(value: string | undefined): boolean {
  return !!value && safeEqual(value, ownerToken());
}

export function passwordMatches(input: string): boolean {
  // Compare signatures, so the comparison is constant-time whatever the input's length.
  return safeEqual(sign(`pw:${input}`), sign(`pw:${requireEnv('OWNER_PASSWORD')}`));
}

/** Secure whenever the request came over https (always, once deployed); plain http only for local testing. */
export function ownerCookieOptions(https: boolean) {
  return {
    httpOnly: true,
    secure: https,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  };
}

/**
 * The key the NPTEL Chrome extension sends. It can only post NPTEL deadlines, so the extension
 * never holds CRON_SECRET. Settings shows it; changing AUTH_SECRET replaces it.
 */
export function nptelKey(): string {
  return sign('ingest:nptel:v1');
}

export function isNptelRequest(request: Request): boolean {
  return safeEqual(request.headers.get('authorization') ?? '', `Bearer ${nptelKey()}`);
}

/** Per-task token carried in each notification, so its buttons work from the service worker. */
export function actionToken(taskId: string): string {
  return sign(`action:${taskId}`);
}

export function isActionToken(taskId: string, token: unknown): boolean {
  return typeof token === 'string' && safeEqual(token, actionToken(taskId));
}
