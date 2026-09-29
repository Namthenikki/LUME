import { isCronRequest } from '@/lib/auth';
import { runReminders } from '@/lib/remind';

export async function GET(request: Request) {
  if (!isCronRequest(request)) return new Response('Unauthorized', { status: 401 });
  return Response.json(await runReminders());
}
