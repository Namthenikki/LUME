import { HOUR, IST_OFFSET } from './time';

/** Reminder stages after `new`, in firing order. */
export const STAGES = ['48h', '24h', 'dayof', '6h', '3h', '1h', '30m', '10m', 'overdue'] as const;
export type Stage = 'new' | (typeof STAGES)[number];

/** Stages that stay on screen until acted on. The Android app also rings an alarm at ALARM_STAGES. */
export const STICKY_STAGES: Stage[] = ['6h', '3h', '1h', '30m', '10m'];
export const ALARM_STAGES = [
  { stage: '30m', minutes: 30 },
  { stage: '10m', minutes: 10 },
] as const;

export const STAGE_LABEL: Record<(typeof STAGES)[number], string> = {
  '48h': '48 hours before',
  '24h': '24 hours before',
  dayof: '9 AM on the day',
  '6h': '6 hours before',
  '3h': '3 hours before',
  '1h': '1 hour before',
  '30m': '30 minutes before',
  '10m': '10 minutes before',
  overdue: 'Right after the deadline',
};

/** When each stage fires for a deadline. `dayof` is 9:00 AM IST on the due day, if that is before the deadline. */
export function stageTimes(dueAt: Date): [(typeof STAGES)[number], Date][] {
  const due = dueAt.getTime();
  const dayStart = Math.floor((due + IST_OFFSET) / (24 * HOUR)) * 24 * HOUR - IST_OFFSET;
  const offsets: Record<(typeof STAGES)[number], number> = {
    '48h': due - 48 * HOUR,
    '24h': due - 24 * HOUR,
    dayof: dayStart + 9 * HOUR,
    '6h': due - 6 * HOUR,
    '3h': due - 3 * HOUR,
    '1h': due - HOUR,
    '30m': due - 30 * 60_000,
    '10m': due - 10 * 60_000,
    overdue: due,
  };
  return STAGES.filter((s) => s !== 'dayof' || offsets.dayof < due).map((s) => [s, new Date(offsets[s])]);
}

/** Stages already in the past when a deadline is first seen; they are recorded as fired so they never fire late. */
export function pastStages(dueAt: Date, now: Date): Stage[] {
  return stageTimes(dueAt)
    .filter(([, at]) => at <= now)
    .map(([stage]) => stage);
}

type Remindable = {
  id: string;
  title: string;
  course: string;
  dueAt: number;
  status: string;
  notifiedStages: Stage[];
  snoozedUntil: number | null;
};

export type UpcomingReminder = { taskId: string; title: string; course: string; at: number; label: string };

/** Every reminder still to come, soonest first. A snoozed task's reminders wait for its snooze to end. */
export function upcomingReminders(tasks: Remindable[], now: number): UpcomingReminder[] {
  const out: UpcomingReminder[] = [];
  for (const t of tasks) {
    if (t.status !== 'pending') continue;
    const snoozed = t.snoozedUntil && t.snoozedUntil > now ? t.snoozedUntil : null;
    if (snoozed) out.push({ taskId: t.id, title: t.title, course: t.course, at: snoozed, label: 'When the snooze ends' });
    for (const [stage, at] of stageTimes(new Date(t.dueAt))) {
      const time = at.getTime();
      if (time <= now || t.notifiedStages.includes(stage) || (snoozed && time <= snoozed)) continue;
      out.push({ taskId: t.id, title: t.title, course: t.course, at: time, label: STAGE_LABEL[stage] });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
