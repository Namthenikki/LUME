import { connection } from 'next/server';
import { AndroidCard } from '@/components/app/AndroidCard';
import { PageHeader } from '@/components/app/PageHeader';
import { alarmsOn, listAlarmDevices, reportedAppVersion } from '@/lib/alarm-devices';
import androidRelease from '@/lib/android-release.json';
import { headers } from 'next/headers';
import { NptelSource } from '@/components/app/NptelSource';
import { InstallCard, NotificationsCard } from '@/components/app/SettingsCards';
import { Tile } from '@/components/landing/widgets';
import { SyncButton } from '@/components/app/SyncButton';
import { Panel } from '@/components/app/ui';
import { nptelKey } from '@/lib/auth';
import { countDevices } from '@/lib/push';
import { lastReminderCheck } from '@/lib/catch-up';
import { extensionUpdate, nptelHealth } from '@/lib/source-health';
import { getSyncStatus } from '@/lib/sync';
import { formatIST } from '@/lib/time';
import { lockAction } from '../actions';

export const metadata = { title: 'Settings · Lume' };

export default async function SettingsPage() {
  await connection();
  const [devices, lastCheck, sync, nptel, posts, head, phones, ringing, appVersion] = await Promise.all([
    countDevices(),
    lastReminderCheck(),
    getSyncStatus('manipal'),
    getSyncStatus('nptel'),
    getSyncStatus('manipal-posts'),
    headers(),
    listAlarmDevices(),
    alarmsOn(),
    reportedAppVersion(),
  ]);
  // The extension's connection code: this app's address and its NPTEL key, pasted in one go.
  const origin = `${head.get('x-forwarded-proto') ?? 'http'}://${head.get('host')}`;
  // Lume Public's usage page, with its secret key: set in Vercel only, never in the code (this repo is public).
  const publicStats = process.env.LUME_PUBLIC_STATS_URL?.trim();

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader title="Settings" sub="Notifications, the app, and where Lume looks for deadlines." />

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="appear space-y-4">
          <NotificationsCard devices={devices} lastCheck={lastCheck} />
          <AndroidCard phones={phones} apkReady={androidRelease.origin !== null} alarmsOn={ringing} appVersion={appVersion} />
          <InstallCard />
        </div>

        <div className="appear space-y-4" style={{ animationDelay: '80ms' }}>
          <Panel title="Sources" action={<SyncButton variant="icon" />}>
            <ul>
              <li className="flex items-start gap-3 py-2">
                <Tile size={46} className="shrink-0">
                  <span className="text-[20px] font-bold tracking-[-0.04em] text-blue">M</span>
                </Tile>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium">
                    Manipal LMS
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${sync?.ok === false ? 'bg-red/10 text-red' : 'bg-green/12 text-green'}`}>
                      {sync?.ok === false ? 'Needs attention' : 'Connected'}
                    </span>
                  </p>
                  <p className="text-[13px] text-ink-2">{sync ? `Last checked ${formatIST(sync.at)}. ${sync.message}.` : 'Not checked yet.'}</p>
                  <p className="text-[13px] text-ink-3">Checked every hour, across all your courses.</p>
                  <p className={`mt-1.5 text-[13px] ${posts?.ok === false ? 'text-red' : 'text-ink-2'}`}>
                    {posts
                      ? `Quizzes: checked ${formatIST(posts.at)}. ${posts.message.replace(/\.$/, '')}.`
                      : 'Quizzes: not checked yet. Update the Lume extension in Chrome (under NPTEL below).'}
                  </p>
                  {extensionUpdate(posts) && <p className="text-[13px] font-medium text-orange">{extensionUpdate(posts)}</p>}
                  <p className="text-[13px] text-ink-3">
                    Read by the Lume extension in Chrome every hour, and right after you submit a quiz: when each quiz starts, whether you’ve attempted it, and quizzes teachers only announce in a course’s posts.
                  </p>
                </div>
              </li>
              <NptelSource health={nptelHealth(nptel, Date.now())} at={nptel?.at ?? null} message={nptel?.message ?? null} code={`${origin}#${nptelKey()}`} />
              <li className="flex items-center gap-3 border-t border-line py-3">
                <Tile size={46} className="shrink-0">
                  <span className="text-[20px] font-bold tracking-[-0.04em] text-[#b42318]">I</span>
                </Tile>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">IITM BS</p>
                  <p className="text-[13px] text-ink-2">Coming later.</p>
                </div>
              </li>
            </ul>
          </Panel>

          {publicStats && (
            <Panel title="Lume Public">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="min-w-0 flex-1 text-[13px] text-ink-2">How many students use Lume Public: total, active today and this week, and each student’s setup.</p>
                <a
                  href={publicStats}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-10 items-center justify-center rounded-[12px] bg-blue px-4 text-[13px] font-semibold text-white shadow-[0_8px_18px_-10px_rgb(29_110_245/0.8)]"
                >
                  See usage
                </a>
              </div>
            </Panel>
          )}

          <Panel title="Lock">
            <form action={lockAction} className="flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 flex-1 text-[13px] text-ink-2">Sign this device out. You’ll need the password to get back in.</p>
              <button type="submit" className="h-10 rounded-[12px] border border-line px-4 text-[13px] font-medium text-red">
                Lock this device
              </button>
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}
