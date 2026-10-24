# FrontRow — full rebuild prompt (v2, with owner changes)

> Paste this whole file into a fresh Claude Code chat in an empty folder. It describes the finished product, the stack, every rule learned the hard way, and the 12 changes plus 3 new areas the owner wants. Build it phase by phase, in order, and stop at each gate.

---

## 0. How to work

1. Read `AGENTS.md` / `node_modules/next/dist/docs/` before writing any Next.js code. This is **Next.js 16.4** (not the one in your memory): `middleware.ts` is now `proxy.ts`, `cacheComponents` is on (so `export const dynamic` is not allowed in route segments), route handlers are dynamic by default, `after()` is available. Heed deprecation notices.
2. Keep a `DECISIONS.md` from day one. Every choice that deviates from this prompt, every discovered limit of a third-party service, and every "I tested X and it did Y" goes in as one short line. Keep a short `README.md` (setup, env names, cron setup).
3. Work in phases (section 9). Each phase ends with a gate: run it, show evidence (curl output, screenshots, DB counts), then continue. Never claim something works without having run it.
4. **Free tiers only** unless this prompt says otherwise. Never invent events. Never automate ticket purchases. Never show a link that has not been verified. Show failures honestly instead of hiding them.
5. Secrets: this prompt names environment variables only. The owner will supply the values (copy from the old project's `.env.local`). Never print, log or commit secret values. `.env.local` is gitignored; `.env.example` lists names only.
6. Item numbers in section 7 follow the owner's list, which had no item 2. If something was meant to be item 2, ask the owner once at the start, then continue.
7. When a third-party API is uncertain (Pine Labs, Voibz, ElevenLabs agent calls, Spotify quotas), **test it live first**, write the result into `DECISIONS.md`, then code against what you saw.

---

## 1. Product

**FrontRow** — tagline *"Be the first to know about a show."*
A fan signs in, tells the app which artists they follow, and gets a Telegram alert (and, later, a voice call) the moment one of those artists announces or opens tickets for a show **in India**, with a ticket link that opens the **exact page** for that show.

Core principles (do not break):
- AI reads, code decides. Gemini turns messy text into structured shows. Matching, dedupe, urgency, link verification and dispatch are plain code with fixed thresholds.
- No source link → no event. Two independent sources or a verified ticket URL before a red alert.
- Honest states: "Ticket page not confirmed yet" beats a wrong link.
- Works for any user and any artist; the owner is just the demo user.
- Every failure is visible: `/api/health`, per-source dots, a daily owner heartbeat.

Is it an agent or automation? Be honest in docs: it is a **scheduled automation with AI at the messy-text edges** (grounded search, extraction, yes/no tie-breaks), with humans making the key calls.

---

## 2. Stack and accounts

| Area | Choice |
|---|---|
| Framework | Next.js 16.4 (App Router, Turbopack), React 19.3, TypeScript 5 |
| Styling | Tailwind 4 + CSS variables in `app/globals.css`; dark by default, light via `data-theme="light"` |
| DB | Neon Postgres, Drizzle ORM (`neon-http` driver via `@neondatabase/serverless`, one light client per call, no pool); `drizzle-kit` migrations; `pg_trgm` enabled at top of `0000_init.sql` |
| Auth | Auth.js v5 (`next-auth@beta`) + `@auth/drizzle-adapter`, **database sessions**, Google provider |
| AI | Gemini via `@google/genai`; model from `GEMINI_MODEL` (was `gemini-3.8-flash`); key sent as `x-goog-api-key` |
| Validation | Zod 4 |
| Other deps | `rss-parser`, `qrcode`, `nodemailer`; `tsx` for scripts; `dotenv` |
| Hosting | Product on Vercel (free); admin site on Replit (section 8.3). Free plan only allows daily cron, so **cron-job.org** calls job routes; Vercel cron runs only the daily owner heartbeat |
| Bot | Telegram Bot API webhook |
| Crawlers | Firecrawl → Scrape.do → Jina → plain fetch (with a runtime kill switch, section 4.6) |
| Music data | Spotify Web API, MusicBrainz |
| New | Pine Labs (payments, stubbed behind a flag), Voibz + ElevenLabs (voice calls, behind a flag) |

### Environment variable names (values supplied by owner)
```
DATABASE_URL  AUTH_SECRET  AUTH_GOOGLE_ID  AUTH_GOOGLE_SECRET  OWNER_EMAIL  APP_URL
GEMINI_API_KEY  GEMINI_MODEL
FIRECRAWL_API_KEY  FIRECRAWL_DAILY_CAP=60
CRAWLER_API_KEY (Scrape.do)  SCRAPEDO_MONTHLY_CAP=900  SCRAPEDO_DAILY_CAP=40
CRAWLERS_PAUSED (optional hard override)
TELEGRAM_BOT_TOKEN  TELEGRAM_BOT_USERNAME  TELEGRAM_WEBHOOK_SECRET  OWNER_TELEGRAM_CHAT_ID
SPOTIFY_CLIENT_ID  SPOTIFY_CLIENT_SECRET  SPOTIFY_REDIRECT_URI
MUSICBRAINZ_USER_AGENT
CRON_SECRET  CRONJOB_API_KEY
BREVO_API_KEY  BREVO_SENDER   (email, optional; Gmail API/SMTP/Resend fallbacks: GMAIL_SENDER GMAIL_REFRESH_TOKEN GMAIL_USER GMAIL_APP_PASSWORD RESEND_API_KEY EMAIL_FROM)
PROCESS_BATCH  INSTANT_ALERT_CAP  (optional tuning)
NEW: PAYMENTS_ENABLED=false  PINELABS_ENV  PINELABS_MERCHANT_ID  PINELABS_CLIENT_ID  PINELABS_CLIENT_SECRET  PINELABS_WEBHOOK_SECRET
NEW: ADMIN_API_SECRET (shared by the main app and the admin site; see 8.3)
NEW: VOICE_CALLS_ENABLED=false  VOIBZ_API_KEY  VOIBZ_*  ELEVENLABS_API_KEY  ELEVENLABS_AGENT_ID
```

### Because the owner is moving to a different GitHub and Vercel project
After first deploy, update everything tied to the old domain: `APP_URL`; Google OAuth redirect URI `https://<new-domain>/api/auth/callback/google` (and add judges as test users; consent screen stays in Testing mode); Spotify redirect URI `https://<new-domain>/api/spotify/callback` (exact match, no trailing slash); Telegram webhook (`scripts/set-webhook.ts`); cron-job.org jobs (`scripts/setup-cron.ts` with the new `APP_URL`). **Ask the owner whether to reuse the old Neon `DATABASE_URL`**: reusing it shares data with the live old app (recommend a fresh Neon database/branch, then re-run the owner seed script). If reused, make migrations idempotent (`IF NOT EXISTS`).

---

## 3. Data model (Drizzle, snake_case columns)

Auth.js tables `users`, `accounts`, `sessions`, `verification_tokens` use the adapter's exact shapes (camelCase column names `userId`, `emailVerified`, `sessionToken`, etc.).

**users**: `id` text pk (uuid), `name`, `email` unique, `emailVerified`, `image`, `home_city` default 'Bengaluru', `watch_cities` text[] default `{ALL_INDIA}`, `telegram_chat_id` bigint, `telegram_link_code` unique, `email_enabled`, `telegram_enabled`, `onboarding_step` int default 0, `onboarded_at`, `first_scan_at`, `is_owner` bool, `created_at`.
**NEW on users**: `p1_cities` text[] default `{}`, `p2_cities` text[] default `{}`, `watch_all_india` bool default true, `phone_e164` text null, `phone_consent_at` tstz null, `plan` text default 'free', `last_seen_at` tstz null (touched at most once per 10 min per user), `disabled_at` tstz null (owner can disable an account).

**accounts** (Auth.js; holds Google tokens incl. `scope`, `refresh_token`, `expires_at`), **spotify_connections** (`user_id` pk, `spotify_user_id`, `display_name`, `refresh_token`, `access_token`, `expires_at`, `broken`).

**artists**: `id` uuid, `name`, `normalized_name`, `aliases` text[], `spotify_id` unique, `mbid` unique, `image_url`, `genres` text[], `origin` ('india'|'international'|'unknown'), `identity_status` ('verified'|'needs_review'|'unverified'), `last_india_show`, `last_india_date`, `last_checked_at`, `upcoming_count`; GIN trigram index on `normalized_name`.
**NEW on artists**: `is_deceased` bool default false, `deceased_checked_at` tstz, `inactive_reason` text null ('deceased'|'disbanded'), `bio_source_url` text null.
**user_artists**: pk (`user_id`,`artist_id`), `priority` ('must_see'|'follow'|'muted'), `added_via` ('spotify_followed'|'spotify_top'|'spotify_link'|'search'|'paste'|'suggested'). **NEW**: `call_me` bool default false, `call_lead_minutes` int default 60.
**artist_candidates**: `id`, `user_id`, `input_text`, `candidates` jsonb, `status` ('open'|'resolved'|'removed'). (`needs_review` = open candidate rows, never artist rows.)

**sources** (`kind` in news_rss|listing|grounded_sweep|event_page; `interval_minutes`, `last_run_at`, `last_ok_at`, `last_error`, `consecutive_failures`, `last_content_hash`), **raw_items** (`content_hash` unique, `status` new|processed|skipped|error).
**events**: `artist_id`, `title`, `venue`, `city`, `state`, `event_date`, `event_time`, `ticket_url`, `platform`, `status` (rumored|announced|sale_soon|on_sale|early_bird|sold_out|cancelled), `sale_opens_at`, `confidence`, `is_festival`, `lineup` text[], `ticket_status` (unchecked|exact|ok|generic|broken|blocked|mismatch|none), `ticket_checked_at`, `dedupe_key` unique, `is_sample`, `first_seen_at`, `updated_at`.
**NEW on events**: `ticket_verified_at` tstz, `ticket_report_count` int default 0.
**event_tiers** (`name`, `price_inr`, `status` upcoming|open|sold_out|closed, `opens_at`, `closes_at`), **event_sources** (pk `event_id`,`url`; `platform`, `status`, `http_status`, `final_url`, `page_title`, `checked_at`).
**alerts**: `user_id`, `event_id`, `kind` (new_show|early_bird_open|sale_soon|closing_soon|tier_change|digest|test), `channel` (telegram|email), `urgency` (red|amber|info), `sent_at`, `status` (pending|digest_pending|sent|…), `user_action` (dismissed|going|saved|…), `telegram_message_id`; unique (`user_id`,`event_id`,`kind`,`channel`).
**runs**: `job`, `started_at`, `finished_at`, `items_in`, `events_new`, `alerts_sent`, `firecrawl_credits`, `scrapedo_credits`, `errors` jsonb.
**calendar_entries**: pk (`user_id`,`event_id`), `google_event_id`, `created_at`.
**app_settings**: `key` pk, `value`, `updated_at` — runtime switches (`crawlers_paused`; seed it to `'0'`).

**NEW tables**
- `activity_events`: `id`, `user_id` (nullable, `on delete set null`), `type` text, `meta` jsonb (no secrets, no phone numbers, no emails), `created_at`; index on (`type`,`created_at`) and (`user_id`,`created_at`). Written by one helper `track(type, userId, meta)` that never throws and never blocks a request (fire it inside `after()`).
- `artist_news`: `id`, `artist_id`, `title`, `url` (canonical, unique per artist), `publisher`, `published_at`, `fetched_at`.
- `merch_products`: `id`, `artist_id` (nullable for generic), `name`, `description`, `image_url`, `price_inr` int, `category`, `is_demo` bool default true, `active` bool.
- `merch_variants`: `id`, `product_id`, `size` text null (S/M/L/XL/Free), `sku`, `stock` int.
- `cart_items`: `user_id`, `variant_id`, `qty`; pk (`user_id`,`variant_id`).
- `subscriptions`: `id`, `user_id`, `plan` ('free'|'plus'), `status` ('active'|'pending'|'cancelled'|'failed'), `pinelabs_order_id`, `amount_inr`, `current_period_end`, `created_at`.
- `payment_events`: `id`, `provider`, `event_id` unique, `payload` jsonb, `received_at` (webhook idempotency).
- `call_reminders`: `id`, `user_id`, `artist_id`, `event_id`, `scheduled_for` tstz, `status` ('scheduled'|'calling'|'done'|'failed'|'cancelled'|'no_answer'), `attempts` int, `provider_call_id`, `outcome` jsonb, `created_at`; unique (`user_id`,`event_id`).

---

## 4. The pipeline (the heart of the app)

### 4.1 Identity resolution (artists)
- Inputs: Spotify import (followed + top, merged long/medium/short term, up to 100 distinct), search, pasted list (3+ names or Spotify links).
- Spotify **search and artist lookup use the app's client-credentials token**, not the user's token, so resolution works even if a user's connection breaks. The per-user token is used only for the followed/top import.
- Auto-accept only when **exactly one** result matches the normalized name exactly. Two exact matches (duplicate Spotify profiles) → "Which one?" tray. No result in Spotify or MusicBrainz → `unverified` ("Name only").
- MusicBrainz (needs the `User-Agent`): aliases, origin from country (`india|international|unknown`), `mbid`. Accept a name-only MusicBrainz match only if it is a single perfect-score exact hit; otherwise take the mbid from the Spotify URL relation or leave it empty. Enrichment runs best-effort in `after()` with a 40 s budget (MusicBrainz answers in 2–3 s); leftovers keep derived aliases (leading "The", "&"/"and") and are enriched on a later pass. **Aliases always come from MusicBrainz, never from the AI.**
- **Deceased/inactive artists never appear anywhere** (see item 9).

### 4.2 Collectors (each writes `raw_items`; each run is logged in `runs`)
- **News** (every 15 min): Google News RSS per watched artist (up to 40 per run, must-see first) plus generic feeds ("early bird tickets concert India" etc.). A headline must name a watched artist (normalized, whole-word) to become a raw item. Google News links are decoded to the publisher article.
- **Listings** (every 30 min; each page re-read only every 6 h): District (music, Bengaluru), BookMyShow (music shows, Bengaluru), AllEvents (Bangalore music). Pages are split into ~9 KB chunks; only chunks naming a watched artist go to Gemini. An event's own page link (not the listing URL) becomes its source. An unchanged page (hash of its event links) stops before extraction. SortMyScene and SkillBox were tried and removed (no usable event list without a browser). Check each platform live before seeding; no platform offered a working all-India listing.
- **Grounded sweep** (every 30 min, 06:00–10:30 IST): Gemini with Google Search grounding, one named artist per query ("any upcoming India show announced?"). Grounding and structured output are **separate calls** (the combined call returned no text). Decide "nothing announced" from a structured boolean field (`has_upcoming_india_show`), not the word NONE. Those sweeps store no raw item, spend no extraction call, but still update `last_checked_at`/"Last in India". Grounding links are Google redirects: follow each once (4 s budget) to the real page, strip tracking params. If Gemini spells the artist differently, trust the sweep's artist hint for non-festival events.
- **First-run scan**: artists swept in the last 12 h are not swept again (shared cache across users); up to 8 swept, must-see first; the rest report "Deep check runs tonight".

### 4.3 Brain
- **Extract** (Gemini structured output, Zod-validated): artist, title, venue, city, state, date, time, status, sale-open time, tiers (name, ₹ price, status, open/close), ticket URL, is_festival, lineup, is_tribute, confidence. Retries at 1, 4, 16 s on 429/5xx; broken JSON → ask once more, then mark the item `error`. A failed AI step never creates a show.
- **Match**: JS port of `pg_trgm` similarity over the watched list (exact normalized name/alias first; trigram ≥ 0.85, ≥ 0.92 for name-only artists; Gemini yes/no only for 0.7–0.85). Reject tribute/cover nights.
- **Dedupe**: same artist + city + date → one event (`dedupe_key`); merge sources and tiers.
- **Gates**: show needs a real source URL, an India location, a future date.
- **Urgency** (`computeUrgency`, plain code; city priority rules in item 3): returns null if city not watched; `info` for rumours, confidence < 0.6, festival without ticket URL; `red` only for a P1/home city with tickets open or imminent (<24 h) **and** (verified ticket URL or ≥ 2 sources) else `amber`; `amber` for other watched cities with open/soon sale, or must-see artists; else `info`.
- **Stage colour** (`lib/stage.ts`): `live` red 🔴 (tickets can be bought), `soon` purple 🟣 (confirmed show with go-live date announced), `announced` orange 🟠, `soldout` dark grey, `rumor` grey dashed. "Confirmed" = confidence ≥ 0.9 or two independent sources.
- **Decide** queues `alerts` rows (`pending`, or `digest_pending` for info), idempotent via the unique constraint, upgrades an unsent alert if urgency rises. Alerts for past-dated events are skipped.

### 4.4 Link verification (see item 1 — this is where most bugs were)
Every ticket/source URL is checked: it must load, be a **specific** page (not homepage, listing, link-in-bio, bare social profile), name the artist, and — for ticketing hosts — match this show's **city or date**. Statuses: `exact`, `ok`, `generic`, `broken`, `blocked`, `mismatch`, `unchecked`, `none`. People only see `exact`/`ok` ticket links; sources shown are `exact`/`ok`/`blocked`. Final URL after redirects, tracking params stripped, is what is stored. Blocked ticketing pages (BookMyShow, Bandsintown: Cloudflare) go through the crawler chain; the same scrape also feeds tier extraction (one credit for both). Job: every 10 min, up to 8 events (unchecked first; blocked > 24 h; no-page shows every 2 days with a grounded finder; stale > 3 days), 45 s time box, 3 in parallel.

### 4.5 Dispatch
Claims rows atomically (`for update skip locked`), at most 5 instant alerts per user and channel per run (the rest roll into the digest), verifies any still-unchecked event before sending. Telegram "blocked the bot" unlinks the chat and re-queues by email. A failed poster image falls back to a text message with the same buttons. Digest at 09:00 IST: one `digest` alert row per (user,event); info alerts included whatever their age.

### 4.6 Crawler chain and kill switch
Order for pages a plain request cannot read: plain fetch → Firecrawl (while daily cap lasts; calls spaced 3.5 s, honour `Retry-After` on 429) → Scrape.do (plain request = 1 credit; `render=true` = 5 credits only when a listing comes back thin; HTML converted to markdown keeping links) → Jina (free). Budgets: Firecrawl 60/day (10 kept in reserve for verification), Scrape.do 900/month and 40/day, logged per call in `runs`. Each failure falls through silently. **Runtime pause switch**: `crawlersPaused()` reads `app_settings.crawlers_paused` (10 s in-process cache; DB error ⇒ not paused; env `CRAWLERS_PAUSED=1` forces it). When paused, Firecrawl, Scrape.do and Jina return "crawlers paused" without spending credits. Owner controls it from Telegram (`/crawlers pause|resume|status`).

### 4.7 Jobs and cron
Routes `POST /api/jobs/{news,process,dispatch,links,listings,sweep,digest}` and (new) `/api/jobs/{artist-news,calls}`; each: `maxDuration = 60`, `Authorization: Bearer CRON_SECRET` check with `timingSafeEqual`, `startRun`/`finishRun`, safe to call twice. `scripts/setup-cron.ts` creates/updates them on cron-job.org (timezone Asia/Kolkata, POST, 60 s timeout, retries on 429): news */15, process */5 (batch 6), dispatch */5, links */10, listings :00/:30, sweep :00/:30 at 06–10, digest 09:00, artist-news every 6 h, calls */5. Vercel cron: `GET /api/cron/heartbeat` daily 03:00 UTC (08:30 IST) → owner-only Telegram message (sources OK, new shows, alerts, Firecrawl/Scrape.do credits, link verification counts, anything red, refused Spotify connections with email) and an email copy to `OWNER_EMAIL` when email is on. `/api/health` is public and reports only real values (db latency, counts, per-source status, per-job last run, credits; per-user scan runs folded into one `scan-now` entry; no user ids).

---

## 5. Product surfaces (existing behaviour to reproduce)

### 5.1 Pages
`/` landing (live counters, a self-flipping example card, Google sign-in), `/demo` (owner's radar read-only, public, "Scan now" public 1 per 2 min globally and sends no alerts, System pulse), `/onboarding`, `/radar`, `/shows` (My shows: Going, Saved), `/calendar`, `/profile` (tabs Profile and Connections), `/connections`, `/event/[id]`, `/setup` (owner tools), `/settings` (redirects to Profile). **New**: `/artists`, `/artists/[id]`, `/merch`, `/merch/[id]`, `/cart`, `/plans`. The admin is **not** part of this app (section 8.3).
Signed-in shell: bottom tab bar on phones — **Radar, My shows, Calendar, Artists, Merch, Profile**.

### 5.2 Look
"Stub" direction: plum-black ink, lilac-cream paper, magenta highlight used sparingly, Big Shoulders Display (poster type) + Instrument Sans (body). Logo and display text slightly off-white (`--wordmark`) with "Row" in dusty orchid (`--wordmark-soft`). One fixed, dulled concert photo behind every screen (`components/shell/Backdrop.tsx`) crossfading per area; five photos in one purple/magenta/dusk family (Pexels, free licence), 2400 px, served via `next/image`; dark plum scrim + slight desaturation. All colours/radii as CSS variables.

### 5.3 Event card
One `EventCard` component (compact + full; the poster size is the OG route `/api/og/event`). Four auto-flipping faces (each card flips on its own beat while on screen; hover/tap takes over): (1) show — name, date, where — on plain plum; (2) artist photo (Spotify image, initials tile if none); (3) a concert photo with no text (artist's own `concertImage` if known, else one of two fixed stock photos); (4) tiers + sources on paper. Card borders/bands follow stage colour. States: announced with go-live countdown, early bird, on sale, sold out, rumour (dashed, no ticket button), festival lineup, sample (labelled "Sample"). Tier ladder lights the open tier, strikes sold-out, dims upcoming. Show times like `18:30:00+05:30` render as "6:30 pm". Actions: Going, Save (bookmark icon, magenta when saved), Not for me (dismiss), Add to calendar.
Ticket button rules: verified exact/ok link → "Get tickets"; otherwise "Ticket page not confirmed yet" and a "Details & sources" button to `/event/[id]` (lists every verified source). Cards show a verified link only.

### 5.4 Radar
"On sale now" first (viewer's own live shows, then up to six real live shows for artists they don't follow, each with "+ Follow", so nobody sees an empty section), then timeline (12 cards, "Show more"), artists panel (12, "Show all"), System pulse (dots: green OK, grey not run, amber late = 3× interval, red failing). "Scan now": signed-in 1 per 2 min per user, runs news for up to 40 artists, sends alerts.

### 5.5 Calendar and My shows
Calendar views: All shows, In my calendar, Going, Saved (**new views in item 4**). "Add to calendar" always writes the in-app `calendar_entries`; if Google is connected it also creates the Google event with a deterministic id (`fr` + sha256(user:event)[0..40]); pressing again removes from both. My shows holds Going and Saved ("Bought it" in Telegram counts as Going).

### 5.6 Telegram bot (webhook `/api/telegram/webhook`)
Check `X-Telegram-Bot-Api-Secret-Token`; always answer 200. Link flow: QR + deep link with `telegram_link_code`, live "waiting for Start", test alert (nearest real event, home city first, labelled Test; only with none, a stored sample labelled Sample), pause/resume, unlink. Linking queues and sends alerts for everything already found (up to 8 at once; dispatch sends the rest), and says so when nothing is announced yet.
Poster alert: image (OG route), caption (stage emoji, headline, artist · venue, date/time, reason line, sources), buttons: Get tickets or Details & sources, Calendar (`/api/ics/[id]`), 💬 Ticket info, ✅ Bought it, 🙅 Not for me. Commands: `/start <code>`, `/help`, `/new` (newest shows, last 7 days else latest few, each with Ticket info), `/tickets [artist]` (tiers, prices, on sale / sold out / not yet, the checked page; unchecked links are verified first), `/upcoming`, `/artists`, `/mute <artist>`, owner-only `/scan` and `/crawlers [pause|resume]` (status shows Firecrawl today x/60 and Scrape.do day/month). **New**: `/calls` (list and cancel voice reminders), `/wrong` button text "⚠️ Wrong link" (item 1).

### 5.7 Email
Plain HTML string templates (no React Email). HMAC-signed unsubscribe links (AUTH_SECRET), one-click POST too. Provider order: Brevo → Gmail API → Resend/SMTP. **Email is hidden from the product** (no card, logo or onboarding box) and switches on only when credentials exist; nothing user-facing mentions it.

### 5.8 Google sign-in
Scopes `openid email profile` plus `calendar.events` at sign-up (granular consent: the user may untick it), `access_type=offline`. App stays in **Testing mode** with judges listed as test users (max 100). Owner flag set on sign-in when email equals `OWNER_EMAIL`. Proxy (`proxy.ts`) does only an optimistic session-cookie check; every page and API route re-checks the session server-side. Delete account removes the user and everything that cascades; the owner can't delete from the UI.

---

## 6. Shared rules for every change below
- No new third-party spend. Anything paid or risky sits behind a feature flag and a "coming soon" UI so the product proceeds without it.
- Each change gets: a migration if needed, server code, UI, a test script or curl proof, a line in `DECISIONS.md`.
- Mobile first (375 px) — check every new screen on a phone width.

---

## 7. The 12 changes (owner's numbering)

### 1. Ticket links must open the exact booking page
**Problem**: some links in Telegram's ticket button/"Ticket info" land on the wrong page (another date, another city, a listing).
**Likely causes to check first**: `ok` status (page loads and is specific but artist name not found) is shown to people; listing/event-page links picked over the show's own deep link; Gemini-supplied URLs not tied to the show's city/date; redirects landing on a city/home page; verification done days ago but link since changed; one artist, many dates on one page.
**Build**:
- Tighten acceptance. A ticket link is *exact* only if the loaded page names the artist **and** matches this show's city **or** date (text or structured data such as JSON-LD `Event.startDate`/`location`). `ok` (name not found) is never used for the Telegram "Get tickets" button or dashboard ticket button; it may appear as a source link only.
- Prefer per-show deep links: take the event's own anchor from the listing chunk; known patterns to verify against live pages (do not trust blindly): BookMyShow `.../events/<slug>/ET0000xxxx`, District `district.in/events/<slug>...`, Insider `insider.in/<slug>/event`.
- Re-verify at dispatch time: before building a Telegram/email alert, re-check the link if `ticket_verified_at` is older than 24 h; on failure send the alert with "Details & sources" instead of a ticket button.
- Add a ⚠️ **Wrong link** button on alerts and a link on the event page: increments `ticket_report_count`, marks that URL `mismatch` for the event, re-queues verification with the finder, stops showing it immediately, and notes it in the owner heartbeat.
- `scripts/audit-links.ts`: list every shown ticket URL with status, final URL, matched city/date evidence; target 0 wrong in a 20-show manual sample (owner opens each). Report the pass rate.
- Acceptance: tapping "Get tickets" for 10 random live shows lands on that show's page for that city/date; wrong cases fall back to "Details & sources".

### 3. City priorities P1 / P2 + "All India" during onboarding
- Cities step becomes three groups: **P1 — alert me instantly** (pick up to 3), **P2 — also tell me** (pick up to 5), and a tick **"All India"**. City picker: the 12–15 major concert cities (Bengaluru, Mumbai, Delhi NCR, Hyderabad, Chennai, Kolkata, Pune, Ahmedabad, Goa, Jaipur, Chandigarh, Kochi, Lucknow, Indore, Guwahati) with search; show chips; selecting a city in P1 removes it from P2.
- Store `p1_cities`, `p2_cities`, `watch_all_india`; `home_city` = first P1 (keep column for compatibility).
- Urgency mapping (extend `computeUrgency`): P1 city + tickets open/imminent → red (needs verified ticket URL or 2 sources, else amber); P1 city otherwise → amber; P2 city → amber if tickets open or must-see artist, else info (digest); all-India tick, city in neither → info unless must-see (amber); not ticked and not in P1/P2 → null (never alert). City names normalized with the alias table (bangalore→bengaluru, bombay→mumbai, gurgaon→gurugram, noida/ncr→delhi, etc.).
- Editable in Profile later. Telegram `/cities` shows and edits them.
- Acceptance: a P1=Mumbai user gets an instant red for a live Mumbai show and nothing instant for a Chennai show unless All India is ticked (then digest only).

### 4. Search bars + calendar filters
- Radar: a search box filtering "my artists" and shows by artist name, city, venue (client filter over loaded data with debounce; server search for >100 artists).
- Calendar: same search box; filter chips: **All shows**, **In my calendar**, **Going**, **Saved**, and new **Live concerts of my favourite artists** (all upcoming shows for artists the user follows/must-sees; badge count), plus city chips (item 6). Filters combine (search + chip + city).
- Acceptance: typing "Prateek" on either page narrows to his shows within 200 ms; chips update counts.

### 5. Spotify connection failing
**Likely causes (check in this order)**: (a) Spotify development mode allowlists by **the exact email of the Spotify account** (name + email in Dashboard → Users and access) — a display name alone does not work, and the 25-user dev limit applies; (b) `SPOTIFY_REDIRECT_URI` must match the Dashboard **exactly** (scheme, host, path, no trailing slash) and must be re-added for the new Vercel domain; localhost must be `127.0.0.1`; (c) `sp_state` cookie lost (in-app browsers, cross-site cookie rules) → state mismatch; (d) wrong scopes (`user-follow-read user-top-read` only); (e) `/me` returns 403 for non-allowlisted users; (f) token-exchange error body ignored.
**Build**:
- Log the **status code and Spotify's error body** at each step (token exchange, `/me`, import) into `runs` (job `spotify-connect`, never the token) and show the owner in the heartbeat.
- Distinct user messages: "This Spotify account isn't on our test list yet — send us the email on that account" (403), "Link expired, try again" (state), "Spotify is slow, try again" (5xx/timeout) — each with a **Skip and paste artists instead** action.
- Cookie hardening: `sp_state` `httpOnly`, `secure`, `SameSite=Lax`, path `/`, 10 min; fall back to a signed state parameter verified server-side (HMAC with `AUTH_SECRET`, includes user id + expiry) so it works without the cookie.
- Redirect starts on the next frame; overlay clears on Back/pageshow; after 4 s stall offer "Open Spotify" / "Cancel". Animation (stub, streaming perforated line, Spotify mark) plays while the browser loads.
- Owner page `/setup` shows a Spotify diagnostics panel: configured redirect URI vs the current host, number of connections, last 10 refused attempts.
- Longer term, document in `DECISIONS.md` that production needs Spotify **extended quota** (not available to this free build); search/paste cover everyone meanwhile. Playlists cannot be a no-login route (dev mode refuses playlist contents with 403).
- Acceptance: an allowlisted account completes connect → import (owner's account yields ~51 artists merging long/medium/short term) and lands with the correct count; a non-listed account gets the clear message and the skip path.

### 6. City tags on the dashboard
- Under the radar header: horizontally scrolling city chips with counts (e.g. "Mumbai 7"), P1 cities first, then P2, then others by count, plus "All". Tap filters radar timeline, On sale now and My shows; chip state in the URL (`?city=mumbai`). Every card also carries a city tag chip. Use `normalizeCity`/`displayCity`.
- Acceptance: choosing "Delhi" shows only Delhi-NCR shows (Gurugram/Noida normalize to Delhi where the alias table says so).

### 7. Sign-up / plans flow with Pine Labs payments (stubbed until ready)
- New `/plans` page and a **"Choose your plan"** step after onboarding (skippable, "Continue free"). Plans in code config: Free (current features) and Plus (placeholder: voice calls, more instant alerts, merch perks — owner will confirm copy and price; price is a config value, default ₹0 and hidden while `PAYMENTS_ENABLED=false`).
- Flag `PAYMENTS_ENABLED=false`: the Plus button shows "Coming soon — join the waitlist" (stores intent in `subscriptions` with status `pending`, no money moves). **The whole product works with nothing paid.** No feature is gated while the flag is false.
- Build the real flow behind the flag, but do not enable it: server creates an order via the Pine Labs Online (Plural) API (UAT first) using `PINELABS_*`, redirects to the hosted checkout, handles the return page, and a **webhook** `/api/payments/pinelabs/webhook` that verifies the signature with `PINELABS_WEBHOOK_SECRET`, is idempotent via `payment_events.event_id`, then flips `subscriptions.status` and `users.plan`. Never store card data. Confirm endpoints, signing and field names against Pine Labs' current docs and test in UAT before coding; record the findings in `DECISIONS.md`.
- Billing section in Profile: current plan, status, "Manage" (disabled while flag off).
- Acceptance: with the flag off, the plans page renders, "Continue free" works, no network call to Pine Labs occurs; with a UAT key and the flag on, a test order completes and the webhook upgrades the plan.

### 8. Voice reminder calls (Voibz + ElevenLabs), with a "Call me" list on the radar
- Concept: a fan chooses a **core list** (default their Top 5 must-see artists, editable) to be **phoned** when tickets launch; the call states the artist, city, date and the ticket go-live time, and offers to repeat or send the Telegram link.
- UI: on Radar, a **"Call me" section** (list of artists with a phone toggle, count "3 of 5", add/remove) with the user's phone number (E.164, India +91 default), an explicit **consent checkbox** (stores `phone_consent_at`), call lead time (15 min / 1 h / 1 day before go-live) and quiet hours (no calls outside 09:00–21:00 IST; shift to the nearest window). Also on `/artists/[id]` ("Call me when tickets drop"). Telegram `/calls` lists/cancels.
- Data: `call_reminders` rows are created when a show for a call-me artist has a known `sale_opens_at` (or status `sale_soon`), `scheduled_for` = `sale_opens_at` − lead (clamped to the quiet-hours window). Updated if `sale_opens_at` changes; cancelled if the show is cancelled/dismissed.
- Job `/api/jobs/calls` every 5 min picks due rows (`for update skip locked`), places an outbound call through **Voibz** (telephony) bridged to an **ElevenLabs Conversational AI agent** (`ELEVENLABS_AGENT_ID`) with dynamic variables (first name, artist, city, date, go-live time). Max 3 attempts (e.g. 0, +10 min, +30 min), never twice for the same (user, event), never after the go-live time has passed by > 1 h; record `provider_call_id` and outcome (answered, no_answer, voicemail, failed) from a provider webhook `/api/calls/webhook` (signed, idempotent).
- Safety: flag `VOICE_CALLS_ENABLED=false` by default → UI shows the list and consent but "Voice calls switch on soon", no calls placed. Respect Indian telecom consent/DND rules: calls only to users who opted in, easy opt-out ("press 9" / reply STOP in Telegram / toggle). Phone numbers are PII: encrypt at rest if feasible, never log, delete with the account.
- The provider name was written "voibz": **confirm the exact provider and API with the owner before coding**; test one call to the owner's own number first.
- Acceptance: with the flag on and the owner's number, a scheduled reminder places one call at the right minute with correct details; the radar section reflects status (scheduled / done / no answer).

### 9. Don't show artists who have died (and check this everywhere)
- Detect with plain code, not AI guesses: MusicBrainz `type = Person` with `life-span.ended = true` (or Wikidata P570) ⇒ `is_deceased = true`, `inactive_reason = 'deceased'`. For groups, `ended = true` means disbanded ⇒ `inactive_reason = 'disbanded'` (hide as inactive too). A band where a *member* died is **not** hidden. Hologram/tribute/"in memory" events are already dropped by the tribute flag; keep it.
- Enforce in every path: suggested artists, search results (show nothing or a gentle "no longer touring"), Spotify import, paste resolution, "Touring India now", radar/timeline, news step, grounded sweep (don't query them), matching (`loadWatched` excludes them), alerts and digests, merch store, Your artists page.
- Backfill script `scripts/check-deceased.ts` for every artist already in the DB (rate-limited, MusicBrainz 1 req/s), and run it from the daily job for artists with `deceased_checked_at` older than 30 days. List what it hid in the owner heartbeat so a wrong hide can be reversed (`/setup` override toggle).
- Acceptance: an obviously deceased solo artist (e.g. a legend that appears in Spotify suggestions) never appears in suggestions, search, radar or alerts, and a living band is untouched.

### 10. Add to Google Calendar not working
**Likely causes**: Google Calendar API not enabled in the Cloud project; calendar scope not granted (granular consent unticked) or not stored on the `accounts` row (Auth.js only stores tokens on first link); Testing-mode refresh tokens expire after **7 days**; redirect URI for the new domain missing; access token expired and refresh failing silently; real error swallowed as a generic toast; users added after the consent screen was created are not test users.
**Build**:
- Enable the API; log status + Google's error body for every calendar call (into `runs`, job `gcal`). Return specific reasons to the UI: not connected, token expired ("Reconnect Google Calendar"), API error with a retry.
- Keep the second-consent flow (`/api/gcal/connect`, `prompt=consent`, `access_type=offline`, scope `calendar.events` only) and a signIn-event step that writes the fresh tokens/scope onto the existing account row; verify by reading the row back in a test script.
- **Always-works fallbacks** (no OAuth): (1) the in-app calendar entry; (2) an `.ics` download `/api/ics/[id]`; (3) an "Add to Google Calendar" **template link** `https://calendar.google.com/calendar/render?action=TEMPLATE&text=…&dates=…&location=…&details=…` opened in a new tab. The button tries the API first and silently offers the template link if the API path fails, never a dead end.
- Events: all-day when no time, else timed in `Asia/Kolkata` (default 3 h); deterministic id so repeats never duplicate; remove deletes both.
- Acceptance: a freshly consented test user adds a show and sees it in Google Calendar; a user without consent gets the template link; reconnecting after token expiry works.

### 11. Onboarding artist suggestions: side-scroll, easy to select
- Suggestions ("Touring India now" and suggested artists) become a **horizontal snap-scroll carousel** (`scroll-snap-type: x mandatory`, ~140–160 px cards, momentum scrolling, hidden scrollbar, edge fade, left/right arrows on desktop). Big artist photos, whole card tappable, clear selected state (magenta ring + tick), live count, "Select all visible". Rows by theme (Touring India now, Popular with fans, Your Spotify) where data exists. Selected artists appear immediately in an "Added" strip.
- Never show deceased/inactive artists (item 9).
- Acceptance: on a 375 px screen a user selects 5 artists with 5 taps and one swipe; no pinch/zoom needed.

### 12. Remove the "Searching now" page after selection
- After the last onboarding step (Artists → Cities → Alerts), go **straight to `/radar`**. The first scan still starts in the background as soon as artists arrive (Spotify import, re-import, or a pasted list of 3+), once per user (`first_scan_at`), within the 60 s function limit (50 s on the welcome path, 34 s behind Spotify import; unfinished work stays queued). On the radar show a slim, dismissible banner "Finding your shows… we'll message you the moment one lands" with a count that updates; no blocking page, no `/welcome` step (keep the route redirecting to `/radar`).
- Linking Telegram still queues and sends the alerts for everything found.
- "Confirm artists and continue" button is also pinned at the top while scrolling, shows the artist count, and stays disabled while any "Which one?" choice is unresolved.
- Acceptance: from the last click to a visible radar takes < 2 s, and results appear without a spinner page.

---

## 8. New pages

### 8.1 Your artists (`/artists`, `/artists/[id]`)
- `/artists`: grid/list of the user's followed artists with photo, priority chip (must-see / follow / muted), upcoming-show count, city tags, search box (item 4), add-artist button, "Call me" toggle (item 8). Tap → artist page.
- `/artists/[id]` sections: header (photo, name, genres, origin, priority control, Mute/Unmute, Call me toggle); **Upcoming India shows** (event cards); **Latest news** (below); **Merch** rail (below); "Last India show" line.
- **Latest news**: table `artist_news`; job `/api/jobs/artist-news` every 6 h refreshes Google News RSS (query: `"<artist>"` + recent), up to 6 per artist for followed artists; publisher article URL decoded; dedupe by URL; hide items older than 60 days; page also lazily refreshes if the newest item is > 6 h old (limit 1 refresh/artist/6 h). Show headline, publisher, relative time, link out (new tab). Never summarize with AI unless asked; no scraped full text.
- **Merch rail**: products where `artist_id` matches (demo items for a couple of artists), with price and "View" → `/merch/[id]`; an "Official merch coming soon" note when none. Mark demo items "Demo".
- Acceptance: opening a demo artist shows news (≥ 3 items), upcoming shows, and 2+ merch items.

### 8.2 Merch store (`/merch`, `/merch/[id]`, `/cart`)
- Grid of products with filters: **Artist** (multi-select with search), **Price** (range slider with min/max in ₹), **Size** (S, M, L, XL, Free size), plus sort (price, newest) and a result count; filters live in the URL (`?artist=…&min=…&max=…&size=…`). Product page: gallery, price, size selector (disabled sizes out of stock), add to cart, artist link back to their page.
- Cart persists (`cart_items`, local for signed-out). **Checkout is stubbed**: while `PAYMENTS_ENABLED=false` the cart shows "Checkout opens soon — we'll message you" and records interest; when enabled, reuse the Pine Labs order flow from item 7 (new order type `merch`, shipping address form deferred). Label everything "Demo store".
- **Mock data**: the owner will supply it separately. Define `data/merch.json` and a `scripts/seed-merch.ts` that validates it with Zod and upserts. Shape:
```json
{ "products": [ { "id": "string", "artist": "Artist name (matched to artists.normalized_name; create a stub artist row if missing)",
  "name": "string", "description": "string", "image": "https://… or /public path", "priceInr": 1499,
  "category": "tee|hoodie|poster|accessory", "sizes": ["S","M","L","XL"], "stock": {"S":10,"M":10,"L":5,"XL":0} } ] }
```
  Until the file arrives, seed 6 placeholder products for two artists so the UI can be built and tested; remove them when the real file is seeded (idempotent by `id`).
- Acceptance: filters by artist + price + size return the correct products; cart add/remove works; checkout button shows the stubbed state.

### 8.3 Admin dashboard — a separate website (owner only)
Purpose: let the owner see how many people use FrontRow, what they do, and whether the system is healthy, without opening the database.
- **Separate site, same data**: the admin is its **own Next.js 16.4 app, deployed on Replit** (its own Repl and Replit Deployment, with its own URL, e.g. `<name>.replit.app` or a custom domain), while the main app stays on Vercel, not a route inside the public app. It connects to the **same Neon database and the same credentials/env values** as the main app, so it reads live data with no sync. Nothing in the public app links to it, and the public app has no `/admin` route.
- **Repo layout**: Replit has no Vercel-style "root directory" setting, so the simplest layout is **two repos**: the product repo, and a small admin repo imported into Replit. The admin keeps a **copy of the Drizzle schema file** (`schema.ts`, read-only use, no migrations) with a `scripts/check-schema.ts` that compares it to the product's schema and fails when they diverge. (If the owner prefers a monorepo with `apps/web`, `apps/admin`, `packages/db`, set the Replit run/build commands to `npm --workspace apps/admin run build|start` and deploy from the repo root.) Only the product repo runs migrations; the admin never changes the schema.
- **Replit setup**: Node 20+ module; `.replit` with run `npm run dev -- -H 0.0.0.0 -p 3000` mapped to external port 80 for the workspace; **Deployment** build `npm install && npm run build`, run `npm run start -- -H 0.0.0.0 -p $PORT` (use the port Replit provides). Secrets go in **Replit Secrets** (never in the repo or `.replit`). Set `AUTH_TRUST_HOST=true` and `AUTH_URL=https://<replit-domain>` (Auth.js sits behind Replit's proxy). Add `https://<replit-domain>/api/auth/callback/google` to the Google OAuth client (and the custom domain if used). Use the Deployment URL for OAuth, not the dev-workspace URL, because the workspace URL changes. Replit outbound IPs are not stable, so do not use an IP allowlist on Neon for it (use the limited DB role and a strong password instead) and treat `ADMIN_ALLOWED_IPS` as unavailable there. Use the Deployment type that keeps cold starts short (Autoscale is fine for an owner-only page; note that Replit Deployments consume Replit credits and are not free — tell the owner the cost before publishing). Keep `next build` memory small (no heavy image processing).
- **Admin env vars**: `DATABASE_URL` (prefer a dedicated Postgres role: read on every table, write only on `app_settings` and `users.disabled_at`, `artists.is_deceased/inactive_reason` override; if the owner prefers to reuse the main URL, note the risk in `DECISIONS.md`), `AUTH_SECRET` (a different value from the main app), `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` (same Google client is fine; add `https://<admin-domain>/api/auth/callback/google` as a second redirect URI), `OWNER_EMAIL`, `MAIN_APP_URL`, `ADMIN_API_SECRET` (shared with the main app for the few actions that must run its code), `TELEGRAM_BOT_TOKEN` is **not** needed here.
- **Access**: Google sign-in on the admin site with **JWT sessions** (no dependency on the main app's session table), allowing only the email equal to `OWNER_EMAIL` (case-insensitive, email verified); anyone else is signed out and sees a plain 404. Check on the server in every page and `/api/*` route and in `proxy.ts`. Set `noindex` (`X-Robots-Tag`, robots.txt disallow), strict cookies (`httpOnly`, `secure`, `SameSite=Lax`), and a 12-hour session. Optional second factor: an `ADMIN_ALLOWED_IPS` allowlist when hosting allows it (not on Replit). Read-only except the explicit actions below. Never show tokens, refresh tokens, Telegram link codes or full phone numbers (mask to `+91 ••••• ••123`). Emails are visible to the owner only.
- **Activity tracking**: instrument with `track()` — `signup`, `login`, `onboarding_step` (step number), `onboarding_done`, `spotify_connect_ok|fail` (status code only), `artists_added` (count, via), `telegram_linked|unlinked`, `alert_sent` (urgency, channel), `alert_action` (going|saved|dismissed|bought|wrong_link), `ticket_click` (see below), `calendar_add` (in_app|google|ics|template), `search_used`, `city_filter_used`, `artist_page_viewed`, `merch_viewed|cart_add|checkout_interest`, `plan_interest`, `call_optin|call_placed|call_outcome`, `scan_now`. Page views are not tracked beyond `artist_page_viewed` and `merch_viewed`; no third-party analytics scripts. Keep events 180 days (daily cleanup in the heartbeat job).
- **Ticket click tracking** (optional, behind a flag `TRACK_TICKET_CLICKS`, default on): alert and card ticket buttons point at `/go/[alertOrEventId]`, which re-checks the verified link, logs `ticket_click` and 302-redirects to the verified URL. If the link is not verified it redirects to `/event/[id]` instead. This must never add a wrong destination.
- **Overview cards** (with 7-day sparkline each): total users; new users (today / 7 d / 30 d); **DAU / WAU / MAU** (from `last_seen_at` + `activity_events`); Telegram linked (count and %); Spotify connected (count and %); average artists per user; onboarding completion %; users with ≥ 1 live show on their radar.
- **Funnel**: signed in → artists added → cities chosen → Telegram linked → first alert received → first ticket click, with counts and drop-off %, filterable by date range (7 / 30 / 90 days).
- **Engagement**: alerts sent per day (red / amber / info, Telegram / email); alert actions split (Going, Saved, Not for me, Bought it, Wrong link); ticket clicks per day and click-through rate; top 20 followed artists; top cities by P1 / P2 selections; shows by city; search and filter usage.
- **Users table**: search (name/email), filters (plan, Telegram linked, Spotify connected, onboarded, last seen window, disabled), sortable columns (joined, last seen, artists, alerts received), paginated 25/page. Row drill-down: profile, cities (P1/P2/all-India), channels, artists (count + list), last 20 activity events, last 10 alerts, calls opted in, plan.
- **System health panel** (reuses `/api/health` data): per-source status dots, last run per job, errors in the last 24 h, link status distribution (`exact/ok/generic/broken/blocked/mismatch/none` with counts), crawler credits (Firecrawl today x/60, Scrape.do day/month), **crawlers paused/running with a toggle** (same switch as Telegram `/crawlers`), refused Spotify attempts (last 10, with email), Google Calendar failures (last 10), Gemini errors/quota status.
- **Business panel**: plan counts (free, Plus waitlist/pending/active), checkout-interest and merch cart counts, call reminders (scheduled / done / no answer / failed), deceased/inactive artists hidden (with a per-artist "unhide" override).
- **Owner actions** (each logs an `activity_events` row of type `admin_action` with who/what). Simple writes (pause/resume crawlers = `app_settings`, disable account, unhide artist) go straight to the database through the limited role; actions that need the product's code (send a test alert, re-run a first scan) call the main app's `POST /api/internal/admin/*` routes, which check `Authorization: Bearer ADMIN_API_SECRET` with `timingSafeEqual` and are not linked anywhere. Actions: pause or resume crawlers; send a test alert to a user; re-run the first scan for a user; disable or re-enable an account (disabled users cannot sign in and receive no alerts; never delete from here); unhide an artist; export CSV of the users table and of activity (owner only, emails included, download not stored).
- **Telegram** (stays in the main app, which owns the bot): owner-only `/stats` replies with the key numbers (users, new 7 d, DAU, linked %, alerts today, pipeline red flags); the 08:30 heartbeat adds "new users yesterday" and "active users yesterday".
- **Performance**: all numbers come from SQL aggregates (no per-row loops), cached for 60 s in memory; the page loads in < 2 s with 1,000 users and 100k events; no unbounded queries (always a date range and limit).
- **Acceptance**: with two or more test accounts, counts match the database (checked with a SQL query); the main site has no `/admin` route; on the admin site a non-owner Google account gets 404 and no data; the limited DB role cannot write other tables (try it); the admin builds and deploys on Replit independently of the main app (Deployment URL loads, Google sign-in works from that URL, secrets come only from Replit Secrets); toggling crawlers from the dashboard and from Telegram change the same `app_settings` row; the CSV export contains no tokens; masked phone numbers never show in full.

---

## 9. Build phases and gates

| Phase | Build | Gate (show evidence) |
|---|---|---|
| 0 | Scaffold, Drizzle schema + migrations (incl. `app_settings`), Auth.js Google, `proxy.ts`, `/api/health`, landing, deploy to Vercel | Sign in works; `/api/health` ok on the live URL; owner flag set |
| 1 | Identity: Spotify search/import, MusicBrainz enrichment, resolution rules, review tray, deceased filter (item 9), onboarding artists step with carousel (item 11) | Live API checks logged in `DECISIONS.md`; owner's import returns ~51; deceased artist hidden |
| 2 | Collectors, extract, match, dedupe, urgency (P1/P2, item 3), decide | `scripts/accept-phase2.ts` passes; real sourced shows in DB |
| 3 | Telegram bot, dispatch, digest, email (hidden), cities/alerts onboarding, direct-to-radar flow (item 12) | Real alert in Telegram with all buttons; first-run < 60 s |
| 4 | UI: stub design, flip card, radar, My shows, calendar (item 4 filters, city tags item 6), profile/connections, calendar add (item 10), `/demo` | Screens verified at 375 px and desktop |
| 5 | Link verification (item 1), crawler chain + kill switch + `/crawlers`, cron setup, heartbeat, Spotify hardening (item 5) | `audit-links.ts` report; crawler chain tested by breaking each provider in turn; refused Spotify attempt appears in the heartbeat |
| 6 | New: Your artists + news (8.1), Merch (8.2), plans/Pine Labs stub (item 7), call-me UI + flag (item 8), activity tracking in the main app (wired through the earlier phases); then the **separate admin site (8.3)**, deployed on Replit | Each acceptance line above demonstrated; admin counts verified against SQL |
| 7 | Hardening: three-account test, `/demo` recording, `viva/` notes (brief vs build, components map, Nine Checks, "something broke" drills) | Second Google account runs the whole flow; nothing hard-coded to the owner |

Seed the owner's radar with `scripts/seed-owner-radar.ts`: a grounded Gemini query finds artists with announced India shows, resolves them through Spotify, sets them must-see for the owner, then sweeps and processes. Everything stored must carry real source URLs.

---

## 10. Verification checklist (run before calling it done)
- [ ] `npx tsc --noEmit` and `npm run build` clean; `npm run lint` clean.
- [ ] Every job route returns 401 without the secret; calling any job twice does nothing new.
- [ ] `/api/health` reports real values only; no secrets or user ids.
- [ ] Alerts: P1/P2/All-India behave per item 3; deceased artists never alerted.
- [ ] Links: audit shows 0 wrong links in a 20-show sample; Wrong-link button works.
- [ ] Spotify: allowlisted account OK; non-listed gets the clear path; diagnostics visible to owner.
- [ ] Calendar: API path, template-link fallback and `.ics` all work.
- [ ] `/crawlers pause` stops credit use (check `runs` credits stay flat); `/crawlers resume` restores it.
- [ ] Admin site: deployed on Replit (not Vercel), Deployment URL works, secrets only in Replit Secrets; 404 for non-owners; counts match SQL; limited DB role verified; `noindex`; no tokens, full phone numbers or secrets in the UI or CSV.
- [ ] Flags default off: `PAYMENTS_ENABLED=false`, `VOICE_CALLS_ENABLED=false`; nothing paid or calling happens.
- [ ] 375 px layout for every new screen; no horizontal page scroll except the intentional carousels.
- [ ] `DECISIONS.md` updated; `README.md` has setup + cron instructions.

## 11. Open questions to ask the owner at the start
1. Reuse the old Neon database or create a fresh one?
2. Item 2 was missing from the list — anything intended there?
3. Confirm the voice provider name and API ("Voibz") and whether the ElevenLabs agent already exists.
4. Plus plan name, price and what it unlocks (or leave placeholder).
5. P1/P2 limits (default 3 and 5) and the city list.
6. Where the real merch mock data file will come from and for which artists.
7. Admin site on Replit: two repos (preferred) or monorepo; its domain; whether to create a dedicated limited Postgres role; and confirm the owner accepts Replit Deployment credit cost.
