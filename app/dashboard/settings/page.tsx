import { connection } from 'next/server';
import { AndroidCard } from '@/components/app/AndroidCard';
import { PageHeader } from '@/components/app/PageHeader';
import { listAlarmDevices } from '@/lib/alarm-devices';
import { cookies } from 'next/headers';
import { AppearanceCard, InstallCard, NotificationsCard } from '@/components/app/SettingsCards';
import { Tile } from '@/components/landing/widgets';
import { parseTheme, THEME_COOKIE } from '@/lib/theme';
import { SyncButton } from '@/components/app/SyncButton';
import { Panel } from '@/components/app/ui';
import { countDevices } from '@/lib/push';
import { getSyncStatus } from '@/lib/sync';
import { formatIST } from '@/lib/time';
import { lockAction } from '../actions';

export const metadata = { title: 'Settings · Lume' };

export default async function SettingsPage() {
  await connection();
  const [devices, sync, jar, phones] = await Promise.all([countDevices(), getSyncStatus('manipal'), cookies(), listAlarmDevices()]);
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader title="Settings" sub="Notifications, the app, and where Lume looks for deadlines." />

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="appear space-y-4">
          <NotificationsCard devices={devices} />
          <AndroidCard phones={phones} />
          <AppearanceCard theme={theme} />
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
                </div>
              </li>
              {[
                // Same glyphs and colors as the Sources card on the landing page
                { name: 'NPTEL', glyph: 'N', color: '#f59e0b' },
                { name: 'IITM BS', glyph: 'I', color: '#b42318' },
              ].map((s) => (
                <li key={s.name} className="flex items-center gap-3 border-t border-line py-3">
                  <Tile size={46} className="shrink-0">
                    <span className="text-[20px] font-bold tracking-[-0.04em]" style={{ color: s.color }}>
                      {s.glyph}
                    </span>
                  </Tile>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{s.name}</p>
                    <p className="text-[13px] text-ink-2">Coming later.</p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

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
