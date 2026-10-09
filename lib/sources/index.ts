import { requireEnv } from '../env';
import { withPostQuizzes } from './lms-posts';
import { ManipalIcsAdapter } from './manipal-ics';
import type { SourceAdapter } from './types';

/**
 * Sources whose deadlines arrive by email, through the Gmail bridge (lib/gmail-bridge.ts).
 * None are connected yet. IITM BS can plug in here with `new EmailDeadlinesAdapter('iitm')`
 * (lib/inbox.ts). NPTEL isn't here: its Chrome extension pushes to /api/ingest/nptel instead.
 */
export function emailAdapters(): SourceAdapter[] {
  return [];
}

/** Every source the sync job reads. The LMS is its calendar feed plus quizzes announced in course posts. */
export function adapters(): SourceAdapter[] {
  return [withPostQuizzes(new ManipalIcsAdapter(requireEnv('MUJ_ICS_URL'))), ...emailAdapters()];
}
