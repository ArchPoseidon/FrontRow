"use server";

import { after } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { artists, getDb, userArtists } from "@/lib/db";
import { track } from "@/lib/activity";
import { addSpotifyArtist, type AddResult } from "@/lib/identity/resolve";
import { searchArtists, type SpotifyArtist } from "@/lib/identity/spotify";
import { visibleArtist } from "@/lib/identity/store";
import { setCallMe, type Result } from "@/lib/calls/store";
import { syncReminders } from "@/lib/calls/schedule";

async function uid() {
  const s = await auth();
  if (!s?.user?.id) throw new Error("unauthorized");
  return s.user.id;
}

const PRIORITIES = ["must_see", "follow", "muted"] as const;

export async function setPriorityAction(artistId: string, priority: string): Promise<Result> {
  const userId = await uid();
  if (!(PRIORITIES as readonly string[]).includes(priority)) return { ok: false, error: "Unknown priority" };
  const db = getDb();
  const [row] = await db
    .update(userArtists)
    .set({ priority })
    .where(and(eq(userArtists.userId, userId), eq(userArtists.artistId, artistId)))
    .returning({ artistId: userArtists.artistId });
  if (!row) return { ok: false, error: "You don't follow this artist" };
  if (priority === "muted") await syncReminders(db, { userId, artistId }); // muted artists never get calls
  after(() => track("artist_priority_changed", userId, { artistId, priority }));
  return { ok: true };
}

export async function setCallMeAction(artistId: string, on: boolean): Promise<Result<{ count: number; needsPhone: boolean }>> {
  const userId = await uid();
  const r = await setCallMe(userId, artistId, on);
  if (r.ok && on) after(() => track("call_optin", userId, { artistId }));
  return r;
}

export async function followAction(artistId: string): Promise<Result> {
  const userId = await uid();
  const db = getDb();
  const [a] = await db.select({ id: artists.id }).from(artists).where(and(eq(artists.id, artistId), visibleArtist));
  if (!a) return { ok: false, error: "Artist not found" };
  await db.insert(userArtists).values({ userId, artistId, addedVia: "search", priority: "follow" }).onConflictDoNothing();
  after(() => track("artists_added", userId, { count: 1, via: "artist_page" }));
  return { ok: true };
}

export async function searchArtistsAction(q: string): Promise<{ results: SpotifyArtist[]; mine: string[] }> {
  const userId = await uid();
  const query = q.trim();
  if (query.length < 2) return { results: [], mine: [] };
  const results = await searchArtists(query, 6);
  if (!results.length) return { results, mine: [] };
  const db = getDb();
  const ids = results.map((r) => r.id);
  // Known deceased/disbanded artists never appear in search.
  const hidden = await db.select({ s: artists.spotifyId }).from(artists).where(and(inArray(artists.spotifyId, ids), sql`(${artists.isDeceased} or ${artists.inactiveReason} is not null)`));
  const hide = new Set(hidden.map((h) => h.s));
  const mine = await db
    .select({ s: artists.spotifyId })
    .from(userArtists)
    .innerJoin(artists, eq(artists.id, userArtists.artistId))
    .where(and(eq(userArtists.userId, userId), inArray(artists.spotifyId, ids)));
  return { results: results.filter((r) => !hide.has(r.id)), mine: mine.flatMap((m) => (m.s ? [m.s] : [])) };
}

export async function addArtistAction(a: SpotifyArtist): Promise<AddResult> {
  const userId = await uid();
  const r = await addSpotifyArtist(userId, a, "search");
  if (r.kind === "added") after(() => track("artists_added", userId, { count: 1, via: "search" }));
  return r;
}
