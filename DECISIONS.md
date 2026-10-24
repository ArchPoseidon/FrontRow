# DECISIONS

One line per choice that deviates from BUILD_PROMPT.md, per discovered third-party limit, and per live test.

- 2026-10-24: Rebuild lives in `frontrow-v2/`, separate from the old `frontrow/` project (owner's choice). Fresh Neon database (owner's choice).
- 2026-10-24: Item 2 was missing from the owner's list; owner chose to do all 12 changes before the new pages.
- 2026-10-24: Next 16.4.3 (latest), React 19.3.0, `cacheComponents` + `partialPrefetching` on.
- 2026-10-24: With `cacheComponents` on, any page reading the session/DB must render that part inside `<Suspense>` (sync page shell + async inner component). Build fails otherwise ("uncached or runtime data during prerendering").
- 2026-10-24: New Firecrawl key supplied by owner; credit budget on the new plan to be re-checked in Phase 5.
- 2026-10-24: Vercel project `frontrow-v2` (team skyrus), prod URL https://frontrow-v2-nine.vercel.app (the -skyrus alias sits behind Vercel SSO). Code on GitHub ArchPoseidon/FrontRow branch `v2` (main keeps the old app). Deployed via CLI, not yet git-connected.
