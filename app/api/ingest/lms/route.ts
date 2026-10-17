import { isNptelRequest } from '@/lib/auth';
import { catchUpAfterResponse, syncIfStale } from '@/lib/catch-up';
import { requireEnv } from '@/lib/env';
import { parseLmsPayload, saveLmsQuizzes, upcomingLmsQuizzes } from '@/lib/sources/lms-posts';
import { getSyncStatus, setSyncStatus } from '@/lib/sync';

/**
 * The Lume Chrome extension posts your MUJ courses' posts (Activity Feed and Announcements) and
 * their Quizzes tool lists here, every hour while Chrome is open and right after you submit a quiz.
 * Quizzes announced in posts become LMS tasks, with the same reminders and alarms; the Quizzes tool
 * gives each quiz's start and ticks off the ones you've attempted. Authorized by the extension's
 * key from Settings, not CRON_SECRET.
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
    await setSyncStatus('manipal-posts', { at: now, ok: false, message: payload.error, okAt, version: payload.version });
    catchUpAfterResponse();
    return reply({ ok: false });
  }

  const saved = await saveLmsQuizzes(payload, new URL(requireEnv('MUJ_ICS_URL')).origin, now);
  const upcoming = upcomingLmsQuizzes(saved, now);
  const failed = payload.courses.filter((c) => !c.ok);
  const quizzesFailed = payload.courses.filter((c) => c.ok && c.quizzesError);
  const ok = failed.length === 0 && quizzesFailed.length === 0;
  await setSyncStatus('manipal-posts', {
    at: now,
    ok,
    okAt: ok ? now : okAt,
    version: payload.version,
    message: failed.length
      ? `Couldn’t read the posts in ${failed.map((c) => c.name).join(', ')}: ${failed[0].error ?? 'unknown error'}`
      : quizzesFailed.length
        ? `Couldn’t read the quizzes in ${quizzesFailed.map((c) => c.name).join(', ')}: ${quizzesFailed[0].quizzesError}`
        : `${payload.posts.length} ${payload.posts.length === 1 ? 'post' : 'posts'}${payload.quizzes ? ` and ${payload.quizzes.length} ${payload.quizzes.length === 1 ? 'quiz' : 'quizzes'}` : ''} in ${payload.courses.length} ${payload.courses.length === 1 ? 'course' : 'courses'}, ${upcoming.length} upcoming ${upcoming.length === 1 ? 'quiz' : 'quizzes'}`,
  });

  // Straight into the LMS sync, so a new quiz notifies now and an attempted one is ticked now, not at the next hourly sync.
  const results = await syncIfStale(5_000);
  catchUpAfterResponse();
  const changes = results?.find((r) => r.source === 'manipal');
  const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
  return reply({
    ok: true,
    quizzes: upcoming.map((q) => ({ course: q.course, title: q.title, startsAt: iso(q.startsAt), dueAt: iso(q.dueAt), url: q.url, done: q.done })),
    synced: changes?.ok ?? false,
  });
}
