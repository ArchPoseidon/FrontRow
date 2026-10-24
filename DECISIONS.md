# DECISIONS

One line per choice that deviates from BUILD_PROMPT.md, per discovered third-party limit, and per live test.

- 2026-10-24: Rebuild lives in `frontrow-v2/`, separate from the old `frontrow/` project (owner's choice). Fresh Neon database (owner's choice).
- 2026-10-24: Item 2 was missing from the owner's list; owner chose to do all 12 changes before the new pages.
- 2026-10-24: Next 16.4.3 (latest), React 19.3.0, `cacheComponents` + `partialPrefetching` on.
- 2026-10-24: With `cacheComponents` on, any page reading the session/DB must render that part inside `<Suspense>` (sync page shell + async inner component). Build fails otherwise ("uncached or runtime data during prerendering").
- 2026-10-24: New Firecrawl key supplied by owner; credit budget on the new plan to be re-checked in Phase 5.
- 2026-10-24: Vercel project `frontrow-v2` (team skyrus), prod URL https://frontrow-v2-nine.vercel.app (the -skyrus alias sits behind Vercel SSO). Code on GitHub ArchPoseidon/FrontRow branch `v2` (main keeps the old app). Deployed via CLI, not yet git-connected.
- 2026-10-24 live test: Spotify client-credentials token works (200); `/search?type=artist&limit=5` works with the app token and returns images. MusicBrainz artist search returns `type`, `country`, `aliases` and `life-span.ended` in the same response (one call per artist): Michael Jackson => Person, ended=true (deceased); Linkin Park => Group, ended=null (active); Prateek Kuhad => Person, IN.
- Deceased rule in code: `type=Person && ended=true` => `is_deceased`; `type=Group && ended=true` => `inactive_reason='disbanded'`. Every artist query filters both.
- Caching plan: shared data (suggestions, artist news, merch lists, landing counters) uses `use cache` + `cacheLife` + `cacheTag`, invalidated with `revalidateTag` on writes; per-user pages are static shells with Suspense, so first paint is instant.
