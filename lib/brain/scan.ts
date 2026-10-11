import { and, asc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { collectArtistNews } from "@/lib/collectors/news";
import { sweepArtist } from "@/lib/collectors/sweep";
import { ARTIST_NEWS_SOURCE, SWEEP_SOURCE } from "@/lib/collectors/sources";
import { loadWatched } from "./match";
import { processItems, refreshArtistCounts } from "./process";
import { decideForEvents } from "./decide";
import { displayCity, normalizeCity } from "@/lib/util/city";
import { formatMonthYear, formatShowDate, todayIST } from "@/lib/util/ist";
import { mapLimit } from "@/lib/util/retry";
import type { Emit } from "@/lib/util/sse";

export const SWEEP_LIMIT = 8;
const RECENT_SWEEP_MS = 12 * 3600 * 1000;

export type FoundShow = {
  eventId: string;
  artistId: string;
  artistName: string;
  imageUrl: string | null;
  title: string | null;
  venue: string | null;
  city: string | null;
  date: string | null;
  status: string | null;
  ticketUrl: string | null;
  isFestival: boolean;
  inHomeCity: boolean;
  confidence: number | null;
  sources: { url: string; platform: string | null }[];
};

export type Summary = {
  headline: string;
  total: number;
  inHomeCity: number;
  earlyBird: number;
  shows: FoundShow[];
  quiet: { artistId: string; name: string; imageUrl: string | null; lastIndia: string | null; checkedAt: string | null }[];
  deepCheckLater: number;
  artistCount: number;
  sourceCount: number;
};

// Upcoming, real events for a user's non-muted artists.
export async function upcomingForUser(db: Db, userId: string, homeCity: string | null): Promise<FoundShow[]> {
  const today = todayIST();
  const rows = await db
    .select({ e: schema.events, a: schema.artists })
    .from(schema.events)
    .innerJoin(schema.artists, eq(schema.artists.id, schema.events.artistId))
    .innerJoin(schema.userArtists, and(eq(schema.userArtists.artistId, schema.artists.id), eq(schema.userArtists.userId, userId)))
    .where(
      and(
        ne(schema.userArtists.priority, "muted"),
        eq(schema.events.isSample, false),
        ne(schema.events.status, "cancelled"),
        or(isNull(schema.events.eventDate), gte(schema.events.eventDate, today)),
      ),
    )
    .orderBy(asc(schema.events.eventDate));
  if (!rows.length) return [];
  const srcs = await db.select().from(schema.eventSources).where(inArray(schema.eventSources.eventId, rows.map((r) => r.e.id)));
  const home = normalizeCity(homeCity ?? "Bengaluru");
  return rows.map(({ e, a }) => ({
    eventId: e.id,
    artistId: a.id,
    artistName: a.name,
    imageUrl: a.imageUrl,
    title: e.title,
    venue: e.venue,
    city: e.city ? displayCity(e.city) : null,
    date: e.eventDate,
    status: e.status,
    ticketUrl: e.ticketUrl,
    isFestival: !!e.isFestival,
    inHomeCity: normalizeCity(e.city) === home,
    confidence: e.confidence,
    sources: srcs.filter((s) => s.eventId === e.id).map((s) => ({ url: s.url, platform: s.platform })),
  }));
}

export async function buildSummary(db: Db, userId: string, homeCity: string | null, deepCheckLater: number): Promise<Summary> {
  const [shows, mine, [srcCount]] = await Promise.all([
    upcomingForUser(db, userId, homeCity),
    db
      .select({ a: schema.artists, priority: schema.userArtists.priority })
      .from(schema.userArtists)
      .innerJoin(schema.artists, eq(schema.artists.id, schema.userArtists.artistId))
      .where(and(eq(schema.userArtists.userId, userId), ne(schema.userArtists.priority, "muted"))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.sources).where(eq(schema.sources.enabled, true)),
  ]);
  const withShow = new Set(shows.map((s) => s.artistId));
  const inHome = shows.filter((s) => s.inHomeCity);
  const early = shows.filter((s) => s.status === "early_bird").length;
  const quiet = mine
    .filter((m) => !withShow.has(m.a.id))
    .map((m) => ({
      artistId: m.a.id,
      name: m.a.name,
      imageUrl: m.a.imageUrl,
      lastIndia: m.a.lastIndiaShow ? `Last in India: ${m.a.lastIndiaShow}` : m.a.lastIndiaDate ? `Last in India: ${formatMonthYear(m.a.lastIndiaDate)}` : null,
      checkedAt: m.a.lastCheckedAt?.toISOString() ?? null,
    }));
  const n = mine.length;
  const home = displayCity(homeCity ?? "Bengaluru");
  const headline = shows.length
    ? `We found ${shows.length} upcoming show${shows.length === 1 ? "" : "s"} for your artists.` +
      (inHome.length ? ` ${inHome.length} ${inHome.length === 1 ? "is" : "are"} in ${home}` + (early ? ` with early-bird tickets open.` : ".") : "")
    : `None of your ${n} artist${n === 1 ? "" : "s"} has an India show announced right now. We're watching ${srcCount.n} sources and will alert you the moment one does.`;
  return { headline, total: shows.length, inHomeCity: inHome.length, earlyBird: early, shows, quiet, deepCheckLater, artistCount: n, sourceCount: srcCount.n };
}

// The first-run scan: instant match, news and grounded sweep run in parallel, streaming progress as SSE.
export async function runFirstScan(db: Db, user: typeof schema.users.$inferSelect, emit: Emit) {
  const mine = await db
    .select({ id: schema.userArtists.artistId, priority: schema.userArtists.priority, checkedAt: schema.artists.lastCheckedAt })
    .from(schema.userArtists)
    .innerJoin(schema.artists, eq(schema.artists.id, schema.userArtists.artistId))
    .where(and(eq(schema.userArtists.userId, user.id), ne(schema.userArtists.priority, "muted")));
  const ids = mine.map((m) => m.id);
  const watched = await loadWatched(db, ids);
  const byId = new Map(watched.map((w) => [w.id, w]));
  emit("start", { artists: watched.length });
  emit("log", { step: "all", text: `Checking ${watched.length} artist${watched.length === 1 ? "" : "s"} across news, ticketing and web search…` });
  if (!watched.length) {
    emit("done", await buildSummary(db, user.id, user.homeCity, 0));
    return;
  }
  const announced = new Set<string>();
  const announce = async (eventIds: string[], prefix = "Found") => {
    const shows = (await upcomingForUser(db, user.id, user.homeCity)).filter((s) => eventIds.includes(s.eventId) && !announced.has(s.eventId));
    for (const s of shows) {
      announced.add(s.eventId);
      emit("found", { eventId: s.eventId });
      emit("log", { step: "all", text: `${prefix}: ${s.artistName}, ${s.city ?? "city TBA"}, ${formatShowDate(s.date)}` });
    }
  };

  // Step 1: instant match against what the system already knows.
  const instant = async () => {
    emit("step", { step: "instant", state: "running" });
    const known = await upcomingForUser(db, user.id, user.homeCity);
    await decideForEvents(db, known.map((k) => k.eventId), user.id);
    await announce(known.map((k) => k.eventId), "Already found");
    emit("step", { step: "instant", state: "done", count: known.length });
  };

  // Step 2: Google News for every artist, then extract and match.
  const news = async () => {
    emit("step", { step: "news", state: "running" });
    const src = (await db.select().from(schema.sources).where(eq(schema.sources.name, ARTIST_NEWS_SOURCE)))[0];
    const res = await collectArtistNews(db, src?.id ?? null, watched, { perArtist: 3 });
    emit("log", { step: "news", text: `Read ${res.feeds - res.failedFeeds} news feeds, ${res.newItems} new headlines about your artists` });
    // New headlines only; the shared hash means headlines other users already pulled are processed by the 5-minute job.
    if (res.itemIds.length) {
      const p = await processItems(db, { ids: res.itemIds.slice(0, 24), limit: 24, concurrency: 5 });
      await announce(p.eventIds);
    }
    emit("step", { step: "news", state: res.failedFeeds === res.feeds ? "error" : "done", count: res.newItems });
  };

  // Step 3: grounded sweep for up to 8 artists, must_see first. Skip artists swept in the last 12 hours.
  const order = [...mine].sort((a, b) => (a.priority === "must_see" ? 0 : 1) - (b.priority === "must_see" ? 0 : 1));
  const stale = order.filter((m) => !m.checkedAt || Date.now() - m.checkedAt.getTime() > RECENT_SWEEP_MS);
  const sweepIds = stale.slice(0, SWEEP_LIMIT).map((m) => m.id);
  const deepLater = Math.max(0, stale.length - sweepIds.length);
  const sweep = async () => {
    emit("step", { step: "sweep", state: "running", total: sweepIds.length });
    const src = (await db.select().from(schema.sources).where(eq(schema.sources.name, SWEEP_SOURCE)))[0];
    let failed = 0;
    await mapLimit(sweepIds, 4, async (id) => {
      const a = byId.get(id)!;
      const r = await sweepArtist(db, src?.id ?? null, a);
      if (r.error) failed++;
      emit("log", { step: "sweep", text: r.error ? `Couldn't search the web for ${a.name}` : r.found ? `Web search found shows for ${a.name}, checking details…` : `Web search: nothing announced for ${a.name}` });
      if (r.rawItemId) {
        const p = await processItems(db, { ids: [r.rawItemId], limit: 1, concurrency: 1 });
        await announce(p.eventIds);
      }
    });
    emit("step", { step: "sweep", state: failed === sweepIds.length && sweepIds.length ? "error" : "done", count: sweepIds.length - failed });
  };

  await Promise.all([instant(), news(), sweep()].map((p) => p.catch((e) => emit("log", { step: "all", text: `A source failed: ${e instanceof Error ? e.message.slice(0, 80) : "error"}` }))));
  await refreshArtistCounts(db);
  // Alerts for everything this user now has (idempotent; dispatch sends them in Phase 3).
  const all = await upcomingForUser(db, user.id, user.homeCity);
  await decideForEvents(db, all.map((s) => s.eventId), user.id);
  emit("done", await buildSummary(db, user.id, user.homeCity, deepLater));
}

