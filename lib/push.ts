import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { actionToken } from './auth';
import { db } from './firebase-admin';
import { isQuiet } from './quiet';

export type Push = {
  title: string;
  body: string;
  /** Set for task reminders: adds the Mark done / Remind in 2h buttons and opens that task on tap. */
  taskId?: string;
  /** Stays on screen until acted on. */
  sticky?: boolean;
  /** A test the owner asked for: plays the notification sound even in quiet hours. */
  test?: boolean;
};

const devices = () => db().collection('devices');
const deviceId = (token: string) => createHash('sha256').update(token).digest('hex').slice(0, 32);

export async function saveDevice(token: string, label: string): Promise<void> {
  const now = Timestamp.now();
  await devices().doc(deviceId(token)).set({ token, label, lastSeenAt: now }, { merge: true });
}

export async function removeDevice(token: string): Promise<void> {
  await devices().doc(deviceId(token)).delete();
}

export async function countDevices(): Promise<number> {
  return (await devices().count().get()).data().count;
}

/**
 * Sends a notification to every registered device as a data-only message, so the service
 * worker draws it (with action buttons). Devices whose tokens FCM rejects are forgotten.
 */
export async function pushToAll(push: Push): Promise<{ sent: number; failed: number }> {
  const snap = await devices().get();
  if (snap.empty) return { sent: 0, failed: 0 };

  // In quiet hours notifications still arrive, but without sound or vibration, and never stick.
  const quiet = !push.test && isQuiet(Date.now());
  const data: Record<string, string> = {
    title: push.title,
    body: push.body,
    tag: push.taskId ?? `lume-${Date.now()}`,
    url: push.taskId ? `/dashboard?task=${push.taskId}` : '/dashboard',
    sticky: push.sticky && !quiet ? '1' : '0',
    silent: quiet ? '1' : '0',
  };
  if (push.taskId) {
    data.taskId = push.taskId;
    data.actionToken = actionToken(push.taskId);
  }

  const result = await getMessaging().sendEach(
    snap.docs.map((d) => ({
      token: d.get('token') as string,
      data,
      webpush: { headers: { Urgency: 'high', TTL: String(6 * 3600) } },
    })),
  );

  const stale = result.responses
    .map((r, i) => (!r.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(r.error?.code ?? '') ? snap.docs[i].ref : null))
    .filter((ref) => ref !== null);
  await Promise.all(stale.map((ref) => ref.delete()));

  return { sent: result.successCount, failed: result.failureCount };
}
