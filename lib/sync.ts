import { Timestamp } from 'firebase-admin/firestore';
import { db } from './firebase-admin';
import { deadlineChangedPush, newTaskPush } from './notify';
import { pushToAll } from './push';
import type { SourceAdapter } from './sources/types';
import { pastStages } from './stages';
import { type TaskDoc, taskId } from './tasks';

export type SyncChange = {
  kind: 'new' | 'changed' | 'cancelled';
  id: string;
  course: string;
  title: string;
  type: string;
  dueAt: Date;
  previousDueAt?: Date;
};

export type SyncResult =
  | { source: string; ok: true; inFeed: number; changes: SyncChange[] }
  | { source: string; ok: false; error: string };

/** The last sync of each source, for "Synced 2 min ago" in the app. */
export type SyncStatus = { at: number; ok: boolean; message: string };

/** Syncs every source; one failing source doesn't stop the others. */
export async function runSync(adapters: SourceAdapter[], now = new Date()): Promise<SyncResult[]> {
  return Promise.all(
    adapters.map(async (adapter): Promise<SyncResult> => {
      let result: SyncResult;
      try {
        result = { source: adapter.source, ok: true, ...(await syncSource(adapter, now)) };
      } catch (err) {
        result = { source: adapter.source, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      const status: SyncStatus = {
        at: now.getTime(),
        ok: result.ok,
        message: result.ok ? `${result.inFeed} items in the feed, ${result.changes.length} changes` : result.error,
      };
      await db().collection('meta').doc(`sync-${adapter.source}`).set(status);
      return result;
    }),
  );
}

export async function getSyncStatus(source: string): Promise<SyncStatus | null> {
  const doc = await db().collection('meta').doc(`sync-${source}`).get();
  return doc.exists ? (doc.data() as SyncStatus) : null;
}

async function syncSource(adapter: SourceAdapter, now: Date) {
  const feed = await adapter.fetchTasks();
  const tasks = db().collection('tasks');
  const snapshot = await tasks.where('source', '==', adapter.source).get();
  const existing = new Map(snapshot.docs.map((d) => [d.id, d.data() as TaskDoc]));

  const batch = db().batch();
  const changes: SyncChange[] = [];
  const nowTs = Timestamp.fromDate(now);
  const seen = new Set<string>();

  for (const t of feed) {
    const id = taskId(t.source, t.externalId);
    seen.add(id);
    const prev = existing.get(id);
    const info = { course: t.course, title: t.title, type: t.type, url: t.url };
    const opensAt = t.opensAt ? Timestamp.fromDate(t.opensAt) : null;
    const dueAt = Timestamp.fromDate(t.dueAt);
    const change = { id, course: t.course, title: t.title, type: t.type, dueAt: t.dueAt };

    // New, or back in the feed after being cancelled. Anything already past when first seen is ignored.
    if (!prev || (prev.status === 'cancelled' && t.dueAt > now)) {
      if (t.dueAt <= now) continue;
      const doc: TaskDoc = {
        source: t.source,
        externalId: t.externalId,
        ...info,
        dueAt,
        opensAt,
        status: 'pending',
        createdAt: prev?.createdAt ?? nowTs,
        updatedAt: nowTs,
        // "new" is sent right after this sync commits.
        notifiedStages: ['new', ...pastStages(t.dueAt, now)],
        snoozedUntil: null,
        doneAt: null,
      };
      batch.set(tasks.doc(id), doc);
      changes.push({ kind: 'new', ...change });
      continue;
    }

    const dueChanged = !prev.dueAt.isEqual(dueAt);
    const infoChanged =
      JSON.stringify([prev.course, prev.title, prev.type, prev.url, prev.opensAt?.toMillis()]) !==
      JSON.stringify([info.course, info.title, info.type, info.url, opensAt?.toMillis()]);
    if (!dueChanged && !infoChanged) continue;

    const update: Partial<TaskDoc> = { ...info, opensAt, dueAt, updatedAt: nowTs };
    if (dueChanged && prev.status === 'pending') {
      // Reminders restart against the new deadline; stages already past for it are skipped.
      const alreadyNew = prev.notifiedStages.includes('new') ? (['new'] as const) : [];
      update.notifiedStages = [...alreadyNew, ...pastStages(t.dueAt, now)];
      changes.push({ kind: 'changed', ...change, previousDueAt: prev.dueAt.toDate() });
    }
    batch.update(tasks.doc(id), update);
  }

  // Pending tasks that vanished from the feed were deleted or hidden in the LMS. An empty feed is more
  // likely a glitch than every task being deleted at once, so it never cancels anything. Sources
  // that don't list everything (email) never cancel either.
  if (adapter.authoritative && feed.length > 0) {
    for (const [id, prev] of existing) {
      if (seen.has(id) || prev.status !== 'pending') continue;
      batch.update(tasks.doc(id), { status: 'cancelled', updatedAt: nowTs });
      changes.push({ kind: 'cancelled', id, course: prev.course, title: prev.title, type: prev.type, dueAt: prev.dueAt.toDate() });
    }
  }

  await batch.commit();

  for (const c of changes) {
    if (c.kind === 'new') await pushToAll(newTaskPush(c));
    if (c.kind === 'changed') await pushToAll(deadlineChangedPush(c, c.previousDueAt!));
  }
  return { inFeed: feed.length, changes };
}
