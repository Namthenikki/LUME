import { isActionToken, isOwnerToken, OWNER_COOKIE } from '@/lib/auth';
import { getTask, markDone, snooze } from '@/lib/tasks';
import type { NextRequest } from 'next/server';

/**
 * Called by the service worker when a notification's "Mark done" or "Remind in 2h" is tapped.
 * Authorized by the task's signed token from the notification, or by the owner cookie.
 */
export async function POST(request: NextRequest, ctx: RouteContext<'/api/tasks/[id]/action'>) {
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { action?: string; token?: string };

  if (!isActionToken(id, body.token) && !isOwnerToken(request.cookies.get(OWNER_COOKIE)?.value)) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!(await getTask(id))) return new Response('Not found', { status: 404 });

  if (body.action === 'done') {
    await markDone(id);
    return Response.json({ ok: true });
  }
  if (body.action === 'snooze') {
    const until = await snooze(id);
    return Response.json({ ok: true, snoozedUntil: until.getTime() });
  }
  return new Response('Unknown action', { status: 400 });
}
