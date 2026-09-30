import { after } from 'next/server';
import { db } from './firebase-admin';
import { runReminders } from './remind';
import { adapters } from './sources';
import { runSync } from './sync';

/*
 * GitHub's scheduler starts runs late or skips them, so Lume also catches up whenever the app, the
 * Android alarm sync (every 15 minutes) or the NPTEL extension talks to it: due reminders, and the
 * LMS sync if the last one is over 50 minutes old.
 */

const REMIND_GAP = 60_000;
const SYNC_GAP = 50 * 60_000;

/**
 * Claims a job unless it started within `gapMs`. It's a transaction, so when two callers arrive at
 * once only one runs the job, and nobody gets the same notification twice.
 */
async function claim(job: 'remind' | 'sync-lock', gapMs: number, now: number): Promise<boolean> {
  const ref = db().collection('meta').doc(job);
  return db().runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (doc.exists && now - (doc.get('at') as number) < gapMs) return false;
    tx.set(ref, { at: now });
    return true;
  });
}

/** Sends due reminders, unless a check ran in the last minute. */
export async function remindIfIdle(now = new Date()) {
  return (await claim('remind', REMIND_GAP, now.getTime())) ? runReminders(now) : null;
}

/** Syncs the LMS (and other sources), unless a sync started within `gapMs`. */
export async function syncIfStale(gapMs = SYNC_GAP) {
  return (await claim('sync-lock', gapMs, Date.now())) ? runSync(adapters()) : null;
}

/** Catches up after the current response is sent, so the caller isn't slowed down. */
export function catchUpAfterResponse(): void {
  after(async () => {
    await syncIfStale().catch((err) => console.error('Catch-up sync failed', err));
    await remindIfIdle().catch((err) => console.error('Catch-up reminders failed', err));
  });
}

/** When reminders were last checked, for Settings. */
export async function lastReminderCheck(): Promise<number | null> {
  const doc = await db().collection('meta').doc('remind').get();
  return doc.exists ? (doc.get('at') as number) : null;
}
