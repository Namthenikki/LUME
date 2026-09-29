import { Timestamp } from 'firebase-admin/firestore';
import { db } from './firebase-admin';
import { extractDeadlines, GeminiUnavailable } from './gemini';
import type { RawTask, Source, SourceAdapter, TaskType } from './sources/types';

/**
 * Deadlines that arrive by email (NPTEL now, IITM BS later). The Gmail bridge script posts
 * emails here; each one is read by Gemini once and its deadlines are kept in `emails/{gmailId}`.
 * Only the subject, sender, date and extracted deadlines are stored, never the email body.
 */

export type IncomingEmail = { id: string; source: Source; from: string; subject: string; date: string; body: string };

type StoredDeadline = { course: string; title: string; key: string; type: TaskType; dueAt: Timestamp; url: string | null };
type StoredEmail = {
  source: Source;
  from: string;
  subject: string;
  sentAt: Timestamp;
  processedAt: Timestamp;
  deadlines: StoredDeadline[];
  error: string | null;
};

const emails = () => db().collection('emails');
const EMAIL_SOURCES: Source[] = ['nptel', 'iitm'];
/** Gemini's free tier allows only a few requests a minute; the rest wait for the next hourly run. */
const MAX_PER_RUN = 12;

export function isIncomingEmail(e: unknown): e is IncomingEmail {
  const x = e as Record<string, unknown>;
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof x.id === 'string' &&
    /^[\w-]{6,64}$/.test(x.id) &&
    EMAIL_SOURCES.includes(x.source as Source) &&
    ['from', 'subject', 'date', 'body'].every((k) => typeof x[k] === 'string')
  );
}

export async function ingestEmails(incoming: IncomingEmail[]) {
  const known = new Set(
    (await Promise.all(incoming.map((e) => emails().doc(e.id).get()))).filter((d) => d.exists).map((d) => d.id),
  );
  const fresh = incoming.filter((e) => !known.has(e.id)).sort((a, b) => a.date.localeCompare(b.date));
  let processed = 0;
  let deadlines = 0;
  let problem: string | null = null;

  for (const e of fresh.slice(0, MAX_PER_RUN)) {
    const sentAt = new Date(e.date);
    const doc: StoredEmail = {
      source: e.source,
      from: e.from.slice(0, 200),
      subject: e.subject.slice(0, 300),
      sentAt: Timestamp.fromDate(Number.isNaN(sentAt.getTime()) ? new Date() : sentAt),
      processedAt: Timestamp.now(),
      deadlines: [],
      error: null,
    };
    try {
      const found = await extractDeadlines({ from: e.from, subject: e.subject, sentAt, body: e.body });
      doc.deadlines = found.map((d) => ({ ...d, dueAt: Timestamp.fromDate(d.dueAt) }));
    } catch (err) {
      if (err instanceof GeminiUnavailable) {
        problem = err.message; // leave this and the rest unread; the next run tries again
        break;
      }
      // A reply Gemini got wrong is stored with the error, so one odd email isn't retried forever.
      doc.error = err instanceof Error ? err.message.slice(0, 300) : String(err);
    }
    await emails().doc(e.id).set(doc);
    processed++;
    deadlines += doc.deadlines.length;
  }

  return { received: incoming.length, alreadyRead: known.size, read: processed, waiting: fresh.length - processed, deadlinesFound: deadlines, problem };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Every deadline found in this source's emails. When several emails mention the same deadline
 * (announcement, reminder, extension), the most recent email wins.
 */
export class EmailDeadlinesAdapter implements SourceAdapter {
  readonly authoritative = false;

  constructor(readonly source: Source) {}

  async fetchTasks(): Promise<RawTask[]> {
    const snap = await emails().where('source', '==', this.source).get();
    const latest = new Map<string, { task: RawTask; sentAt: number }>();
    for (const doc of snap.docs) {
      const e = doc.data() as StoredEmail;
      for (const d of e.deadlines) {
        const externalId = `${slug(d.course)}/${d.key}`;
        const sentAt = e.sentAt.toMillis();
        if ((latest.get(externalId)?.sentAt ?? -1) > sentAt) continue;
        latest.set(externalId, {
          sentAt,
          task: {
            source: this.source,
            externalId,
            course: d.course,
            title: d.title,
            type: d.type,
            dueAt: d.dueAt.toDate(),
            opensAt: null,
            url: d.url ?? `https://mail.google.com/mail/u/0/#all/${doc.id}`,
          },
        });
      }
    }
    return [...latest.values()].map((v) => v.task);
  }
}

/** When the bridge last delivered emails for a source; null if it never has. */
export async function lastIngest(source: Source): Promise<{ at: number; received: number } | null> {
  const doc = await db().collection('meta').doc(`ingest-${source}`).get();
  return doc.exists ? (doc.data() as { at: number; received: number }) : null;
}

export async function recordIngest(source: Source, received: number): Promise<void> {
  await db().collection('meta').doc(`ingest-${source}`).set({ at: Date.now(), received });
}
