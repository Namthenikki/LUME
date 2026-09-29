import { redirect } from 'next/navigation';
import { AlarmTile, AppTile, CheckTile } from '@/components/landing/widgets';
import { isOwner } from '@/lib/owner';
import { UnlockForm } from './UnlockForm';

export const metadata = { title: 'Unlock Lume' };

export default async function UnlockPage({ searchParams }: PageProps<'/unlock'>) {
  const { next } = await searchParams;
  const target = typeof next === 'string' && next.startsWith('/dashboard') ? next : '/dashboard';
  if (await isOwner()) redirect(target);

  return (
    <div className="flex min-h-dvh flex-col p-3 sm:p-4">
      <section className="dots relative flex flex-1 items-center justify-center overflow-hidden rounded-[28px] border border-line bg-panel px-6 py-16">
        <div className="pointer-events-none absolute left-[8%] top-[14%] hidden rotate-[-8deg] md:block" aria-hidden>
          <div className="bob">
            <CheckTile />
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-[16%] right-[9%] hidden rotate-[9deg] md:block" aria-hidden>
          <div className="bob" style={{ '--float-delay': '-2.5s' } as React.CSSProperties}>
            <AlarmTile />
          </div>
        </div>

        <div className="flex w-full max-w-[380px] flex-col items-center text-center">
          <div className="bob">
            <AppTile />
          </div>
          <h1 className="mt-8 text-[clamp(2.2rem,8vw,3.2rem)] font-medium leading-[1.05] tracking-[-0.035em]">
            Welcome back,
            <span className="block text-ink-3">unlock Lume</span>
          </h1>
          <p className="mt-4 text-[16px] text-ink-2">Enter your password once. This device stays unlocked for a year.</p>
          <UnlockForm next={target} />
        </div>
      </section>
    </div>
  );
}
