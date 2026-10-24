import { eq, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { artistNews, type Db } from "@/lib/db";
import { NEWS_REFRESH_MS, refreshArtistNews } from "./artist-news";

// Per-instance guard for artists whose feed returns nothing (no row gets a new fetched_at).
const attempted = new Map<string, number>();

/** Call inside `after()`. Refreshes at most once per artist per 6 hours (artist_news.fetched_at). */
export async function refreshIfStale(db: Db, artist: { id: string; name: string }): Promise<boolean> {
  const last = attempted.get(artist.id) ?? 0;
  if (Date.now() - last < NEWS_REFRESH_MS) return false;
  const [{ latest }] = await db.select({ latest: sql<string | null>`max(${artistNews.fetchedAt})` }).from(artistNews).where(eq(artistNews.artistId, artist.id));
  if (latest && Date.now() - new Date(latest).getTime() < NEWS_REFRESH_MS) return false;
  attempted.set(artist.id, Date.now());
  try {
    await refreshArtistNews(db, artist);
    revalidateTag(`artist-news-${artist.id}`, "max");
    return true;
  } catch {
    return false;
  }
}
