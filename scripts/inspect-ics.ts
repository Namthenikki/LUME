/**
 * Step 0: inspect the Brightspace calendar feed before building anything on top of it.
 *
 * Fetches MUJ_ICS_URL (from .env.local), parses it and prints every event (due time in IST,
 * inferred type, course, title, UID), plus a summary of how the feed encodes times and which
 * ICS fields it fills in. The feed URL contains a personal token, so it is never printed,
 * not even in error messages.
 *
 *   npm run ics:inspect                    # fetch the live feed
 *   npm run ics:inspect -- --raw 4         # also dump 4 raw VEVENTs (one per type first)
 *   npm run ics:inspect -- --file x.ics    # parse a local .ics instead of fetching
 */
import { readFileSync } from 'node:fs';
import ical, { type ParameterValue, type VEvent } from 'node-ical';

// node-ical parses floating times (no Z, no TZID) in the process's local zone; treat them as IST.
process.env.TZ = 'Asia/Kolkata';

type TaskType = 'assignment' | 'quiz' | 'other';
type RawEvent = { dtstart: string; dtend?: string; lines: string[] };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function fail(message: string): never {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

async function loadFeed(): Promise<string> {
  const file = arg('--file');
  if (file) return readFileSync(file, 'utf8');

  try {
    process.loadEnvFile('.env.local');
  } catch {
    // no .env.local: fall back to the real environment
  }
  const url = process.env.MUJ_ICS_URL?.trim();
  if (!url) fail('MUJ_ICS_URL is not set. Add it to .env.local (see .env.example).');

  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'text/calendar, */*' } });
  } catch (err) {
    // Never err.message itself: it can echo the URL, which contains the token.
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    const reason = cause?.code ?? cause?.message?.replace(/https?:\/\/\S+/g, '<url>') ?? 'unknown';
    fail(`Could not reach the feed (network error: ${reason}).`);
  }
  const redirected = res.redirected ? ', after a redirect' : '';
  if (!res.ok) fail(`Feed returned HTTP ${res.status} ${res.statusText}${redirected}.`);

  const body = await res.text();
  if (!body.includes('BEGIN:VCALENDAR')) {
    const type = res.headers.get('content-type') ?? 'no content-type';
    const hint = /<html/i.test(body)
      ? ' It is an HTML page (probably a login page): the feed token may be wrong or expired.'
      : '';
    fail(`Response is not an iCal feed (${type}, ${body.length} bytes${redirected}).${hint}`);
  }
  return body;
}

/** Unfolds the ICS text and collects the raw VEVENT blocks by UID, to see exactly how times are encoded. */
function rawEvents(text: string): { byUid: Map<string, RawEvent>; blockCount: number } {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const byUid = new Map<string, RawEvent>();
  let blockCount = 0;
  let cur: string[] | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      cur = [];
    } else if (line === 'END:VEVENT' && cur) {
      const block = cur;
      const prop = (name: string) => block.find((l) => l.startsWith(`${name}:`) || l.startsWith(`${name};`));
      const uid = prop('UID')?.slice(4) ?? '';
      byUid.set(uid, { dtstart: prop('DTSTART') ?? '', dtend: prop('DTEND'), lines: block });
      blockCount++;
      cur = null;
    } else {
      cur?.push(line);
    }
  }
  return { byUid, blockCount };
}

function timeEncoding(prop: string): string {
  if (!prop) return 'missing';
  const colon = prop.lastIndexOf(':');
  const params = prop.slice(0, colon);
  const value = prop.slice(colon + 1);
  if (/VALUE=DATE(?!-)/.test(params) || /^\d{8}$/.test(value)) return 'date-only';
  if (value.endsWith('Z')) return 'UTC';
  const tzid = /TZID=("?)([^;:"]+)\1/.exec(params)?.[2];
  return tzid ? `TZID=${tzid}` : 'floating (read as IST)';
}

const text = (v: ParameterValue | undefined): string => (typeof v === 'string' ? v : (v?.val ?? '')).trim();

/** First guess from the title; to be refined once we see real Brightspace titles. */
function inferType(title: string): TaskType {
  if (/\b(quiz|test)\b/i.test(title)) return 'quiz';
  if (/\b(assignment|dropbox|submission|due)\b/i.test(title)) return 'assignment';
  return 'other';
}

const istParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function ist(d: Date, dateOnly = false): string {
  const p = Object.fromEntries(istParts.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.year}-${p.month}-${p.day} ${dateOnly ? 'all-day' : `${p.hour}:${p.minute}`}`;
}

function printTable(headers: string[], rows: string[][], maxWidths: number[], dividerAt: number, divider: string) {
  const clip = (s: string, w: number) => (s.length > w ? `${s.slice(0, w - 3)}...` : s);
  const cells = rows.map((r) => r.map((c, i) => clip(c.replace(/\s+/g, ' '), maxWidths[i])));
  const widths = headers.map((h, i) => Math.max(h.length, ...cells.map((r) => r[i].length)));
  const line = (r: string[]) => r.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
  const total = widths.reduce((a, b) => a + b + 2, -2);

  console.log(line(headers));
  console.log('='.repeat(total));
  cells.forEach((r, i) => {
    if (i === dividerAt) console.log(`---- ${divider} `.padEnd(total, '-'));
    console.log(line(r));
  });
  if (dividerAt >= cells.length) console.log(`---- ${divider} `.padEnd(total, '-'));
}

async function main() {
  const body = await loadFeed();
  const { byUid, blockCount } = rawEvents(body);
  const events = Object.values(ical.sync.parseICS(body)).filter((c): c is VEvent => c?.type === 'VEVENT');
  const now = new Date();

  const rows = events
    .map((ev) => {
      const title = text(ev.summary);
      const raw = byUid.get(ev.uid);
      // node-ical invents an end for date-only events, so only trust an explicit DTEND.
      const endsLater = raw?.dtend && ev.end && ev.end.getTime() - ev.start.getTime() > 60_000;
      return {
        ev,
        raw,
        title,
        type: inferType(title),
        course: text(ev.location) || '-',
        due: ist(ev.start, ev.start.dateOnly) + (endsLater ? ` (ends ${ist(ev.end!, ev.end!.dateOnly)})` : ''),
      };
    })
    .sort((a, b) => a.ev.start.getTime() - b.ev.start.getTime());

  // Summary
  const calName = /^X-WR-CALNAME:(.*)$/m.exec(body.replace(/\r?\n[ \t]/g, ''))?.[1]?.trim();
  const count = <T,>(items: T[], key: (t: T) => string) =>
    [...items.reduce((m, t) => m.set(key(t), (m.get(key(t)) ?? 0) + 1), new Map<string, number>())]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${n}`)
      .join(', ');
  const fieldCounts = new Map<string, number>();
  for (const { lines } of byUid.values()) {
    const names = new Set(lines.map((l) => /^[A-Z][A-Z0-9-]*/.exec(l)?.[0]).filter((n) => n !== undefined));
    for (const n of names) fieldCounts.set(n, (fieldCounts.get(n) ?? 0) + 1);
  }

  console.log(`\nCalendar:          ${calName ?? '(no X-WR-CALNAME)'}, ${(body.length / 1024).toFixed(1)} KB`);
  console.log(`Events:            ${events.length} parsed, ${blockCount} raw VEVENT blocks` +
    (blockCount !== events.length ? '  <-- mismatch: duplicate UIDs?' : ''));
  console.log(`Upcoming / past:   ${rows.filter((r) => r.ev.start >= now).length} / ${rows.filter((r) => r.ev.start < now).length}`);
  console.log(`DTSTART encoding:  ${count(rows, (r) => timeEncoding(r.raw?.dtstart ?? ''))}`);
  console.log(`DTEND != DTSTART:  ${rows.filter((r) => r.due.includes('(ends')).length} events`);
  console.log(`Recurring (RRULE): ${events.filter((e) => e.rrule).length}`);
  console.log(`Type (guessed):    ${count(rows, (r) => r.type)}`);
  console.log(`Fields per event:  ${[...fieldCounts].map(([k, n]) => `${k} ${n}/${blockCount}`).join(', ')}`);
  console.log(`Courses (LOCATION): ${count(rows, (r) => r.course)}\n`);

  const firstUpcoming = rows.findIndex((r) => r.ev.start >= now);
  printTable(
    ['#', 'Due (IST)', 'Type', 'Course', 'Title', 'UID'],
    rows.map((r, i) => [String(i + 1), r.due, r.type, r.course, r.title, r.ev.uid]),
    [4, 60, 10, 32, 50, 80],
    firstUpcoming === -1 ? rows.length : firstUpcoming,
    `now: ${ist(now)} IST`,
  );

  const rawCount = Number(arg('--raw') ?? 0);
  if (rawCount > 0) {
    // Prefer upcoming events, one of each type first, so the dump shows every kind of entry.
    const pool = [...rows.filter((r) => r.ev.start >= now), ...rows.filter((r) => r.ev.start < now).reverse()];
    const picked: typeof rows = [];
    for (const r of pool) if (!picked.some((p) => p.type === r.type)) picked.push(r);
    for (const r of pool) if (picked.length < rawCount && !picked.includes(r)) picked.push(r);
    for (const r of picked.slice(0, rawCount)) {
      console.log(`\n--- raw VEVENT (${r.type}) ---`);
      for (const l of r.raw?.lines ?? []) console.log(l.length > 300 ? `${l.slice(0, 300)}...` : l);
    }
  }
  console.log();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
