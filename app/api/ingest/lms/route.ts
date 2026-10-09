import { isNptelRequest } from '@/lib/auth';
import { catchUpAfterResponse, syncIfStale } from '@/lib/catch-up';
import { requireEnv } from '@/lib/env';
import { parseLmsPayload, savePostQuizzes } from '@/lib/sources/lms-posts';
import { getSyncStatus, setSyncStatus } from '@/lib/sync';

/**
 * The Lume Chrome extension posts your MUJ courses' posts (Activity Feed and Announcements) here,
 * every few hours while Chrome is open. Quizzes announced in them become LMS tasks, with the same
 * reminders and alarms. Authorized by the extension's key from Settings, not CRON_SECRET.
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
  const payload = parseLmsPayload(await request.json().catch(() => null));
  if (!payload) return reply({ error: 'Expected { courses, posts }' }, 400);

  const now = Date.now();
  const previous = await getSyncStatus('manipal-posts');
  // Keeps when posts were last read fine, for the "not checked for 2 days" warning on Home.
  const okAt = previous?.ok ? previous.at : (previous?.okAt ?? null);

  // The run failed as a whole (signed out of the LMS): the quizzes found before stay as they are.
  if (payload.error) {
    await setSyncStatus('manipal-posts', { at: now, ok: false, message: payload.error, okAt });
    catchUpAfterResponse();
    return reply({ ok: false });
  }

  const quizzes = await savePostQuizzes(payload, new URL(requireEnv('MUJ_ICS_URL')).origin, now);
  const upcoming = quizzes.filter((q) => q.dueAt > now).sort((a, b) => a.dueAt - b.dueAt);
  const failed = payload.courses.filter((c) => !c.ok);
  await setSyncStatus('manipal-posts', {
    at: now,
    ok: failed.length === 0,
    okAt: failed.length === 0 ? now : okAt,
    message: failed.length
      ? `Couldn’t read the posts in ${failed.map((c) => c.name).join(', ')}: ${failed[0].error ?? 'unknown error'}`
      : `${payload.posts.length} posts in ${payload.courses.length} courses, ${upcoming.length} upcoming ${upcoming.length === 1 ? 'quiz' : 'quizzes'} in them`,
  });

  // Straight into the LMS sync, so a newly posted quiz notifies now, not at the next hourly sync.
  const results = await syncIfStale(5_000);
  catchUpAfterResponse();
  const changes = results?.find((r) => r.source === 'manipal');
  return reply({
    ok: true,
    quizzes: upcoming.map((q) => ({ course: q.course, title: q.title, dueAt: new Date(q.dueAt).toISOString(), url: q.url })),
    synced: changes?.ok ?? false,
  });
}
