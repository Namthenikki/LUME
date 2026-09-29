'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Tile } from '../landing/widgets';
import { promptInstall, useInstallPrompt } from './AppBoot';
import { APK_URL, useDevice } from './install';

const DISMISSED_KEY = 'lume:get-app-dismissed';

/**
 * Home's install nudge. On an Android phone: the Lume app (with alarms). On a computer: install the
 * web app, when the browser offers it. Hidden inside the app, once installed, or after dismissing.
 */
export function GetAppCard({ apkReady }: { apkReady: boolean }) {
  const device = useDevice();
  const installPrompt = useInstallPrompt();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // private mode: hidden for this visit only
    }
  };

  const offerAndroid = device.android && apkReady;
  const offerWebApp = !device.android && !!installPrompt;
  const show = device.ready && !dismissed && !device.inAndroidApp && !device.standalone && (offerAndroid || offerWebApp);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -10, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -10, height: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="-mx-3 -mb-6 overflow-hidden px-3 pb-6"
        >
          <div className="relative flex flex-wrap items-center gap-x-4 gap-y-3.5 rounded-[20px] bg-card p-4 shadow-card sm:flex-nowrap sm:p-5">
            <Tile size={48} className="shrink-0 self-start sm:self-center">
              <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
                <circle cx="12" cy="13.2" r="8" fill="none" stroke="#0e0e11" strokeWidth="2.6" />
                <path d="M12 13.2V9.6" stroke="#0e0e11" strokeWidth="2.6" strokeLinecap="round" />
                <circle cx="12" cy="3.4" r="2.7" fill="#22c1f1" />
              </svg>
            </Tile>
            <div className="min-w-0 flex-1 basis-[calc(100%-64px)] pr-8 sm:basis-auto sm:pr-0">
              <p className="font-semibold">{offerAndroid ? 'Get the Lume app' : 'Install Lume'}</p>
              <p className="text-[14px] leading-snug text-ink-2">
                {offerAndroid
                  ? 'It rings like an alarm 30 and 10 minutes before a deadline, even on silent.'
                  : 'Open it from your dock or desktop like a regular app.'}
              </p>
            </div>
            {offerAndroid ? (
              <motion.a
                href={APK_URL}
                download
                whileTap={{ scale: 0.96 }}
                className="flex h-11 w-full shrink-0 items-center justify-center rounded-[12px] bg-blue px-5 text-[14px] font-semibold text-white shadow-[0_10px_24px_-10px_rgb(29_110_245/0.8)] sm:w-auto"
              >
                Download app
              </motion.a>
            ) : (
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => promptInstall()}
                className="h-11 w-full shrink-0 rounded-[12px] bg-blue px-5 text-[14px] font-semibold text-white shadow-[0_10px_24px_-10px_rgb(29_110_245/0.8)] sm:w-auto"
              >
                Install
              </motion.button>
            )}
            <button
              type="button"
              onClick={dismiss}
              aria-label="Hide this"
              className="absolute right-2 top-2 grid size-10 place-items-center rounded-full text-ink-3 hover:bg-sunken sm:static sm:order-last"
            >
              <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
