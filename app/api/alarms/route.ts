import { isDeviceToken, isPairedAlarmDevice } from '@/lib/alarm-devices';
import { actionToken } from '@/lib/auth';
import { catchUpAfterResponse } from '@/lib/catch-up';
import { reminderPush } from '@/lib/notify';
import { isQuiet } from '@/lib/quiet';
import { ALARM_STAGES, stageTimes } from '@/lib/stages';
import { listTasks } from '@/lib/tasks';

const ALARM_STAGE_NAMES = new Set<string>(ALARM_STAGES.map((a) => a.stage));

/**
 * The Android app's schedule: for each pending task due in the next week, the times it should ring
 * (30 and 10 minutes before), plus what it needs to show the alarm and mark the task done from it.
 * Apps that send `X-Lume-Reminders: 1` also get every other reminder ("6 hours left", "Due today"...)
 * as `kind: "reminder"`, which they show as a notification at its exact minute; Lume then stops
 * sending those as web pushes to that phone (lib/remind.ts). Authorized by the paired device token.
 */
export async function GET(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const withReminders = request.headers.get('x-lume-reminders') === '1';
  if (!isDeviceToken(token) || !(await isPairedAlarmDevice(token, withReminders))) return new Response('Unauthorized', { status: 401 });
  // The phone checks in every 15 minutes: a chance to catch up on anything the scheduler missed.
  catchUpAfterResponse();

  const now = Date.now();
  const alarms = [];
  // Tasks still pending (overdue ones too, for the "Missed" reminder); the app checks this list before
  // it rings or shows anything, so a task marked done since the last sync stays quiet.
  const pendingTaskIds: string[] = [];
  for (const t of await listTasks()) {
    if (t.status === 'pending') pendingTaskIds.push(t.id);
    if (t.status !== 'pending' || t.dueAt <= now || t.dueAt - now > 7 * 86_400_000) continue;
    for (const { stage, minutes } of ALARM_STAGES) {
      const at = t.dueAt - minutes * 60_000;
      // Snoozed tasks don't ring until the snooze ends, and nothing rings in quiet hours.
      if (at <= now || (t.snoozedUntil && at < t.snoozedUntil) || isQuiet(at)) continue;
      alarms.push({
        id: `${t.id}:${stage}`,
        taskId: t.id,
        at,
        minutesLeft: minutes,
        title: t.title,
        course: t.course,
        dueAt: t.dueAt,
        actionToken: actionToken(t.id),
      });
    }
    if (!withReminders) continue;

    // The same reminders the server would push, each with the text it would have at its own time.
    const info = { id: t.id, course: t.course, title: t.title, type: t.type, dueAt: new Date(t.dueAt) };
    const reminder = (id: string, at: number, push: { title: string; body: string }) => ({
      kind: 'reminder',
      id,
      taskId: t.id,
      at,
      title: push.title,
      body: push.body,
      dueAt: t.dueAt,
      actionToken: actionToken(t.id),
    });
    for (const [stage, date] of stageTimes(info.dueAt)) {
      const at = date.getTime();
      if (ALARM_STAGE_NAMES.has(stage) || at <= now || t.notifiedStages.includes(stage) || (t.snoozedUntil && at < t.snoozedUntil)) continue;
      alarms.push(reminder(`${t.id}:${stage}`, at, reminderPush(info, [stage], false, date)));
    }
    if (t.snoozedUntil && t.snoozedUntil > now) {
      alarms.push(reminder(`${t.id}:snooze-end`, t.snoozedUntil, reminderPush(info, [], true, new Date(t.snoozedUntil))));
    }
  }
  return Response.json({ now, alarms: alarms.sort((a, b) => a.at - b.at), pendingTaskIds }, { headers: { 'cache-control': 'no-store' } });
}
