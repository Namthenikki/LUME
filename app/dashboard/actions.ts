'use server';

import { cookies } from 'next/headers';
import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { isDeviceToken, pairAlarmDevice, setAlarmsOn, unpairAllAlarmDevices } from '@/lib/alarm-devices';
import { OWNER_COOKIE } from '@/lib/auth';
import { syncIfStale } from '@/lib/catch-up';
import { requireOwner } from '@/lib/owner';
import { pushToAll, removeDevice, saveDevice } from '@/lib/push';
import { isQuiet } from '@/lib/quiet';
import { markDone, markPending, snooze } from '@/lib/tasks';
import { parseTheme, THEME_COOKIE } from '@/lib/theme';

export async function markDoneAction(id: string) {
  await requireOwner();
  await markDone(id);
  refresh();
}

export async function undoDoneAction(id: string) {
  await requireOwner();
  await markPending(id);
  refresh();
}

export async function snoozeAction(id: string) {
  await requireOwner();
  await snooze(id);
  refresh();
}

export async function syncNowAction(): Promise<{ ok: boolean; message: string }> {
  await requireOwner();
  // A sync that started seconds ago (from another device or the scheduler) already covers this.
  const results = (await syncIfStale(10_000)) ?? [];
  refresh();
  const failed = results.find((r) => !r.ok);
  if (failed && !failed.ok) return { ok: false, message: failed.error };
  const added = results.reduce((n, r) => n + (r.ok ? r.changes.filter((c) => c.kind === 'new').length : 0), 0);
  return { ok: true, message: added ? `Found ${added} new ${added === 1 ? 'deadline' : 'deadlines'}` : 'Up to date' };
}

/** Approves the Android app's device token, so it can read the alarm schedule. */
export async function pairAlarmDeviceAction(token: string): Promise<boolean> {
  await requireOwner();
  if (!isDeviceToken(token)) return false;
  await pairAlarmDevice(token, 'Android app');
  refresh();
  return true;
}

export async function unpairAlarmDevicesAction() {
  await requireOwner();
  await unpairAllAlarmDevices();
  refresh();
}

/** Alarms on or off for every paired phone; off, their reminders come as plain notifications. */
export async function setAlarmsOnAction(on: boolean) {
  await requireOwner();
  await setAlarmsOn(on);
  refresh();
}

export async function registerDeviceAction(token: string, label: string) {
  await requireOwner();
  await saveDevice(token, label);
}

export async function removeDeviceAction(token: string) {
  await requireOwner();
  await removeDevice(token);
}

export async function sendTestAction(): Promise<{ sent: number; quietHours: boolean }> {
  await requireOwner();
  const { sent } = await pushToAll({ title: 'Reminders are on', body: 'This is how Lume will remind you before each deadline.', test: true });
  return { sent, quietHours: isQuiet(Date.now()) };
}

export async function setThemeAction(theme: string) {
  await requireOwner();
  (await cookies()).set(THEME_COOKIE, parseTheme(theme), { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  refresh();
}

export async function lockAction() {
  (await cookies()).delete(OWNER_COOKIE);
  redirect('/');
}
