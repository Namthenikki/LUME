'use client';

import { motion } from 'motion/react';
import { useTransition } from 'react';
import { unpairAlarmDevicesAction } from '@/app/dashboard/actions';
import { Tile } from '../landing/widgets';
import { APK_URL, useDevice } from './install';
import { ago, useNow } from './time';
import { Panel } from './ui';

export function AndroidCard({ phones, apkReady }: { phones: { label: string; lastSeenAt: number }[]; apkReady: boolean }) {
  const inApp = useDevice().inAndroidApp;
  const now = useNow(60_000);
  const [pending, start] = useTransition();

  return (
    <Panel title="Android app">
      <div className="flex items-start gap-4">
        <Tile size={46} className="shrink-0">
          <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
            <circle cx="12" cy="13.2" r="8" fill="none" stroke="#0e0e11" strokeWidth="2.6" />
            <path d="M12 13.2V9.6" stroke="#0e0e11" strokeWidth="2.6" strokeLinecap="round" />
            <circle cx="12" cy="3.4" r="2.7" fill="#22c1f1" />
          </svg>
        </Tile>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{inApp ? 'You’re in the Lume app' : 'Get the Lume app'}</p>
          <p className="text-[13px] text-ink-2">
            Your phone rings like an alarm 30 and 10 minutes before a deadline, full screen, even on silent, until you mark it done or snooze it.
          </p>
        </div>
      </div>

      {!inApp && !apkReady && (
        <p className="mt-4 rounded-[12px] bg-sunken px-4 py-3 text-[13px] text-ink-2">The download appears here once Lume is deployed and the app is built for its address (npm run android:release).</p>
      )}

      {!inApp && apkReady && (
        <div className="mt-4 space-y-3">
          <motion.a
            href={APK_URL}
            download
            whileTap={{ scale: 0.97 }}
            className="flex h-11 w-full items-center justify-center rounded-[12px] bg-blue text-[14px] font-semibold text-white shadow-[0_10px_24px_-10px_rgb(29_110_245/0.8)] sm:w-auto sm:px-5"
          >
            Download for Android
          </motion.a>
          <p className="text-[13px] text-ink-3">
            Open the downloaded file on your phone and allow installing from your browser when asked. Then open Lume from your home screen once, so it can pair.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-[13px] text-ink-2">
          {phones.length === 0
            ? 'No phone has alarms yet.'
            : `${phones.length} ${phones.length === 1 ? 'phone rings' : 'phones ring'} alarms${now ? `, last checked in ${ago(Math.max(...phones.map((p) => p.lastSeenAt)), now)}` : ''}.`}
        </p>
        {phones.length > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(() => unpairAlarmDevicesAction())}
            className="h-10 rounded-[12px] border border-line px-4 text-[13px] font-medium text-red disabled:opacity-60"
          >
            Stop alarms
          </button>
        )}
      </div>
    </Panel>
  );
}
