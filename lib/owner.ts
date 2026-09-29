import { cookies } from 'next/headers';
import { isOwnerToken, OWNER_COOKIE } from './auth';

export async function isOwner(): Promise<boolean> {
  return isOwnerToken((await cookies()).get(OWNER_COOKIE)?.value);
}

/** For server actions: the proxy already guards pages, but actions are checked on their own too. */
export async function requireOwner(): Promise<void> {
  if (!(await isOwner())) throw new Error('Unlock Lume first');
}
