import { Timestamp } from 'firebase-admin/firestore';
import { after } from 'next/server';
import { db } from './firebase-admin';
import { reminderPush } from './notify';
import { pushToAll } from './push';
import { stageTimes } from './stages';
import { type TaskDoc, tasksCollection } from './tasks';

export type RemindResult = { checked: number; sent: { title: string; stages: string[]; devices: number }[] };

/**
 * Runs every ~15 minutes. For each pending task, fires every stage whose time has come and
 * hasn't fired yet, as one combined notification. Snoozed tasks wait; when a snooze ends,
 * the task gets a reminder even if no stage is due.
 */
export async function runReminders(now = new Date()): Promise<RemindResult> {
  const snap = await tasksCollection().where('status', '==', 'pending').get();
  const sent: RemindResult['sent'] = [];

  for (const doc of snap.docs) {
    const t = doc.data() as TaskDoc;
    const snoozedUntil = t.snoozedUntil?.toDate();
    if (snoozedUntil && snoozedUntil > now) continue;

    const dueAt = t.dueAt.toDate();
    const due = stageTimes(dueAt)
      .filter(([stage, at]) => at <= now && !t.notifiedStages.includes(stage))
      .map(([stage]) => stage);
    const snoozeEnded = !!snoozedUntil;
    if (due.length === 0 && !snoozeEnded) continue;

    const push = reminderPush({ id: doc.id, course: t.course, title: t.title, type: t.type, dueAt }, due, snoozeEnded, now);
    const { sent: devices } = await pushToAll(push);
    await doc.ref.update({
      notifiedStages: [...t.notifiedStages, ...due],
      snoozedUntil: null,
      updatedAt: Timestamp.fromDate(now),
    });
    sent.push({ title: t.title, stages: snoozeEnded && due.length === 0 ? ['snooze'] : due, devices });
  }

  return { checked: snap.size, sent };
}

const lastRun = () => db().collection('meta').doc('remind');

/**
 * Runs the reminders unless a run started in the last minute. The scheduler calls this every
 * 5 minutes, and so do the app and the Android alarm sync whenever they talk to Lume, so a late or
 * skipped scheduler run doesn't delay reminders. The claim is a transaction, so two callers at
 * the same moment can't both send the same reminder.
 */
export async function runRemindersIfIdle(now = new Date()): Promise<RemindResult | null> {
  const claimed = await db().runTransaction(async (tx) => {
    const doc = await tx.get(lastRun());
    if (doc.exists && now.getTime() - (doc.get('at') as number) < 60_000) return false;
    tx.set(lastRun(), { at: now.getTime() });
    return true;
  });
  return claimed ? runReminders(now) : null;
}

/** Checks reminders after the current response is sent, so the caller isn't slowed down. */
export function remindAfterResponse(): void {
  after(() => runRemindersIfIdle().catch((err) => console.error('Reminder check failed', err)));
}

/** When reminders were last checked, for Settings. */
export async function lastReminderCheck(): Promise<number | null> {
  const doc = await lastRun().get();
  return doc.exists ? (doc.get('at') as number) : null;
}
