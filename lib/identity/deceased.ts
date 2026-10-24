import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { artists, getDb } from "@/lib/db";
import { lookupArtist } from "./musicbrainz";

/** The admin site's "unhide" sets this marker so a later recheck never re-hides a wrongly flagged artist. */
export const OVERRIDE = "override:unhidden";
const MONTH = 30 * 24 * 3600 * 1000;

/**
 * Item 9: re-check artists whose last deceased check is older than 30 days (or never ran).
 * Rate-limited by the MusicBrainz client (1 req/s). Returns the names it newly hid, so a wrong hide can be reversed.
 */
export async function recheckDeceased(budgetMs: number, opts: { all?: boolean } = {}): Promise<{ checked: number; hidden: string[] }> {
  const db = getDb();
  const end = Date.now() + budgetMs;
  const due = await db
    .select({ id: artists.id, name: artists.name })
    .from(artists)
    .where(
      and(
        or(isNull(artists.bioSourceUrl), sql`${artists.bioSourceUrl} <> ${OVERRIDE}`),
        eq(artists.isDeceased, false),
        isNull(artists.inactiveReason),
        opts.all ? undefined : or(isNull(artists.deceasedCheckedAt), lt(artists.deceasedCheckedAt, new Date(Date.now() - MONTH))),
      ),
    )
    .orderBy(artists.deceasedCheckedAt)
    .limit(opts.all ? 5000 : 60);
  const out = { checked: 0, hidden: [] as string[] };
  for (const a of due) {
    if (Date.now() > end) break;
    const info = await lookupArtist(a.name);
    out.checked++;
    if (info?.inactiveReason) {
      await db.update(artists).set({ isDeceased: info.deceased, inactiveReason: info.inactiveReason, mbid: info.mbid, deceasedCheckedAt: new Date() }).where(eq(artists.id, a.id)).catch(() => {});
      out.hidden.push(`${a.name} (${info.inactiveReason})`);
    } else {
      await db.update(artists).set({ deceasedCheckedAt: new Date() }).where(eq(artists.id, a.id));
    }
  }
  return out;
}
