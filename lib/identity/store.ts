import { and, eq, isNull, sql } from "drizzle-orm";
import { artists, getDb, userArtists } from "@/lib/db";
import { derivedAliases, normalizeName } from "@/lib/util/names";
import { lookupArtist } from "./musicbrainz";
import type { SpotifyArtist } from "./spotify";

/** Item 9: every artist query uses this. */
export const visibleArtist = and(eq(artists.isDeceased, false), isNull(artists.inactiveReason));

export async function upsertSpotifyArtist(a: SpotifyArtist): Promise<string> {
  const db = getDb();
  const norm = normalizeName(a.name);
  const [row] = await db
    .insert(artists)
    .values({ name: a.name, normalizedName: norm, spotifyId: a.id, imageUrl: a.image, genres: a.genres, aliases: derivedAliases(a.name), identityStatus: "verified" })
    .onConflictDoUpdate({ target: artists.spotifyId, set: { name: a.name, normalizedName: norm, imageUrl: a.image, genres: a.genres } })
    .returning({ id: artists.id });
  return row.id;
}

export async function upsertNameOnlyArtist(name: string): Promise<string> {
  const db = getDb();
  const norm = normalizeName(name);
  const [ex] = await db.select({ id: artists.id }).from(artists).where(and(eq(artists.normalizedName, norm), isNull(artists.spotifyId)));
  if (ex) return ex.id;
  const [row] = await db
    .insert(artists)
    .values({ name, normalizedName: norm, aliases: derivedAliases(name), identityStatus: "unverified" })
    .returning({ id: artists.id });
  return row.id;
}

/** MusicBrainz enrichment: aliases, origin, mbid, deceased/disbanded. Best effort. */
export async function enrichArtist(artistId: string): Promise<{ hidden: boolean }> {
  const db = getDb();
  const [a] = await db.select().from(artists).where(eq(artists.id, artistId));
  if (!a) return { hidden: false };
  if (a.deceasedCheckedAt) return { hidden: a.isDeceased || !!a.inactiveReason };
  const info = await lookupArtist(a.name);
  if (info) {
    const taken = await db.select({ id: artists.id }).from(artists).where(and(eq(artists.mbid, info.mbid)));
    await db
      .update(artists)
      .set({
        mbid: taken.length && taken[0].id !== a.id ? a.mbid : info.mbid,
        aliases: [...new Set([...a.aliases, ...info.aliases])],
        origin: info.origin,
        isDeceased: info.deceased,
        inactiveReason: info.inactiveReason,
        deceasedCheckedAt: new Date(),
      })
      .where(eq(artists.id, a.id));
    return { hidden: !!info.inactiveReason };
  }
  await db.update(artists).set({ deceasedCheckedAt: new Date() }).where(eq(artists.id, a.id));
  return { hidden: false };
}

/** Enrich many with a time budget. Returns ids hidden as deceased/disbanded. */
export async function enrichMany(ids: string[], budgetMs: number): Promise<string[]> {
  const end = Date.now() + budgetMs;
  const hidden: string[] = [];
  for (const id of ids) {
    if (Date.now() > end) break;
    if ((await enrichArtist(id)).hidden) hidden.push(id);
  }
  return hidden;
}

export async function linkArtist(userId: string, artistId: string, via: string, priority = "follow") {
  await getDb()
    .insert(userArtists)
    .values({ userId, artistId, addedVia: via, priority })
    .onConflictDoNothing();
}

export async function unenrichedIds(ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await getDb()
    .select({ id: artists.id })
    .from(artists)
    .where(and(isNull(artists.deceasedCheckedAt), sql`${artists.id} = ANY(${ids}::uuid[])`));
  return rows.map((r) => r.id);
}
