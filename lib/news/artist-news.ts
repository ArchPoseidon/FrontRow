import Parser from "rss-parser";
import { and, eq, lt, sql } from "drizzle-orm";
import { artistNews, type Db } from "@/lib/db";
import { decodeGoogleNews } from "@/lib/links/url";
import { normalizeName } from "@/lib/identity/normalize";
import { mapLimit } from "@/lib/util/retry";

export const NEWS_MAX = 6;
export const NEWS_MAX_AGE_MS = 60 * 24 * 3600_000;
export const NEWS_REFRESH_MS = 6 * 3600_000;

const parser = new Parser<object, { source?: unknown }>({
  timeout: 10_000,
  headers: { "User-Agent": "FrontRow/1.0 (personal, non-commercial concert alerts)" },
  customFields: { item: [["source", "source"]] },
});

export const newsFeedUrl = (name: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(`"${name}" when:60d`)}&hl=en-IN&gl=IN&ceid=IN:en`;

export type NewsItem = { title: string; link: string; publisher: string | null; publishedAt: Date };

/** Headline, publisher and date only; no article text is read or stored. */
export function parseFeedItems(items: { title?: string; link?: string; isoDate?: string; pubDate?: string; source?: unknown }[], now = Date.now()): NewsItem[] {
  const out: NewsItem[] = [];
  for (const i of items) {
    const raw = (i.title ?? "").trim();
    const cut = raw.lastIndexOf(" - ");
    const src = i.source;
    const srcText = typeof src === "string" ? src : src && typeof src === "object" && "_" in src ? String((src as { _: unknown })._) : null;
    const publisher = (srcText?.trim() || (cut > 0 ? raw.slice(cut + 3).trim() : "")) || null;
    const title = cut > 0 ? raw.slice(0, cut).trim() : raw;
    const publishedAt = new Date(i.isoDate ?? i.pubDate ?? "");
    if (!title || !i.link || Number.isNaN(publishedAt.getTime())) continue;
    if (now - publishedAt.getTime() > NEWS_MAX_AGE_MS || publishedAt.getTime() > now + 3600_000) continue;
    out.push({ title, link: i.link, publisher, publishedAt });
  }
  return out.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
}

/**
 * Fetch Google News for one artist, decode publisher URLs, store up to 6 new items (dedupe on artist+url).
 * A repeat of a known URL only bumps `fetched_at`, which is what the 6-hour refresh limit reads.
 */
export async function refreshArtistNews(db: Db, artist: { id: string; name: string }, opts: { items?: NewsItem[] } = {}): Promise<{ fetched: number; stored: number }> {
  const items = opts.items ?? parseFeedItems((await parser.parseURL(newsFeedUrl(artist.name))).items ?? []);
  const nameKey = normalizeName(artist.name);
  // Google's result list can be loose; keep headlines that actually name the artist.
  const relevant = items.filter((i) => normalizeName(i.title).includes(nameKey)).slice(0, NEWS_MAX * 2);
  const decoded = opts.items ? relevant.map((i) => ({ ...i, url: i.link })) : await mapLimit(relevant, 3, async (i) => ({ ...i, url: (await decodeGoogleNews(i.link)) ?? i.link }));
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const unique = decoded.filter((i) => {
    const t = normalizeName(i.title);
    if (seenUrl.has(i.url) || seenTitle.has(t)) return false;
    seenUrl.add(i.url);
    seenTitle.add(t);
    return true;
  }).slice(0, NEWS_MAX);
  let stored = 0;
  if (unique.length) {
    const rows = await db
      .insert(artistNews)
      .values(unique.map((i) => ({ artistId: artist.id, title: i.title.slice(0, 300), url: i.url, publisher: i.publisher, publishedAt: i.publishedAt })))
      .onConflictDoUpdate({ target: [artistNews.artistId, artistNews.url], set: { fetchedAt: sql`now()` } })
      .returning({ inserted: sql<boolean>`(xmax = 0)` });
    stored = rows.filter((r) => r.inserted).length;
  }
  await db.delete(artistNews).where(and(eq(artistNews.artistId, artist.id), lt(artistNews.publishedAt, new Date(Date.now() - NEWS_MAX_AGE_MS))));
  return { fetched: items.length, stored };
}
