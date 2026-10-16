'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { sendTestAction } from '@/app/dashboard/actions';
import { Tile } from '../landing/widgets';
import { promptInstall, useInstallPrompt } from './AppBoot';
import { inLumeApp } from './install';
import { BellIcon } from './icons';
import { disablePush, enablePush, type PushState, pushState } from './push-client';
import { ago, useNow } from './time';
import { Panel } from './ui';

const STATE_TEXT: Record<PushState, string> = {
  loading: 'Checking…',
  unconfigured: 'Push isn’t set up yet. Add the Firebase web keys to the app’s settings.',
  unsupported: 'This browser can’t receive push notifications. Use Chrome on Android.',
  blocked: 'Blocked. Allow notifications for this site in your browser settings.',
  off: 'Off on this device.',
  on: 'On. This device gets every reminder.',
};

export function Toggle({ on, busy, onChange, label }: { on: boolean; busy: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={onChange}
      className={`relative h-[30px] w-[52px] shrink-0 rounded-full transition-colors duration-300 disabled:opacity-60 ${on ? 'bg-blue' : 'bg-chip'}`}
    >
      <motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 35 }} className={`absolute top-[3px] size-6 rounded-full bg-white shadow-[0_2px_4px_rgb(0_0_0/0.2)] ${on ? 'right-[3px]' : 'left-[3px]'}`} />
    </button>
  );
}

/** Reminders are checked every 5 minutes; half an hour without a check means the scheduler stopped. */
const CHECK_OVERDUE_MS = 30 * 60_000;

export function NotificationsCard({ devices, lastCheck }: { devices: number; lastCheck: number | null }) {
  const now = useNow(30_000);
  const stalled = now !== null && (lastCheck === null || now - lastCheck > CHECK_OVERDUE_MS);
  const [state, setState] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [inApp, setInApp] = useState(false);

  useEffect(() => {
    setInApp(inLumeApp());
    pushState().then(setState);
  }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      setState(state === 'on' ? await disablePush() : await enablePush());
    } catch {
      setNote('That didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    const { sent, quietHours } = await sendTestAction();
    setNote(
      !sent
        ? 'No devices have notifications on yet.'
        : `Sent to ${sent} ${sent === 1 ? 'device' : 'devices'}. It arrives in a few seconds with your notification sound, or just a buzz if your phone is on vibrate.` +
            (quietHours ? ' Real reminders arrive silently until 8 AM.' : ''),
    );
    setBusy(false);
  };

  const canToggle = state === 'on' || state === 'off';
  return (
    <Panel title="Notifications">
      <div className="flex items-center gap-4">
        <Tile size={46} className="shrink-0">
          <BellIcon className="size-[22px] text-blue" />
        </Tile>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Reminders on this device</p>
          <p className="text-[13px] text-ink-2">
            {/* The app's WebView can't take web push; the app itself shows every reminder and alarm. */}
            {inApp && state === 'unsupported' ? 'This phone gets every reminder and alarm from the Lume app.' : STATE_TEXT[state]}
          </p>
        </div>
        {canToggle && <Toggle on={state === 'on'} busy={busy} onChange={toggle} label="Notifications on this device" />}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-ink-2">
            {devices} {devices === 1 ? 'device gets' : 'devices get'} reminders
          </p>
          {now !== null && (
            <p className={`text-[12px] ${stalled ? 'font-medium text-red' : 'text-ink-3'}`}>
              {stalled
                ? `Reminders ${lastCheck ? `last checked ${ago(lastCheck, now)}` : 'never checked'}. The scheduler isn’t running.`
                : `Checked for due reminders ${ago(lastCheck!, now)}`}
            </p>
          )}
        </div>
        <button type="button" onClick={test} disabled={busy} className="h-10 rounded-[12px] bg-chip px-4 text-[13px] font-medium disabled:opacity-60">
          Send a test
        </button>
      </div>
      <AnimatePresence>
        {note && (
          <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden pt-3 text-[13px] text-ink-2" role="status">
            {note}
          </motion.p>
        )}
      </AnimatePresence>
    </Panel>
  );
}

export function InstallCard() {
  const prompt = useInstallPrompt();
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(matchMedia('(display-mode: standalone)').matches || inLumeApp());
  }, []);

  return (
    <Panel title="App">
      <div className="flex items-center gap-4">
        <Tile size={46} className="shrink-0">
          <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
            <circle cx="12" cy="13.2" r="8" fill="none" stroke="#0e0e11" strokeWidth="2.6" />
            <path d="M12 13.2V9.6" stroke="#0e0e11" strokeWidth="2.6" strokeLinecap="round" />
            <circle cx="12" cy="3.4" r="2.7" fill="#22c1f1" />
          </svg>
        </Tile>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{installed ? 'Installed' : 'Install Lume'}</p>
          <p className="text-[13px] text-ink-2">
            {installed ? 'You’re using the app from your home screen.' : prompt ? 'Add it to your home screen, like a regular app.' : 'In Chrome, open the ⋮ menu and choose Add to Home screen.'}
          </p>
        </div>
        {!installed && prompt && (
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => promptInstall().then((ok) => ok && setInstalled(true))}
            className="h-10 shrink-0 rounded-[12px] bg-blue px-4 text-[13px] font-semibold text-white"
          >
            Install
          </motion.button>
        )}
      </div>
    </Panel>
  );
}
