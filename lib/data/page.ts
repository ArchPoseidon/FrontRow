import { eq, max, sql } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { getAlertHistory, getArtistViews, getRadarEvents, viewerOf } from "./radar";

// Everything the radar screen needs for one viewer (the signed-in user, or the owner for /demo).
export async function loadRadarPage(db: Db, user: typeof schema.users.$inferSelect, opts: { history: boolean }) {
  const viewer = viewerOf(user);
  const [events, artists, history, [src], [last], liveElsewhere] = await Promise.all([
    getRadarEvents(db, viewer),
    getArtistViews(db, user.id),
    opts.history ? getAlertHistory(db, user.id) : Promise.resolve(undefined),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.sources).where(eq(schema.sources.enabled, true)),
    db.select({ t: max(schema.runs.startedAt) }).from(schema.runs),
    getRadarEvents(db, viewer, { elsewhere: { limit: 6 } }),
  ]);
  return { events, liveElsewhere, artists, history, sourceCount: src.n, lastScanAt: last.t?.toISOString() ?? null };
}
