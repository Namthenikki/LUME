import { requireEnv } from '../env';
import { ManipalIcsAdapter } from './manipal-ics';
import type { SourceAdapter } from './types';

/**
 * Sources whose deadlines arrive by email, through the Gmail bridge (lib/gmail-bridge.ts).
 * None are connected yet: NPTEL's emails don't reach the owner's Gmail. IITM BS can plug in here
 * with `new EmailDeadlinesAdapter('iitm')` (lib/inbox.ts).
 */
export function emailAdapters(): SourceAdapter[] {
  return [];
}

/** Every source the sync job reads. */
export function adapters(): SourceAdapter[] {
  return [new ManipalIcsAdapter(requireEnv('MUJ_ICS_URL')), ...emailAdapters()];
}
