import { and, eq, ne, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { getDb, schema } from "@/lib/db";
import { cronAuthorized, forbidden } from "@/lib/jobs";
import { visibleArtist } from "@/lib/identity/store";
import { finishRun, startRun } from "@/lib/collectors/shared";
import { mapLimit } from "@/lib/util/retry";
import { refreshArtistNews } from "@/lib/news/artist-news";

export const maxDuration = 60;

// Every 6 h: Google News for followed, non-muted, visible artists; least recently refreshed first; 45 s budget.
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return forbidden();
  const db = getDb();
  const run = await startRun(db, "artist-news");
  const errors: string[] = [];
  let done = 0;
  let stored = 0;
  try {
    const started = Date.now();
    const last = sql<string | null>`(select max(n.fetched_at) from artist_news n where n.artist_id = ${schema.artists.id})`;
    const todo = await db
      .selectDistinct({ id: schema.artists.id, name: schema.artists.name, last })
      .from(schema.artists)
      .innerJoin(schema.userArtists, eq(schema.userArtists.artistId, schema.artists.id))
      .where(and(visibleArtist, ne(schema.userArtists.priority, "muted")))
      .orderBy(sql`${last} asc nulls first`)
      .limit(60);
    await mapLimit(todo, 4, async (a) => {
      if (Date.now() - started > 45_000) return;
      try {
        const r = await refreshArtistNews(db, a);
        stored += r.stored;
        done++;
        revalidateTag(`artist-news-${a.id}`, "max");
      } catch (e) {
        errors.push(`${a.name.slice(0, 30)}: ${e instanceof Error ? e.message.slice(0, 60) : "failed"}`);
      }
    });
    await finishRun(db, run, { itemsIn: done, eventsNew: stored, errors });
    return Response.json({ ok: true, artists: done, stored, errors });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    await finishRun(db, run, { errors: [msg] });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
