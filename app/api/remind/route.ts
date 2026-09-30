import { isCronRequest } from '@/lib/auth';
import { runRemindersIfIdle } from '@/lib/remind';

export async function GET(request: Request) {
  if (!isCronRequest(request)) return new Response('Unauthorized', { status: 401 });
  // null: another caller ran them less than a minute ago.
  return Response.json((await runRemindersIfIdle()) ?? { skipped: 'ran less than a minute ago' });
}
