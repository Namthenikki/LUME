# Lume

A personal deadline manager. Lume reads every assignment and quiz deadline from the Manipal LMS and
NPTEL on its own, shows them in one dashboard, and reminds you more often as each deadline gets close, until
you mark it done. On Android it also **rings like an alarm** 30 and 10 minutes before a deadline.

It's a web app (installable as a PWA) plus a small Android app that wraps it (a Trusted Web
Activity) and adds the alarms. It's for one person: you.

## How it works

```
MUJ LMS calendar feed ──(hourly)──▶ /api/sync ──────────┐
Chrome extension on the laptop ──(3-hourly)──▶ /api/ingest/nptel ──┴─▶ Firestore `tasks` ──▶ dashboard
                                                                     └─ "New" / "Deadline changed" push
Scheduler ──(every 5 min)──▶ /api/remind ──▶ FCM ──▶ service worker ──▶ notification
                                                        └─ Mark done / Remind in 2h ─▶ /api/tasks/[id]/action
Android app ──(every 15 min + on launch)──▶ /api/alarms ──▶ exact alarms on the phone ──▶ full-screen alarm
```

- **Sources** implement one interface (`lib/sources/types.ts`). `ManipalIcsAdapter` reads the Brightspace
  calendar feed and merges a quiz's "Available / Ends / Due" events into one task. `NptelAdapter` takes
  what the Chrome extension sends (see [NPTEL](#nptel-chrome-extension)).
- **Sync** (`lib/sync.ts`) adds new tasks, updates changed deadlines, and marks tasks that vanished
  from the LMS as cancelled. Anything already past when first seen is ignored.
- **Reminders** (`lib/remind.ts`, `lib/stages.ts`) fire once each: 48h, 24h, 9 AM on the day, 6h, 3h,
  1h, 30 min and 10 min before, and once right after the deadline. Reminders that come due together
  are sent as one notification. From 6h on they stay on screen until you act.
- **Alarms** (`android/`): the Android app fetches the alarm schedule and sets exact alarm-clock alarms
  for 30 and 10 minutes before each deadline. When one goes off it rings with the phone's alarm sound
  (or only vibrates, with the phone on silent), repeating until you tap **Mark done** or **Snooze 10 min**.
  On a locked phone it opens a full-screen alarm. Before ringing it checks the task is still pending.
- **Dashboard** (`app/dashboard`): Home, Reminders, Done and Settings. Phone-first, light by default,
  with an optional dark theme.

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
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Only for the email bridge, which isn't connected yet |

Generate the random strings with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

### 4. Run it locally

```bash
npm install
npm run ics:inspect     # print everything in the LMS feed
npm run tasks:preview   # the tasks a sync would create, without touching Firestore
npm run dev             # http://localhost:3000
```

## Deploy to Vercel

1. On [vercel.com](https://vercel.com): **Add New → Project**, import this GitHub repo.
2. Add every variable from `.env.local` under **Settings → Environment Variables** (Production).
   `NEXT_PUBLIC_*` values are built into the app, so redeploy after changing them.
3. Deploy. `vercel.json` adds a daily `/api/sync` as a backup; Vercel sends `CRON_SECRET` to it automatically.

## Scheduling

Vercel's free plan only allows a cron job **once a day** (checked September 2026), so the frequent
triggers come from outside.

**GitHub Actions (what this repo uses).** `.github/workflows/cron.yml` calls `/api/remind` every 5 minutes
and `/api/sync` every hour. The repo is public, so the runs are free. It needs one repository secret,
`CRON_SECRET` (Settings → Secrets and variables → Actions); `APP_URL` is optional and defaults to the
deployed address. Until the secret is added, runs only log a warning.

**Backup triggers** (`lib/catch-up.ts`). GitHub can start scheduled runs late or skip them (on
30 September 2026 it ran the 5-minute job twice in three hours), so Lume also catches up whenever the
Android app syncs its alarms (every 15 minutes), the app is opened, or the NPTEL extension posts: it sends
due reminders, and syncs the LMS if the last sync is over 50 minutes old. Firestore locks (`meta/remind`,
`meta/sync-lock`) make sure two callers at once never send the same notification twice, and a reminder
that goes out late says the real time left. **Settings → Notifications** shows
when reminders were last checked, and turns red after 30 minutes without a check.

**cron-job.org (alternative, minute-accurate).** Two jobs, each with the header
`Authorization: Bearer <CRON_SECRET>`: `https://<your-app>/api/remind` every 5 minutes and
`https://<your-app>/api/sync` every hour.

The Android alarms don't depend on any of this: they're set on the phone itself.

## The Android app

The app lives in `android/`: Google's Trusted Web Activity library opens the deployed site full
screen, and a small native part (`android/app/src/main/java/app/lume/deadlines`) handles the alarms.

**Build it for your deployed site:**

```bash
npm run android:release -- https://your-app.vercel.app
git add public/downloads/lume.apk public/.well-known/assetlinks.json lib/android-release.json
git commit -m "Android app for https://your-app.vercel.app" && git push
```

That builds a signed APK for that address, puts it at `/downloads/lume.apk` (Settings offers it), and
publishes `/.well-known/assetlinks.json`, which lets Android open the site with no browser bar.

**Updates:** the app reports its version when it opens. Once a newer APK is deployed, Home and
Settings inside the app show **Install update**, which downloads it and hands it to Android's
installer (the first time, Android asks you to allow Lume to install apps).

It needs JDK 17+, the Android SDK and Gradle 9. The script defaults to the paths on the build PC; set
`JAVA_HOME`, `GRADLE` and `GRADLE_USER_HOME` to use others.

**Signing key:** `android/lume-release.jks` and `android/keystore.properties` sign every build. They're
git-ignored, so **back them up somewhere safe**. Android only installs an update if it's signed with
the same key; lose it and you'd have to uninstall the app and install a fresh one.

## On your phone

1. Open your Vercel URL in Chrome, unlock with `OWNER_PASSWORD`, then **Settings → Android app →
   Download for Android**. Open the file and allow installing from Chrome when asked.
2. Open **Lume** from your home screen and unlock once more. The app pairs itself for alarms within a
   minute (Settings shows "1 phone rings alarms").
3. Tap **Turn on** on the blue reminders card and allow notifications. The alarms need this too.
4. **Settings → Send a test** to check a notification arrives.
5. On Xiaomi/Redmi/POCO, Realme, Oppo, Vivo and OnePlus phones, set Lume's battery usage to **No
   restrictions** (long-press the app icon → App info → Battery), or the phone may delay its alarm sync.
   On Android 14+, also check App info → **Full-screen notifications** is allowed for the lock-screen alarm.

Without the Android app (desktop, iPhone), **Settings → Install** adds Lume as a web app, with the
same notifications but no alarm.

## Security

- `/dashboard` needs the unlock cookie (`proxy.ts`): an httpOnly, year-long cookie holding an HMAC
  signed with `AUTH_SECRET`. Lock a device from Settings.
- `/api/sync` and `/api/remind` need `CRON_SECRET`.
- `/api/ingest/nptel` needs the NPTEL key: an HMAC of a fixed value with `AUTH_SECRET`, shown only in
  Settings. It can only add NPTEL deadlines, so the extension never holds `CRON_SECRET`.
- Notification and alarm buttons call `/api/tasks/[id]/action` with a per-task signed token, so they
  work without opening the app, and nobody can forge one.
- The Android app reads `/api/alarms` with a random device token that you approve by opening the app
  while unlocked. Only a hash of it is stored. **Settings → Android app → Stop alarms** unpairs every phone.
- Firestore rules deny all browser access.

## NPTEL (Chrome extension)

NPTEL has no calendar feed, and its login (SWAYAM single sign-on) can't be scripted from a server. So a
small Chrome extension (`extension/`) does it from your laptop's Chrome, where you're already logged in:

- Every 3 hours while Chrome is open (and when Chrome starts, or you open a course), it calls the same
  JSON API NPTEL's course pages use: `/e-learning/api/courseoutline` for each course's assignments, then
  `/e-learning/api/assessment` (or `programming_assessment`) for each one's due date.
- It posts them to `/api/ingest/nptel`, and they sync like LMS tasks: same reminders, alarms and pushes.
- An MCQ assignment you've submitted on NPTEL is marked done in Lume. Programming assignments aren't,
  because a test run looks the same as a submission there; tick those yourself.
- If you're signed out of NPTEL, your phone gets one "NPTEL sync stopped" notification, and Home shows
  it until the next good sync. Home also warns after 2 days without a sync.

Set up: **Settings → Sources → NPTEL** has the download, the steps, and the connection code (your Lume
address and NPTEL key). Courses are found by opening them once on NPTEL, or added in the extension's
popup. Chrome on phones can't run extensions; the phone gets everything through Lume as usual.

After changing `extension/`, run `npm run extension:zip` to rebuild the download in `public/downloads/`.

## Email sources (not connected yet)

`lib/gmail-bridge.ts`, `lib/inbox.ts`, `lib/gemini.ts` and `/api/ingest/email` form a pipeline for
sources that email their deadlines: a Google Apps Script in your Gmail posts matching emails to Lume,
Gemini extracts `{ course, title, dueAt }`, and they sync like any other task. It's parked because
NPTEL's emails don't reach this Gmail (NPTEL uses the Chrome extension instead). IITM BS can use it: add its sender to `SEARCHES` and
`new EmailDeadlinesAdapter('iitm')` to `emailAdapters()` in `lib/sources/index.ts`.

## Adding the next source

Write an adapter in `lib/sources/` that implements `SourceAdapter`. `fetchTasks()` returns
`RawTask[]`, and `externalId` must stay the same for the same assignment across runs, since that's what
prevents duplicates. Set `authoritative` to true only if it returns every current item (then items
missing from it are marked cancelled). Register it in `adapters()` in `lib/sources/index.ts`.

## Troubleshooting

- **Settings says the LMS "Needs attention"**: the feed link probably expired. Subscribe again in the
  LMS and update `MUJ_ICS_URL`.
- **NPTEL "Needs attention"**: open the extension's popup. "Signed out" means log in to NPTEL in that
  Chrome. "Wrong key" means copy the connection code from Settings again (it changes if `AUTH_SECRET` does).
- **No notifications**: check Settings → Notifications is on for the device, send a test, and make
  sure the scheduler calls `/api/remind` with the right header (Settings → Notifications says when
  reminders were last checked; the repo's Actions tab shows the cron runs).
- **"Reminders aren't set up yet"**: the `NEXT_PUBLIC_FIREBASE_*` variables are missing from the build.
- **The Android app shows a browser bar**: `/.well-known/assetlinks.json` isn't live for that address.
  Rebuild with `npm run android:release` for the exact URL, and push.
- **No alarm**: Settings should list your phone under Android app. If not, open the Lume app once while
  unlocked. Also check the battery and full-screen settings above.
