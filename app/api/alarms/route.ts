import { isDeviceToken, isPairedAlarmDevice } from '@/lib/alarm-devices';
import { actionToken } from '@/lib/auth';
import { isQuiet } from '@/lib/quiet';
import { catchUpAfterResponse } from '@/lib/catch-up';
import { ALARM_STAGES } from '@/lib/stages';
import { listTasks } from '@/lib/tasks';

/**
 * The Android app's alarm schedule: for each pending task due in the next week, the times it
 * should ring (30 and 10 minutes before), plus what it needs to show the alarm and mark the task
 * done from it. Authorized by the paired device token.
 */
export async function GET(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!isDeviceToken(token) || !(await isPairedAlarmDevice(token))) return new Response('Unauthorized', { status: 401 });
  // The phone checks in every 15 minutes: a chance to catch up on anything the scheduler missed.
  catchUpAfterResponse();

  const now = Date.now();
  const alarms = [];
  // Tasks still worth ringing for; the app checks this list before it rings, so a task marked done
  // since the last sync stays quiet.
  const pendingTaskIds: string[] = [];
  for (const t of await listTasks()) {
    if (t.status !== 'pending' || t.dueAt <= now || t.dueAt - now > 7 * 86_400_000) continue;
    pendingTaskIds.push(t.id);
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
  }
  return Response.json({ now, alarms: alarms.sort((a, b) => a.at - b.at), pendingTaskIds }, { headers: { 'cache-control': 'no-store' } });
}
