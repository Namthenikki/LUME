import { isCronRequest } from '@/lib/auth';
import { ingestEmails, isIncomingEmail, recordIngest } from '@/lib/inbox';
import { emailAdapters } from '@/lib/sources';
import type { Source } from '@/lib/sources/types';
import { runSync } from '@/lib/sync';

/**
 * The Gmail bridge (an Apps Script in the owner's Gmail) posts recent NPTEL emails here every hour.
 * New ones are read by Gemini; then the email sources are synced, which sends "New ..." notifications.
 */
export async function POST(request: Request) {
  if (!isCronRequest(request)) return new Response('Unauthorized', { status: 401 });

  const body = (await request.json().catch(() => null)) as { emails?: unknown[] } | null;
  if (!body || !Array.isArray(body.emails)) return new Response('Expected { emails: [...] }', { status: 400 });
  const incoming = body.emails.filter(isIncomingEmail).slice(0, 200);

  const result = await ingestEmails(incoming);
  const sources = new Set<Source>(incoming.map((e) => e.source));
  await Promise.all([...sources].map((s) => recordIngest(s, incoming.filter((e) => e.source === s).length)));
  if (sources.size === 0) await recordIngest('nptel', 0); // the bridge ran, there was just nothing new

  const sync = await runSync(emailAdapters());
  return Response.json({ ...result, sync });
}
