import { cacheLife, cacheTag } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { visibleArtist } from "@/lib/identity/store";

export type MerchRailItem = { id: string; name: string; priceInr: number; image: string | null; isDemo: boolean };

/** Shared read for the artist-page merch rail. Tagged per artist so a news/merch refresh can bust it. */
export async function getArtistMerch(artistId: string): Promise<MerchRailItem[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`artist-news-${artistId}`, "merch");
  const P = schema.merchProducts;
  const rows = await getDb()
    .select({ id: P.id, name: P.name, priceInr: P.priceInr, image: P.imageUrl, isDemo: P.isDemo })
    .from(P)
    .innerJoin(schema.artists, eq(schema.artists.id, P.artistId))
    .where(and(eq(P.artistId, artistId), eq(P.active, true), visibleArtist))
    .orderBy(asc(P.priceInr))
    .limit(12);
  return rows.map((r) => ({ ...r, image: r.image?.split("|")[0] || null }));
}
