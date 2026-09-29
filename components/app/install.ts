'use client';

import { useEffect, useState } from 'react';

const IN_APP_KEY = 'lume:in-android-app';

export type Device = {
  /** Running inside the Lume Android app (a Trusted Web Activity opens with an android-app:// referrer). */
  inAndroidApp: boolean;
  /** An Android phone, in a browser. */
  android: boolean;
  /** Already installed as a web app (opened from the home screen). */
  standalone: boolean;
  /** Known after the first client render; before that, render nothing install-related. */
  ready: boolean;
};

export function useDevice(): Device {
  const [device, setDevice] = useState<Device>({ inAndroidApp: false, android: false, standalone: false, ready: false });
  useEffect(() => {
    let inAndroidApp = document.referrer.startsWith('android-app://');
    try {
      if (inAndroidApp) sessionStorage.setItem(IN_APP_KEY, '1');
      inAndroidApp = sessionStorage.getItem(IN_APP_KEY) === '1';
    } catch {
      // storage blocked: the referrer check alone
    }
    setDevice({
      inAndroidApp,
      android: /Android/i.test(navigator.userAgent),
      standalone: matchMedia('(display-mode: standalone)').matches,
      ready: true,
    });
  }, []);
  return device;
}

export const APK_URL = '/downloads/lume.apk';
