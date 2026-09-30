import { isNptelRequest } from '@/lib/auth';
import { pushToAll } from '@/lib/push';
import { catchUpAfterResponse } from '@/lib/catch-up';
import { NptelAdapter, parseNptelPayload } from '@/lib/sources/nptel';
import { getSyncStatus, runSync, setSyncStatus } from '@/lib/sync';

/**
 * The Lume Chrome extension posts the NPTEL deadlines it read here, every few hours while Chrome
 * is open. They go through the same sync as the LMS feed, so reminders and alarms work the same.
 * Authorized by the NPTEL key from Settings, not CRON_SECRET.
 */

// The extension calls from its own origin; the key, not a cookie, is what authorizes it.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

export async function POST(request: Request) {
  if (!isNptelRequest(request)) return reply({ error: 'Wrong key. Copy it again from Lume → Settings → NPTEL.' }, 401);
  const payload = parseNptelPayload(await request.json().catch(() => null));
  if (!payload) return reply({ error: 'Expected { courses, items }' }, 400);

  const now = Date.now();
  const previous = await getSyncStatus('nptel');

  // The run failed as a whole (signed out, NPTEL down): say so once on the phone, not every run.
  if (payload.error) {
    await setSyncStatus('nptel', { at: now, ok: false, message: payload.error });
    if (previous?.ok !== false) await pushToAll({ title: 'NPTEL sync stopped', body: payload.error });
    return reply({ ok: false });
  }

  const [result] = await runSync([new NptelAdapter(payload)]);
  catchUpAfterResponse();
  if (!result.ok) return reply({ error: result.error }, 500);

  const failed = payload.courses.filter((c) => !c.ok);
  const names = payload.courses.map((c) => c.name || c.id).join(', ');
  await setSyncStatus('nptel', {
    at: now,
    ok: failed.length === 0,
    message: failed.length
      ? `Couldn’t read ${failed.map((c) => c.name || c.id).join(', ')}: ${failed[0].error ?? 'unknown error'}`
      : `${payload.items.length} ${payload.items.length === 1 ? 'assignment' : 'assignments'} in ${names}`,
  });

  const count = (kind: string) => result.changes.filter((c) => c.kind === kind).length;
  return reply({ ok: true, inFeed: result.inFeed, new: count('new'), changed: count('changed'), submitted: count('submitted'), cancelled: count('cancelled') });
}
