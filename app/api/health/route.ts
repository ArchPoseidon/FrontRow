import { count, desc, eq } from "drizzle-orm";
import { artists, events, getDb, runs, sources, users } from "@/lib/db";

/** Public. Real values only; no secrets, no user ids. */
export async function GET() {
  const started = Date.now();
  try {
    const db = getDb();
    const [[u], [a], [e], src, lastRuns] = await Promise.all([
      db.select({ n: count() }).from(users),
      db.select({ n: count() }).from(artists),
      db.select({ n: count() }).from(events).where(eq(events.isSample, false)),
      db.select({ name: sources.name, kind: sources.kind, lastOkAt: sources.lastOkAt, failures: sources.consecutiveFailures }).from(sources),
      db.select({ job: runs.job, finishedAt: runs.finishedAt }).from(runs).orderBy(desc(runs.startedAt)).limit(20),
    ]);
    return Response.json({
      ok: true,
      dbLatencyMs: Date.now() - started,
      counts: { users: u.n, artists: a.n, events: e.n },
      sources: src,
      lastRuns,
    });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "error" }, { status: 503 });
  }
}
