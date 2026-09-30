import { isCronRequest } from '@/lib/auth';
import { remindAfterResponse } from '@/lib/remind';
import { adapters } from '@/lib/sources';
import { runSync } from '@/lib/sync';

export async function GET(request: Request) {
  if (!isCronRequest(request)) return new Response('Unauthorized', { status: 401 });
  const results = await runSync(adapters());
  remindAfterResponse();
  return Response.json(results, { status: results.every((r) => r.ok) ? 200 : 500 });
}
