"use server";

import { after } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { auth } from "@/auth";
import { artistCandidates, artists, getDb, userArtists, users } from "@/lib/db";
import { track } from "@/lib/activity";
import { addSpotifyArtist, closeCandidate, resolveText, type AddResult } from "@/lib/identity/resolve";
import { searchArtists, type SpotifyArtist } from "@/lib/identity/spotify";
import { visibleArtist } from "@/lib/identity/store";
import { startBackgroundScan } from "@/lib/brain/scan";
import { MAJOR_CITIES } from "@/lib/util/cities";

async function uid() {
  const s = await auth();
  if (!s?.user?.id) throw new Error("unauthorized");
  return s.user.id;
}

export type MyArtist = { id: string; name: string; image: string | null; priority: string };

export async function getMyArtists(userId: string): Promise<MyArtist[]> {
  return getDb()
    .select({ id: artists.id, name: artists.name, image: artists.imageUrl, priority: userArtists.priority })
    .from(userArtists)
    .innerJoin(artists, eq(artists.id, userArtists.artistId))
    .where(and(eq(userArtists.userId, userId), visibleArtist))
    .orderBy(artists.name);
}

export async function searchArtistsAction(q: string): Promise<{ results: SpotifyArtist[]; hiddenIds: string[] }> {
  await uid();
  const query = q.trim();
  if (query.length < 2) return { results: [], hiddenIds: [] };
  const results = await searchArtists(query, 8);
  // Known deceased/disbanded artists never appear in search.
  const known = results.length
    ? await getDb()
        .select({ spotifyId: artists.spotifyId })
        .from(artists)
        .where(and(inArray(artists.spotifyId, results.map((r) => r.id)), sql`(${artists.isDeceased} or ${artists.inactiveReason} is not null)`))
    : [];
  const hide = new Set(known.map((k) => k.spotifyId));
  after(() => track("search_used", null, { len: query.length }));
  return { results: results.filter((r) => !hide.has(r.id)), hiddenIds: [] };
}

export async function addArtistAction(a: SpotifyArtist, via = "search"): Promise<AddResult> {
  const userId = await uid();
  const r = await addSpotifyArtist(userId, a, via);
  if (r.kind === "added") after(() => track("artists_added", userId, { count: 1, via }));
  return r;
}

export async function removeArtistAction(artistId: string) {
  const userId = await uid();
  await getDb().delete(userArtists).where(and(eq(userArtists.userId, userId), eq(userArtists.artistId, artistId)));
}

export async function pasteAction(text: string): Promise<{ added: number; inactive: string[]; choose: Extract<AddResult, { kind: "choose" }>[] }> {
  const userId = await uid();
  const lines = text.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).slice(0, 40);
  const out = { added: 0, inactive: [] as string[], choose: [] as Extract<AddResult, { kind: "choose" }>[] };
  const budget = Date.now() + 45_000;
  for (const line of lines) {
    if (Date.now() > budget) break;
    const r = await resolveText(userId, line, "paste");
    if (r.kind === "added" || r.kind === "name_only") out.added++;
    else if (r.kind === "inactive") out.inactive.push(r.name);
    else out.choose.push(r);
  }
  after(async () => {
    await track("artists_added", userId, { count: out.added, via: "paste" });
    if (out.added >= 3) await startBackgroundScan(getDb(), userId, 50_000);
  });
  return out;
}

export async function chooseCandidateAction(candidateId: string, pick: SpotifyArtist | null): Promise<AddResult | null> {
  const userId = await uid();
  const [c] = await getDb().select().from(artistCandidates).where(and(eq(artistCandidates.id, candidateId), eq(artistCandidates.userId, userId)));
  if (!c) return null;
  if (!pick) { await closeCandidate(candidateId, "removed"); return null; }
  const r = await addSpotifyArtist(userId, pick, "paste");
  await closeCandidate(candidateId, "resolved");
  return r;
}

export async function openCandidates() {
  const userId = await uid();
  return getDb().select().from(artistCandidates).where(and(eq(artistCandidates.userId, userId), eq(artistCandidates.status, "open")));
}

export async function setPriorityAction(artistId: string, priority: "must_see" | "follow" | "muted") {
  const userId = await uid();
  await getDb().update(userArtists).set({ priority }).where(and(eq(userArtists.userId, userId), eq(userArtists.artistId, artistId)));
}

export async function saveCitiesAction(input: { p1: string[]; p2: string[]; allIndia: boolean }) {
  const userId = await uid();
  const ok = new Set<string>(MAJOR_CITIES);
  const p1 = [...new Set(input.p1.filter((c) => ok.has(c)))].slice(0, 3);
  const p2 = [...new Set(input.p2.filter((c) => ok.has(c) && !p1.includes(c)))].slice(0, 5);
  await getDb()
    .update(users)
    .set({ p1Cities: p1, p2Cities: p2, watchAllIndia: input.allIndia, homeCity: p1[0] ?? "Bengaluru", watchCities: input.allIndia ? ["ALL_INDIA"] : [...p1, ...p2], onboardingStep: 2 })
    .where(eq(users.id, userId));
  after(() => track("onboarding_step", userId, { step: 2 }));
}

export async function finishOnboardingAction() {
  const userId = await uid();
  await getDb().update(users).set({ onboardingStep: 3, onboardedAt: new Date() }).where(eq(users.id, userId));
  revalidateTag("suggestions", "max");
  // The first scan runs in the background; the radar shows results as they land (item 12).
  after(async () => {
    await track("onboarding_done", userId);
    await startBackgroundScan(getDb(), userId, 50_000);
  });
}


export async function addKnownArtistAction(artistId: string, via = "suggested"): Promise<boolean> {
  const userId = await uid();
  const [a] = await getDb().select({ id: artists.id }).from(artists).where(and(eq(artists.id, artistId), visibleArtist));
  if (!a) return false;
  await getDb().insert(userArtists).values({ userId, artistId, addedVia: via }).onConflictDoNothing();
  after(() => track("artists_added", userId, { count: 1, via }));
  return true;
}

export async function addKnownManyAction(artistIds: string[]): Promise<string[]> {
  const userId = await uid();
  const rows = artistIds.length ? await getDb().select({ id: artists.id }).from(artists).where(and(inArray(artists.id, artistIds), visibleArtist)) : [];
  if (rows.length) await getDb().insert(userArtists).values(rows.map((r) => ({ userId, artistId: r.id, addedVia: "suggested" }))).onConflictDoNothing();
  after(async () => {
    await track("artists_added", userId, { count: rows.length, via: "suggested" });
    if (rows.length >= 3) await startBackgroundScan(getDb(), userId, 50_000);
  });
  return rows.map((r) => r.id);
}
