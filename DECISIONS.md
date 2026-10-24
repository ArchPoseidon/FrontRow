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

## Pine Labs / plans / merch (item 7, 8.2)
- 2026-10-24 Pine Labs docs (pinelabs.com/docs/online-payments, read via search/fetch, no live test): UAT base `https://pluraluat.v2.pinepg.in`; token `POST /api/auth/v1/token` body `{client_id, client_secret, grant_type:"client_credentials"}` with headers `Request-ID` (unique) and `Request-Timestamp` (ISO 8601).
- Order: `POST /api/checkout/v1/orders` with `Authorization: Bearer <token>`, body `merchant_order_reference`, `order_amount{value,currency}`, `integration_mode:"REDIRECT"`, `callback_url`, `failure_callback_url`, `purchase_details{customer,cart_details}`; response should carry `redirect_url` to send the customer to.
- Webhook signature (docs): headers `webhook-id`, `webhook-timestamp` (unix seconds), `webhook-signature` (`v1,<base64>`); HMAC-SHA256 over `id.timestamp.rawBody`, key = base64-decoded secret from the Pine Labs dashboard. Implemented with `timingSafeEqual` and a 5 minute timestamp window.
- UNVERIFIED: production base URL (code uses `https://api.pluralpay.in`, a guess; the docs PROD tab was not readable). Confirm with Pine Labs onboarding.
- UNVERIFIED: whether `order_amount.value` is in paise (assumed yes, code sends rupees x 100) and the exact order-creation response shape (code reads `redirect_url`/`checkout_url` and `order_id` at top level or under `data`).
- UNVERIFIED: webhook body field names (code looks for `event_type`, `data.status`, `data.order_id`, `data.merchant_order_reference`) and which statuses mean paid (matches PROCESSED|AUTHORIZED|CAPTURED|PAID|SUCCESS) or failed (FAIL|CANCEL). Check against a real UAT webhook before enabling.
- UNVERIFIED: the docs show two different checkout-return signature schemes (order_id + status vs order_id, payment_status, error_code, error_message + secret). The return page does not trust the query string; only the webhook changes plan.
- Webhook idempotency uses the `webhook-id` header (same on resend) as `payment_events.event_id`; if processing throws, the event row is removed so Pine Labs' retry is processed. Route returns 404 while `PAYMENTS_ENABLED` is not `true`.
- Merchant order references: `s_<subscription uuid, no dashes>` for Plus, `m_<user id no dashes>_<base36 time>` for merch; length/charset limits on `merchant_order_reference` are unverified.
- `PINELABS_MERCHANT_ID` is required by our code but the docs reviewed do not use it in the token/order calls; kept as a sanity check only.
- Plus price comes from env `PLUS_PRICE_INR` (default 0, hidden while payments are off); with the flag on and price 0 the Plus button reports "Plus isn't priced yet".
- No orders table exists, so merch orders are not persisted: a paid merch webhook only clears that user's cart. Shipping address form and order records deferred.
- `proxy.ts` lists /merch, /cart, /plans as protected, so signed-out visitors never reach them; the localStorage cart path exists but only runs if those are made public.
- Merch placeholder images are SVGs in `public/merch/`; a product's `image` may be a string or array, stored joined with `|` in `merch_products.image_url`. Anuv Jain had no artist row at first seed, so `seed-merch` creates a stub row when missing.
