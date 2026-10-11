# FrontRow

Be the first to know about a show. FrontRow watches the Indian concert and festival calendar and alerts you on Telegram and email when an artist you follow announces a show in India.

## Run locally

1. Install Node 20+.
2. Copy `.env.example` to `.env.local` and fill in the values (never commit this file).
3. `npm install`
4. `npm run db:migrate` to create the tables in Neon.
5. `npm run dev`, then open http://localhost:3000.

## Google sign-in setup (one time)

1. Open https://console.cloud.google.com and create a project named FrontRow.
2. Go to APIs & Services > OAuth consent screen. Choose External, fill in the app name and your email, and save.
3. Under Audience, click **Publish app** so anyone can sign in (not only listed test users).
4. Go to Credentials > Create credentials > OAuth client ID > Web application.
5. Add these Authorized redirect URIs:
   - `https://<your-production-domain>/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google`
6. Copy the Client ID and Client secret into `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` (locally and in Vercel).
7. Set `OWNER_EMAIL` to the Google email you will sign in with.

## Health check

`GET /api/health` returns JSON with database status and real counts.

## Adding a judge (Testing mode)

Google Cloud Console > APIs & Services > OAuth consent screen > Audience > Test users > Add users. Enter their exact Google email and save. It takes effect within a few minutes.

## Scheduling (cron-job.org), one time

Vercel's free plan only runs daily jobs, so cron-job.org calls the job routes. Only the 8:30 heartbeat uses Vercel's own cron.

**Automatic (recommended):**
1. Sign up free at https://cron-job.org and log in.
2. Click your name (top right) > **Settings** > **API** > **Create API key**. Copy it.
3. Put it in `.env.local` as `CRONJOB_API_KEY=...`, then run `npx tsx scripts/setup-cron.ts`. It creates the six schedules below and is safe to run again.

**By hand:** for each row, click **Create cronjob**, paste the URL, open **Advanced**, set the request method to **POST**, add the header `Authorization` = `Bearer <your CRON_SECRET>`, choose the timezone Asia/Kolkata, and set the schedule.

| Job | URL | When |
| --- | --- | --- |
| news | `<APP_URL>/api/jobs/news` | every 15 min |
| process | `<APP_URL>/api/jobs/process` | every 5 min |
| dispatch | `<APP_URL>/api/jobs/dispatch` | every 5 min |
| links | `<APP_URL>/api/jobs/links` | every 10 min |
| listings | `<APP_URL>/api/jobs/listings` | every 30 min (each page is scraped every 6 h) |
| sweep | `<APP_URL>/api/jobs/sweep` | every 30 min, 06:00 to 10:00 |

The System pulse on the radar turns each dot green once its job has run. The heartbeat message arrives on Telegram daily at 8:30.

## Google Calendar (one time)

"Add to calendar" always puts a show in the FrontRow calendar view. To also put it in Google Calendar, the Google project needs the Calendar API:
1. Open https://console.cloud.google.com and pick the FrontRow project.
2. Go to **APIs & Services > Library**, search for **Google Calendar API**, and click **Enable**.
3. Go to **APIs & Services > OAuth consent screen > Data Access** (or **Scopes**), click **Add or remove scopes**, tick `.../auth/calendar.events`, and save.
4. Nothing else changes: the redirect URI is the same one sign-in already uses. While the app is in Testing mode, only the test users you listed can connect Google Calendar, and Google shows them an "unverified app" screen once (**Continue** to proceed).
5. In the app, open **Profile > Google Calendar > Connect Google Calendar**, or tap **Add to calendar** on any show.
