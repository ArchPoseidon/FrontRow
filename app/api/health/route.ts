import { NextResponse } from "next/server";
import { count, desc, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

// Public. Phase 0 reports DB reachability and real counts only; per-source
// status and job runs are added once collectors exist.
export async function GET() {
  const started = Date.now();
  try {
    const db = getDb();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db.execute(sql`select 1`);
    const [ownerSpotify] = await db
      .select({ broken: schema.spotifyConnections.broken, expiresAt: schema.spotifyConnections.expiresAt })
      .from(schema.spotifyConnections)
      .innerJoin(schema.users, eq(schema.users.id, schema.spotifyConnections.userId))
      .where(eq(schema.users.isOwner, true))
      .limit(1);
    const [[users], [artists], [events24h], [alerts24h], sources, runs] = await Promise.all([
      db.select({ n: count() }).from(schema.users),
      db.select({ n: count() }).from(schema.artists),
      db.select({ n: count() }).from(schema.events).where(gte(schema.events.firstSeenAt, since)),
      db.select({ n: count() }).from(schema.alerts).where(gte(schema.alerts.sentAt, since)),
      db.select().from(schema.sources),
      db.select().from(schema.runs).orderBy(desc(schema.runs.startedAt)).limit(60),
    ]);
    // Last run per job: real rows only, empty until a job has run.
    // Per-user scan runs are folded into one public "scan-now" entry (no user ids leak).
    const jobName = (j: string) => (j.startsWith("scan-now:") ? "scan-now" : j);
    const jobs = [...new Set(runs.map((r) => jobName(r.job)))].map((job) => {
      const r = runs.find((x) => jobName(x.job) === job)!;
      return { job, startedAt: r.startedAt, finishedAt: r.finishedAt, itemsIn: r.itemsIn, eventsNew: r.eventsNew, alertsSent: r.alertsSent, errors: r.errors };
    });
    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      dbLatencyMs: Date.now() - started,
      counts: {
        users: users.n,
        artists: artists.n,
        eventsLast24h: events24h.n,
        alertsLast24h: alerts24h.n,
      },
      sources: sources.map((s) => ({
        name: s.name,
        kind: s.kind,
        enabled: s.enabled,
        lastRunAt: s.lastRunAt,
        lastOkAt: s.lastOkAt,
        lastError: s.lastError,
        consecutiveFailures: s.consecutiveFailures,
        intervalMinutes: s.intervalMinutes,
      })),
      spotify: ownerSpotify ? { connected: true, broken: !!ownerSpotify.broken } : { connected: false, broken: false },
      jobs,
      firecrawlCreditsToday: 0,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown error" },
      { status: 503 },
    );
  }
}
