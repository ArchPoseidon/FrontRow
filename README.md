# FrontRow

*Be the first to know about a show.* Scheduled automation with AI at the messy-text edges: fans follow artists and get a Telegram alert when an artist announces or opens tickets for a show in India.

## Setup
1. `cp .env.example .env.local` and fill the values (never commit it).
2. `npm run db:migrate`
3. `npm run dev`

## Cron
Jobs are `POST /api/jobs/*` with `Authorization: Bearer $CRON_SECRET`. Created on cron-job.org by `scripts/setup-cron.ts` (added in Phase 5). Vercel cron runs only the daily heartbeat.
