# Decisions

- App named FrontRow (brief title was ShowRadar); tagline "Be the first to know about a show."
- Project lives in `Mesa Ai/frontrow`, its own git repo, separate from the other projects in that folder.
- Next.js 16.4: `middleware.ts` is now `proxy.ts` (Node runtime). Proxy does only an optimistic session-cookie check; every page and API route re-checks the session server-side.
- Next 16 scaffold enables `cacheComponents`, so route segment config like `export const dynamic` is not allowed; route handlers are dynamic by default.
- Drizzle uses the `neon-http` driver via `@neondatabase/serverless`: one lightweight client per call, no pool to leak.
- `pg_trgm` is enabled at the top of the first migration (`drizzle/0000_init.sql`).
- Auth.js v5 with database sessions; only `openid email profile` scopes. Owner flag is set on sign-in when the email equals `OWNER_EMAIL`.
- Dark mode by default; light via `data-theme="light"`. All colours/radii live in CSS variables in `app/globals.css`.
- `/api/health` is public and reports only real values; per-job runs and Firecrawl credits are empty until those jobs exist.
- Secrets live in `.env.local` (gitignored) and in Vercel env vars; `.env.example` lists names only.
- shadcn/ui is deferred until the first component that needs it (Phase 1+), to keep Phase 0 minimal.
- Production URL: https://frontrow-pi-three.vercel.app (Vercel alias, stable). Deployed from CLI for now; GitHub link to be added so pushes to main deploy.
