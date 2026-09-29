'use client';

import { AnimatePresence, motion, useAnimate } from 'motion/react';
import { useActionState, useEffect } from 'react';
import { unlockAction } from './actions';

export function UnlockForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(unlockAction, null);
  const [field, animate] = useAnimate();

  // Each failed attempt returns a new state object, so the field shakes every time.
  useEffect(() => {
    if (state?.error) animate(field.current, { x: [0, -8, 8, -5, 5, 0] }, { duration: 0.4 });
  }, [state, animate, field]);

  return (
    <form action={action} className="mt-8 w-full text-left">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="password" className="text-[14px] font-medium">
        Password
      </label>
      <div ref={field}>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          className="mt-2 h-12 w-full rounded-[12px] border border-line bg-white px-4 text-[16px] shadow-[0_1px_2px_rgb(0_0_0/0.04)] outline-none transition-shadow focus:border-blue focus:shadow-[0_0_0_4px_rgb(29_110_245/0.15)]"
        />
      </div>
      <AnimatePresence>
        {state?.error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden pt-2 text-[14px] text-red"
            role="alert"
          >
            {state.error}
          </motion.p>
        )}
      </AnimatePresence>
      <motion.button
        type="submit"
        disabled={pending}
        whileTap={{ scale: 0.98 }}
        className="mt-5 h-12 w-full rounded-[12px] bg-blue text-[15px] font-medium text-white shadow-[0_10px_24px_-10px_rgb(29_110_245/0.8)] transition-opacity disabled:opacity-70"
      >
        {pending ? 'Unlocking…' : 'Unlock'}
      </motion.button>
    </form>
  );
}
