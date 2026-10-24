import { and, eq, gte, inArray } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { appSettings, artists, events, getDb } from "@/lib/db";
import { visibleArtist } from "./store";

export type Suggestion = { id: string; name: string; image: string | null; genres: string[] };

const pick = { id: artists.id, name: artists.name, image: artists.imageUrl, genres: artists.genres };

/** Shared by every visitor, so cached for an hour and tagged. */
export async function getSuggestions(): Promise<{ touring: Suggestion[]; popular: Suggestion[] }> {
  "use cache";
  cacheLife("hours");
  cacheTag("suggestions");
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const touring = await db
    .selectDistinct(pick)
    .from(artists)
    .innerJoin(events, eq(events.artistId, artists.id))
    .where(and(visibleArtist, gte(events.eventDate, today), eq(events.isSample, false)))
    .limit(16);
  const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, "suggested_artist_ids"));
  const ids: string[] = setting ? JSON.parse(setting.value) : [];
  const popular: Suggestion[] = ids.length
    ? await db.select(pick).from(artists).where(and(visibleArtist, inArray(artists.id, ids)))
    : [];
  popular.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const touringIds = new Set(touring.map((t) => t.id));
  return { touring, popular: popular.filter((p) => !touringIds.has(p.id)) };
}

