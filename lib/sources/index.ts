import { requireEnv } from '../env';
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

/** Every source the sync job reads. */
export function adapters(): SourceAdapter[] {
  return [new ManipalIcsAdapter(requireEnv('MUJ_ICS_URL')), ...emailAdapters()];
}
