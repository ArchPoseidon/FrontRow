# FrontRow

*Be the first to know about a show.* Scheduled automation with AI at the messy-text edges: fans follow artists and get a Telegram alert when an artist announces or opens tickets for a show in India.

## Setup
1. `cp .env.example .env.local` and fill the values (never commit it).
2. `npm run db:migrate`
3. `npm run dev`

## Cron
`npx tsx scripts/setup-cron.ts` (needs `CRONJOB_API_KEY`, `APP_URL`, `CRON_SECRET`) creates or updates these on cron-job.org (timezone Asia/Kolkata): news */15, process */5, dispatch */5, links */10, listings :00/:30, sweep :00/:30 at 06-10, digest 09:00, artist-news every 6 h, calls */5. `npx tsx scripts/set-webhook.ts https://<domain>` points the Telegram bot at the app.

Jobs are `POST /api/jobs/*` with `Authorization: Bearer $CRON_SECRET`. Created on cron-job.org by `scripts/setup-cron.ts` (added in Phase 5). Vercel cron runs only the daily heartbeat.
