import { Timestamp } from 'firebase-admin/firestore';
import { phoneShowsReminders } from './alarm-devices';
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
  // The Android app shows these at their exact minute itself (app/api/alarms), so its browser is skipped.
  const skipAppDevices = await phoneShowsReminders();

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
    const { sent: devices } = await pushToAll({ ...push, skipAppDevices });
    await doc.ref.update({
      notifiedStages: [...t.notifiedStages, ...due],
      snoozedUntil: null,
      updatedAt: Timestamp.fromDate(now),
    });
    sent.push({ title: t.title, stages: snoozeEnded && due.length === 0 ? ['snooze'] : due, devices });
  }

  return { checked: snap.size, sent };
}
