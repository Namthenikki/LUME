import { isCronRequest } from '@/lib/auth';
import { catchUpAfterResponse, syncIfStale } from '@/lib/catch-up';

export async function GET(request: Request) {
  if (!isCronRequest(request)) return new Response('Unauthorized', { status: 401 });
  // The scheduler always syncs, unless a sync is already running from another caller.
  const results = await syncIfStale(60_000);
  catchUpAfterResponse();
  if (!results) return Response.json({ skipped: 'a sync started less than a minute ago' });
  return Response.json(results, { status: results.every((r) => r.ok) ? 200 : 500 });
}
