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
