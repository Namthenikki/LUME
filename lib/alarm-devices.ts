import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from './firebase-admin';

/**
 * Phones running the Lume Android app, which rings alarms right before deadlines.
 *
 * Pairing: on first launch the app opens Lume with `?lume_device=<random token>`. The page, already
 * unlocked with the owner cookie, approves that token here. From then on the app reads
 * /api/alarms with it. Only a hash of the token is stored.
 */

const devices = () => db().collection('alarmDevices');
const idOf = (token: string) => createHash('sha256').update(token).digest('hex');

export const isDeviceToken = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(t);

export async function pairAlarmDevice(token: string, label: string): Promise<void> {
  const now = Timestamp.now();
  await devices().doc(idOf(token)).set({ label: label.slice(0, 80), pairedAt: now, lastSeenAt: now }, { merge: true });
}

export async function isPairedAlarmDevice(token: string): Promise<boolean> {
  const ref = devices().doc(idOf(token));
  const doc = await ref.get();
  if (!doc.exists) return false;
  await ref.update({ lastSeenAt: Timestamp.now() });
  return true;
}

export async function listAlarmDevices(): Promise<{ label: string; lastSeenAt: number }[]> {
  const snap = await devices().get();
  return snap.docs.map((d) => ({ label: d.get('label') as string, lastSeenAt: (d.get('lastSeenAt') as Timestamp).toMillis() }));
}

export async function unpairAllAlarmDevices(): Promise<void> {
  const snap = await devices().get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}
