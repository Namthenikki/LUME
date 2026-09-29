# Lume

A personal deadline manager. Lume reads every assignment and quiz deadline from the Manipal LMS
on its own, shows them in one dashboard, and sends push notifications that get more frequent as a
deadline gets close, until you mark it done. It's an installable web app (PWA) for one person: you.

## How it works

```
MUJ LMS calendar feed ──(hourly)──▶ /api/sync ──▶ Firestore `tasks` ──▶ dashboard
                                          │
                                          └─ "New" / "Deadline changed" push
Scheduler ──(every 15 min)──▶ /api/remind ──▶ FCM ──▶ service worker ──▶ notification
                                                         └─ Mark done / Remind in 2h ─▶ /api/tasks/[id]/action
```

- **Sources** implement one interface (`lib/sources/types.ts`). Today there is `ManipalIcsAdapter`,
  which reads the Brightspace calendar feed and merges a quiz's "Available / Ends / Due" events into one task.
- **Sync** (`lib/sync.ts`) adds new tasks, updates changed deadlines, and marks tasks that vanished
  from the LMS as cancelled. Anything already past when first seen is ignored.
- **Reminders** (`lib/remind.ts`, `lib/stages.ts`) fire once each: 48h, 24h, 9 AM on the day, 6h, 3h,
  1h before, and once right after the deadline. Reminders that come due together are sent as one
  notification. The 6h/3h/1h ones stay on screen until you act.
- **Dashboard** (`app/dashboard`): Home, Reminders, Done and Settings, light and dark mode, built phone-first.

All times are stored in UTC and shown in IST.

## Setup

### 1. Firebase

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. **Firestore Database → Create database**, in production mode (location `asia-south1`). The rules in
   `firestore.rules` deny all browser access; only the server reads and writes.
3. **Project settings → Service accounts → Generate new private key.** Its `project_id`,
   `client_email` and `private_key` become the three `FIREBASE_*` variables.
4. **Project settings → General → Your apps → Add app → Web.** Its config gives the
   `NEXT_PUBLIC_FIREBASE_*` values (apiKey, projectId, appId, messagingSenderId).
5. **Project settings → Cloud Messaging → Web Push certificates → Generate key pair.** That key is
   `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.

### 2. The LMS feed

In the MUJ LMS, open **Calendar → Subscribe**, choose all courses, and copy the link. That's `MUJ_ICS_URL`.
It contains a personal token: treat it like a password.

### 3. Environment variables

Copy `.env.example` to `.env.local` and fill it in.

| Variable | What it is |
| --- | --- |
| `MUJ_ICS_URL` | The LMS calendar feed link (secret) |
| `CRON_SECRET` | Long random string the scheduler sends as `Authorization: Bearer …` |
| `OWNER_PASSWORD` | What you type once per device to unlock the dashboard |
| `AUTH_SECRET` | Long random string that signs the unlock cookie and notification buttons |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Service account (secret) |
| `NEXT_PUBLIC_FIREBASE_*` | Web app config and VAPID key (public by design) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Reads NPTEL's deadline emails (model is optional) |

Generate the random strings with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

### 4. Run it locally

```bash
npm install
npm run ics:inspect     # print everything in the LMS feed
npm run tasks:preview   # the tasks a sync would create, without touching Firestore
npm run dev             # http://localhost:3000
```

## Deploy to Vercel

1. Push this repo to GitHub, then **Add New → Project** on [vercel.com](https://vercel.com) and import it.
   (Or run `npx vercel` in this folder.)
2. Add every variable from `.env.local` under **Settings → Environment Variables** (Production).
   `NEXT_PUBLIC_*` values are built into the app, so redeploy after changing them.
3. Deploy. `vercel.json` adds a daily `/api/sync` as a backup; Vercel sends `CRON_SECRET` to it automatically.

## Scheduling

Vercel's free plan only allows a cron job **once a day** (checked September 2026), so the frequent
triggers come from outside:

**cron-job.org (recommended, free, minute-accurate).** Create two jobs:

| URL | Schedule | Header |
| --- | --- | --- |
| `https://<your-app>/api/sync` | every hour | `Authorization: Bearer <CRON_SECRET>` |
| `https://<your-app>/api/remind` | every 15 minutes | `Authorization: Bearer <CRON_SECRET>` |

**GitHub Actions (alternative).** `.github/workflows/cron.yml` does the same. Add repository secrets
`APP_URL` and `CRON_SECRET`. GitHub can start scheduled runs late, and a private repo would use more
than the free 2,000 minutes a month.

## On your phone

1. Open your Vercel URL in Chrome and unlock with `OWNER_PASSWORD`.
2. Tap **Turn on** on the blue reminders card, and allow notifications.
3. **Settings → Install** (or Chrome's ⋮ menu → Add to Home screen).
4. **Settings → Send a test** to check a notification arrives.

## Security

- `/dashboard` needs the unlock cookie (`proxy.ts`): an httpOnly, year-long cookie holding an
  HMAC signed with `AUTH_SECRET`. Lock a device from Settings.
- `/api/sync` and `/api/remind` need `CRON_SECRET`.
- Notification buttons call `/api/tasks/[id]/action` with a per-task signed token, so they work
  without opening the app, and nobody can forge one.
- Firestore rules deny all browser access.

## NPTEL (through your Gmail)

NPTEL emails every assignment deadline and every extension. A small Google Apps Script (the
"Gmail bridge", `lib/gmail-bridge.ts`) runs in your own Google account, finds NPTEL emails every
hour and posts them to `/api/ingest/email` with `CRON_SECRET`. Lume asks Gemini to pull out each
deadline (`lib/gemini.ts`), keeps the result in Firestore `emails/{gmailId}` (subject, sender, date and
deadlines only, never the email body) and syncs them as NPTEL tasks.

1. Get a free Gemini key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and set
   `GEMINI_API_KEY` (on Vercel too).
2. On your **deployed** Lume, open **Settings → Sources → NPTEL → How to connect**, tap
   **Copy script**, paste it into a new project at [script.google.com](https://script.google.com),
   choose `setup` and click **Run**. Allow it to read your Gmail (Advanced → Go to project, since
   it's your own unverified script).
3. The first run catches up on the last 60 days. After that it checks every hour.

Several emails about the same deadline (announced, reminder, extended) become one task; the newest
email's date wins, so an extension shows up as "Deadline changed". Email sources never mark tasks
as cancelled, because an email search can't know that an assignment was withdrawn.

## Adding the next source (IITM BS)

- **By email** (like NPTEL): add a search for its sender to `SEARCHES` in the bridge script
  (`lib/gmail-bridge.ts`), and `new EmailDeadlinesAdapter('iitm')` to `emailAdapters()` in
  `lib/sources/index.ts`. Then copy the script again from Settings.
- **Anything else**: write an adapter in `lib/sources/` that implements `SourceAdapter`.
  `fetchTasks()` returns `RawTask[]`, and `externalId` must stay the same for the same assignment
  across runs, since that's what prevents duplicates. Set `authoritative` to true only if it returns every
  current item. Register it in `adapters()`.

## Troubleshooting

- **Settings says the LMS "Needs attention"**: the feed link probably expired. Subscribe again in the
  LMS and update `MUJ_ICS_URL`.
- **No notifications**: check Settings → Notifications is on for the device, send a test, and make
  sure the scheduler calls `/api/remind` with the right header.
- **"Reminders aren't set up yet"**: the `NEXT_PUBLIC_FIREBASE_*` variables are missing from the build.
