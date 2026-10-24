import { config } from "dotenv";
config({ path: ".env.local" });
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";

// Throwaway rows only (emails @frontrow.test, artists "ZZ Test ..."); everything created here is removed at the end.
async function main() {
  const realFetch = globalThis.fetch;
  let providerFetches = 0;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    if (/voibz|elevenlabs/i.test(url)) { providerFetches++; throw new Error("provider call blocked in test"); }
    return realFetch(input, init); // DB (Neon) goes over fetch
  }) as typeof fetch;
  process.env.CRON_SECRET = "test-cron-secret";
  process.env.CALLS_WEBHOOK_SECRET = "test-webhook-secret";
  delete process.env.VOICE_CALLS_ENABLED;

  const { getDb, artists, users, userArtists, events, artistNews, callReminders, alerts, activityEvents } = await import("../lib/db");
  const { and, eq, inArray, like } = await import("drizzle-orm");
  const { getFollowedArtists, getArtistPage } = await import("../lib/artists/queries");
  const { refreshArtistNews, parseFeedItems } = await import("../lib/news/artist-news");
  const { clampToCallWindow, inCallWindow } = await import("../lib/calls/window");
  const { reminderTime, scheduleForEvent } = await import("../lib/calls/schedule");
  const { savePhone, setCallMe, optOut } = await import("../lib/calls/store");
  const { normalizePhone, maskPhone } = await import("../lib/calls/phone");
  const { runCallsJob } = await import("../lib/calls/job");
  const { applyWebhook, signatureValid } = await import("../lib/calls/webhook");
  const db = getDb();
  const tag = randomUUID().slice(0, 8);
  const ist = (iso: string) => new Date(`${iso}+05:30`);
  const ok = (m: string) => console.log("ok -", m);

  // ---- pure: window + phone ----
  assert.equal(clampToCallWindow(ist("2030-01-10T12:00:00")).toISOString(), ist("2030-01-10T12:00:00").toISOString());
  assert.equal(clampToCallWindow(ist("2030-01-10T03:00:00")).toISOString(), ist("2030-01-09T21:00:00").toISOString()); // 3am: 6h from 21:00, 6h from 09:00 -> tie goes earlier
  assert.equal(clampToCallWindow(ist("2030-01-10T07:00:00")).toISOString(), ist("2030-01-10T09:00:00").toISOString());
  assert.equal(clampToCallWindow(ist("2030-01-10T22:00:00")).toISOString(), ist("2030-01-10T21:00:00").toISOString());
  assert.equal(clampToCallWindow(ist("2030-01-10T08:15:00"), ist("2030-01-10T08:30:00")).toISOString(), ist("2030-01-09T21:00:00").toISOString()); // 09:00 would be after go-live
  assert.equal(reminderTime(ist("2030-01-10T09:30:00"), 60, ist("2030-01-01T10:00:00")).toISOString(), ist("2030-01-10T09:00:00").toISOString());
  assert.equal(reminderTime(ist("2030-01-10T14:00:00"), 1440, ist("2030-01-01T10:00:00")).toISOString(), ist("2030-01-09T14:00:00").toISOString());
  assert.equal(normalizePhone("98765 43210"), "+919876543210");
  assert.equal(normalizePhone("+44 7911 123456"), "+447911123456");
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone("+915555555555"), null); // Indian mobiles start 6-9
  assert.equal(maskPhone("+919876543210"), "+91 •••••••210");
  ok("window clamp, phone validation, masking");

  // ---- fixtures ----
  const mkUser = async (n: string, phone: boolean, consent: boolean) => {
    const [u] = await db.insert(users).values({ name: `Tester ${n}`, email: `artists-${tag}-${n}@frontrow.test`, phoneE164: phone ? "+919876543210" : null, phoneConsentAt: consent ? new Date() : null }).returning();
    return u;
  };
  const u1 = await mkUser("one", true, true);
  const u2 = await mkUser("two", true, false);
  const mkArtist = async (name: string, extra: Partial<typeof artists.$inferInsert> = {}) =>
    (await db.insert(artists).values({ name, normalizedName: name.toLowerCase(), ...extra }).returning())[0];
  const a = await mkArtist(`ZZ Test Visible ${tag}`);
  const dead = await mkArtist(`ZZ Test Dead ${tag}`, { isDeceased: true });
  const gone = await mkArtist(`ZZ Test Disbanded ${tag}`, { inactiveReason: "disbanded" });
  const createdUsers = [u1.id, u2.id];
  const createdArtists = [a.id, dead.id, gone.id];
  const mkEvent = async (artistId: string, k: string, over: Partial<typeof events.$inferInsert>) =>
    (await db.insert(events).values({ artistId, title: `ZZ ${k}`, city: "Bengaluru", eventDate: "2031-03-20", dedupeKey: `zz-${tag}-${k}`, ...over }).returning())[0];
  try {
    await db.insert(userArtists).values([
      { userId: u1.id, artistId: a.id, priority: "must_see" },
      { userId: u1.id, artistId: dead.id },
      { userId: u1.id, artistId: gone.id },
      { userId: u2.id, artistId: a.id },
    ]);

    // ---- hidden artists ----
    const followed = await getFollowedArtists(db, u1.id);
    assert.deepEqual(followed.filter((f) => f.name.startsWith("ZZ Test")).map((f) => f.id), [a.id]);
    assert.equal(await getArtistPage(db, u1, dead.id), null);
    assert.equal(await getArtistPage(db, u1, gone.id), null);
    assert.ok(await getArtistPage(db, u1, a.id));
    const calendarBase = ist("2031-03-18T10:00:00");
    ok("deceased/disbanded artists are excluded from the grid and the page lookup (page calls notFound)");

    // ---- news dedupe ----
    const items = parseFeedItems([
      { title: `${a.name} announces India tour - Rolling Stone India`, link: "https://example.com/a1", isoDate: new Date().toISOString() },
      { title: `${a.name} announces India tour - Rolling Stone India`, link: "https://example.com/a1", isoDate: new Date().toISOString() }, // same URL
      { title: `${a.name} announces India tour - Scroll`, link: "https://example.com/a2", isoDate: new Date().toISOString() }, // same headline, other URL
      { title: `${a.name} new single - NME`, link: "https://example.com/a3", isoDate: new Date(Date.now() - 3 * 86400_000).toISOString() },
      { title: `${a.name} old interview - Mint`, link: "https://example.com/old", isoDate: new Date(Date.now() - 90 * 86400_000).toISOString() }, // > 60 days
      { title: "Someone else entirely - Mint", link: "https://example.com/other", isoDate: new Date().toISOString() },
    ]);
    assert.equal(items.length, 5); // the 90-day-old one is dropped at parse time
    const r1 = await refreshArtistNews(db, a, { items });
    assert.equal(r1.stored, 2);
    const r2 = await refreshArtistNews(db, a, { items });
    assert.equal(r2.stored, 0);
    const rows = await db.select().from(artistNews).where(eq(artistNews.artistId, a.id));
    assert.equal(rows.length, 2);
    assert.ok(rows.every((x) => x.publisher));
    ok("news: dedupe by URL and headline, 60-day cutoff, publisher stored, second refresh stores nothing");

    // ---- scheduling ----
    const ev = await mkEvent(a.id, "sale", { saleOpensAt: ist("2031-03-19T14:00:00"), status: "sale_soon" });
    await setCallMe(u1.id, a.id, true);
    await setCallMe(u2.id, a.id, true);
    await scheduleForEvent(db, ev.id, calendarBase);
    let rem = await db.select().from(callReminders).where(eq(callReminders.eventId, ev.id));
    assert.equal(rem.length, 1, "only the user with phone AND consent");
    assert.equal(rem[0].userId, u1.id);
    assert.equal(rem[0].scheduledFor.toISOString(), ist("2031-03-19T13:00:00").toISOString()); // 14:00 minus 60 min default
    const night = await mkEvent(a.id, "night", { saleOpensAt: ist("2031-03-21T05:00:00") });
    await scheduleForEvent(db, night.id, calendarBase);
    const [nr] = await db.select().from(callReminders).where(eq(callReminders.eventId, night.id));
    assert.ok(inCallWindow(nr.scheduledFor), "quiet hours respected");
    assert.equal(nr.scheduledFor.toISOString(), ist("2031-03-20T21:00:00").toISOString());
    // consent given later schedules for u2; withdrawn cancels
    assert.equal((await savePhone(u2.id, "98765 43210", true)).ok, true);
    assert.equal((await db.select().from(callReminders).where(and(eq(callReminders.eventId, ev.id), eq(callReminders.userId, u2.id), eq(callReminders.status, "scheduled")))).length, 1);
    assert.equal((await savePhone(u2.id, "98765 43210", false)).ok, true);
    assert.equal((await db.select().from(callReminders).where(and(eq(callReminders.eventId, ev.id), eq(callReminders.userId, u2.id), eq(callReminders.status, "scheduled")))).length, 0);
    assert.equal((await savePhone(u2.id, "123", true)).ok, false);
    // event cancelled / user dismissed
    await db.update(events).set({ status: "cancelled" }).where(eq(events.id, night.id));
    await scheduleForEvent(db, night.id, calendarBase);
    assert.equal((await db.select().from(callReminders).where(eq(callReminders.eventId, night.id)))[0].status, "cancelled");
    await db.insert(alerts).values({ userId: u1.id, eventId: ev.id, kind: "new_show", channel: "telegram", userAction: "dismissed" });
    await scheduleForEvent(db, ev.id, calendarBase);
    assert.equal((await db.select().from(callReminders).where(and(eq(callReminders.eventId, ev.id), eq(callReminders.userId, u1.id))))[0].status, "cancelled");
    await db.delete(alerts).where(eq(alerts.eventId, ev.id));
    await scheduleForEvent(db, ev.id, calendarBase); // dismissal lifted: row comes back (never attempted)
    rem = await db.select().from(callReminders).where(and(eq(callReminders.eventId, ev.id), eq(callReminders.userId, u1.id)));
    assert.equal(rem[0].status, "scheduled");
    ok("scheduleForEvent: consent + phone required, lead applied, quiet hours clamp, cancel on cancelled/dismissed/consent withdrawn");

    // ---- calls job, flag off ----
    const { POST: callsJob } = await import("../app/api/jobs/calls/route");
    const { POST: hook } = await import("../app/api/calls/webhook/route");
    await db.update(callReminders).set({ scheduledFor: new Date(Date.now() - 60_000) }).where(eq(callReminders.id, rem[0].id));
    const jr = await callsJob(new Request("http://x/api/jobs/calls", { method: "POST", headers: { authorization: "Bearer test-cron-secret" } }));
    assert.deepEqual(await jr.json(), { ok: true, skipped: "disabled" });
    assert.equal((await callsJob(new Request("http://x", { method: "POST" }))).status, 401);
    assert.equal((await runCallsJob(db)).skipped, "disabled");
    assert.equal(providerFetches, 0);
    assert.equal((await db.select().from(callReminders).where(eq(callReminders.id, rem[0].id)))[0].status, "scheduled");
    assert.equal((await hook(new Request("http://x/api/calls/webhook", { method: "POST", body: "{}" }))).status, 404);
    ok("flag off: job returns skipped:disabled, nothing claimed, zero provider fetches, webhook 404");

    // ---- flag on with a fake provider (no network) ----
    process.env.VOICE_CALLS_ENABLED = "true";
    const placed: { to: string; artist: string }[] = [];
    const fake = { placeCall: async (req: { to: string; artist: string }) => { placed.push(req); return { providerCallId: `fake-${tag}` }; } };
    const inWindow = ist("2031-03-19T13:00:30");
    const j1 = await runCallsJob(db, { now: inWindow, provider: fake as never });
    assert.equal(j1.placed, 1);
    assert.equal(placed[0].artist, a.name);
    const j2 = await runCallsJob(db, { now: inWindow, provider: fake as never });
    assert.equal(j2.placed, 0, "never twice");
    const [called] = await db.select().from(callReminders).where(eq(callReminders.id, rem[0].id));
    assert.equal(called.status, "calling");
    assert.equal(called.providerCallId, `fake-${tag}`);
    // webhook: signature, dedupe, outcome
    const send = (body: object, sig?: string) => {
      const raw = JSON.stringify(body);
      return hook(new Request("http://x/api/calls/webhook", { method: "POST", body: raw, headers: { "x-signature": sig ?? createHmac("sha256", "test-webhook-secret").update(raw).digest("hex") } }));
    };
    assert.equal((await send({ provider_call_id: `fake-${tag}`, status: "answered" }, "bad")).status, 401);
    assert.equal(signatureValid("x", null), false);
    assert.deepEqual(await (await send({ provider_call_id: `fake-${tag}`, status: "answered" })).json(), { ok: true });
    assert.equal((await (await send({ provider_call_id: `fake-${tag}`, status: "answered" })).json()).duplicate, true);
    const [done] = await db.select().from(callReminders).where(eq(callReminders.id, rem[0].id));
    assert.equal(done.status, "done");
    assert.equal(done.attempts, 1);
    // no_answer retries then gives up; opt-out clears call_me
    const n2 = await mkEvent(a.id, "retry", { saleOpensAt: ist("2031-03-19T16:00:00") });
    await scheduleForEvent(db, n2.id, calendarBase);
    await db.update(callReminders).set({ scheduledFor: new Date(Date.now() - 1000) }).where(eq(callReminders.eventId, n2.id));
    const t0 = ist("2031-03-19T15:00:00");
    await runCallsJob(db, { now: t0, provider: { placeCall: async () => ({ providerCallId: `fake2-${tag}` }) } });
    await applyWebhook(db, { provider_call_id: `fake2-${tag}`, status: "no_answer" }, t0);
    let [rr] = await db.select().from(callReminders).where(eq(callReminders.eventId, n2.id));
    assert.equal(rr.status, "scheduled");
    assert.equal(rr.scheduledFor.toISOString(), new Date(t0.getTime() + 10 * 60_000).toISOString()); // +10 min after the first attempt
    await applyWebhook(db, { provider_call_id: `fake2-${tag}`, status: "voicemail" }, t0); // old call id, retry not yet placed: ignored (not 'calling')
    rr = (await db.select().from(callReminders).where(eq(callReminders.eventId, n2.id)))[0];
    assert.equal(rr.attempts, 1);
    await applyWebhook(db, { provider_call_id: `fake2-${tag}`, dtmf: "9" }, t0);
    assert.equal((await db.select().from(userArtists).where(and(eq(userArtists.userId, u1.id), eq(userArtists.artistId, a.id))))[0].callMe, false);
    assert.equal((await db.select().from(callReminders).where(and(eq(callReminders.eventId, n2.id), eq(callReminders.status, "scheduled")))).length, 0);
    await optOut(u1.id, null, db);
    // activity meta never holds a phone number
    const acts = await db.select().from(activityEvents).where(inArray(activityEvents.userId, createdUsers));
    assert.ok(!JSON.stringify(acts).includes("98765"));
    ok("flag on (fake provider): one call, never twice, signed + idempotent webhook, retry timing, press-9 opt-out, no phone in activity meta");
  } finally {
    delete process.env.VOICE_CALLS_ENABLED;
    await db.delete(activityEvents).where(inArray(activityEvents.userId, createdUsers));
    await db.delete(events).where(like(events.dedupeKey, `zz-${tag}-%`));
    await db.delete(artists).where(inArray(artists.id, createdArtists));
    await db.delete(users).where(inArray(users.id, createdUsers));
    globalThis.fetch = realFetch;
  }
  console.log("all artists/calls tests passed");
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
