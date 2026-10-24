import { cacheLife, cacheTag } from "next/cache";
import { and, desc, eq, gte } from "drizzle-orm";
import { artistNews, getDb } from "@/lib/db";
import { NEWS_MAX, NEWS_MAX_AGE_MS } from "./artist-news";

export type NewsRow = { id: string; title: string; url: string; publisher: string | null; publishedAt: string };

/** Same for every visitor, so cached and tagged; refreshArtistNews callers revalidate the tag. Items over 60 days old are hidden. */
export async function getArtistNews(artistId: string): Promise<NewsRow[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`artist-news-${artistId}`);
  const rows = await getDb()
    .select()
    .from(artistNews)
    .where(and(eq(artistNews.artistId, artistId), gte(artistNews.publishedAt, new Date(Date.now() - NEWS_MAX_AGE_MS))))
    .orderBy(desc(artistNews.publishedAt))
    .limit(NEWS_MAX);
  return rows.map((r) => ({ id: r.id, title: r.title, url: r.url, publisher: r.publisher, publishedAt: (r.publishedAt ?? r.fetchedAt).toISOString() }));
}
