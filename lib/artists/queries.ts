import { and, asc, eq, gte, inArray, isNull, ne, or } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { visibleArtist } from "@/lib/identity/store";
import { getEventView, viewerOf } from "@/lib/data/radar";
import type { EventView } from "@/components/event-card/types";
import { displayCity } from "@/lib/util/city";
import { formatMonthYear, todayIST } from "@/lib/util/ist";

export type Priority = "must_see" | "follow" | "muted";
export type FollowedArtist = { id: string; name: string; image: string | null; priority: Priority; callMe: boolean; upcoming: number; cities: string[] };

const upcomingWhere = () =>
  and(ne(schema.events.status, "cancelled"), eq(schema.events.isSample, false), or(isNull(schema.events.eventDate), gte(schema.events.eventDate, todayIST())));

/** The viewer's followed artists. Deceased/disbanded artists are filtered out by `visibleArtist`. */
export async function getFollowedArtists(db: Db, userId: string): Promise<FollowedArtist[]> {
  const rows = await db
    .select({ a: schema.artists, priority: schema.userArtists.priority, callMe: schema.userArtists.callMe })
    .from(schema.userArtists)
    .innerJoin(schema.artists, eq(schema.artists.id, schema.userArtists.artistId))
    .where(and(eq(schema.userArtists.userId, userId), visibleArtist));
  if (!rows.length) return [];
  const evs = await db
    .select({ artistId: schema.events.artistId, city: schema.events.city })
    .from(schema.events)
    .where(and(upcomingWhere(), inArray(schema.events.artistId, rows.map((r) => r.a.id))));
  const by = new Map<string, { n: number; cities: Set<string> }>();
  for (const e of evs) {
    const x = by.get(e.artistId) ?? { n: 0, cities: new Set<string>() };
    x.n++;
    if (e.city) x.cities.add(displayCity(e.city));
    by.set(e.artistId, x);
  }
  const order = { must_see: 0, follow: 1, muted: 2 } as const;
  return rows
    .map(({ a, priority, callMe }): FollowedArtist => ({
      id: a.id,
      name: a.name,
      image: a.imageUrl,
      priority: (priority in order ? priority : "follow") as Priority,
      callMe,
      upcoming: by.get(a.id)?.n ?? 0,
      cities: [...(by.get(a.id)?.cities ?? [])].sort(),
    }))
    .sort((x, y) => order[x.priority] - order[y.priority] || y.upcoming - x.upcoming || x.name.localeCompare(y.name));
}

export type ArtistPageData = {
  artist: { id: string; name: string; image: string | null; genres: string[]; origin: string | null; lastIndiaShow: string | null };
  following: boolean;
  priority: Priority;
  callMe: boolean;
  phoneReady: boolean;
  shows: EventView[];
};

/** Null when the artist does not exist or is hidden (deceased/disbanded): the page 404s. */
export async function getArtistPage(db: Db, user: typeof schema.users.$inferSelect, artistId: string): Promise<ArtistPageData | null> {
  const [a] = await db.select().from(schema.artists).where(and(eq(schema.artists.id, artistId), visibleArtist));
  if (!a) return null;
  const [ua] = await db
    .select()
    .from(schema.userArtists)
    .where(and(eq(schema.userArtists.userId, user.id), eq(schema.userArtists.artistId, artistId)));
  const ids = await db.select({ id: schema.events.id }).from(schema.events).where(and(upcomingWhere(), eq(schema.events.artistId, artistId))).orderBy(asc(schema.events.eventDate));
  const viewer = { ...viewerOf(user), watchAllIndia: true }; // an artist page lists every India date, not just watched cities
  const shows = (await Promise.all(ids.map((r) => getEventView(db, r.id, viewer)))).flatMap((r) => (r ? [r.view] : []));
  return {
    artist: { id: a.id, name: a.name, image: a.imageUrl, genres: a.genres ?? [], origin: a.origin, lastIndiaShow: a.lastIndiaShow ?? (a.lastIndiaDate ? formatMonthYear(a.lastIndiaDate) : null) },
    following: !!ua,
    priority: ((ua?.priority as Priority | undefined) ?? "follow"),
    callMe: !!ua?.callMe,
    phoneReady: !!user.phoneE164 && !!user.phoneConsentAt,
    shows,
  };
}
