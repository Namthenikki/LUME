import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { cache } from 'react';
import { db } from './firebase-admin';
import type { Source, TaskType } from './sources/types';
import type { Stage } from './stages';

export type TaskStatus = 'pending' | 'done' | 'cancelled';

/** A document in `tasks/{id}`. */
export interface TaskDoc {
  source: Source;
  externalId: string;
  course: string;
  title: string;
  type: TaskType;
  dueAt: Timestamp;
  opensAt: Timestamp | null;
  url: string | null;
  status: TaskStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** When it was marked done; used for "on time". Missing on tasks from before it existed. */
  doneAt?: Timestamp | null;
  /** Stages that have fired, or were skipped because they were already past. */
  notifiedStages: Stage[];
  snoozedUntil: Timestamp | null;
}

/** A task as the UI gets it: plain data, times in epoch ms. */
export type TaskView = {
  id: string;
  source: Source;
  course: string;
  title: string;
  type: TaskType;
  dueAt: number;
  opensAt: number | null;
  url: string | null;
  status: TaskStatus;
  doneAt: number | null;
  notifiedStages: Stage[];
  snoozedUntil: number | null;
};

export function taskId(source: Source, externalId: string): string {
  return createHash('sha256').update(`${source}:${externalId}`).digest('hex').slice(0, 20);
}

export const tasksCollection = () => db().collection('tasks');

export function toView(id: string, t: TaskDoc): TaskView {
  return {
    id,
    source: t.source,
    course: t.course,
    title: t.title,
    type: t.type,
    dueAt: t.dueAt.toMillis(),
    opensAt: t.opensAt?.toMillis() ?? null,
    url: t.url,
    status: t.status,
    doneAt: t.doneAt?.toMillis() ?? null,
    notifiedStages: t.notifiedStages,
    snoozedUntil: t.snoozedUntil?.toMillis() ?? null,
  };
}

/** All tasks, soonest first. Cached per request, so the layout and the page share one read. */
export const listTasks = cache(async (): Promise<TaskView[]> => {
  const snap = await tasksCollection().orderBy('dueAt').get();
  return snap.docs.map((d) => toView(d.id, d.data() as TaskDoc));
});

export async function getTask(id: string): Promise<(TaskDoc & { id: string }) | null> {
  const doc = await tasksCollection().doc(id).get();
  return doc.exists ? { id, ...(doc.data() as TaskDoc) } : null;
}

export async function markDone(id: string): Promise<void> {
  const now = Timestamp.now();
  await tasksCollection().doc(id).update({ status: 'done', doneAt: now, snoozedUntil: null, updatedAt: now });
}

export async function markPending(id: string): Promise<void> {
  await tasksCollection().doc(id).update({ status: 'pending', doneAt: null, updatedAt: Timestamp.now() });
}

export const SNOOZE_HOURS = 2;

export async function snooze(id: string): Promise<Date> {
  const until = new Date(Date.now() + SNOOZE_HOURS * 3_600_000);
  await tasksCollection().doc(id).update({ snoozedUntil: Timestamp.fromDate(until), updatedAt: Timestamp.now() });
  return until;
}
