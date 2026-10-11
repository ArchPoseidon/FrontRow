import { and, count, eq, gte, ne } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { cronAuthorized, forbidden } from "@/lib/jobs";
import { creditsUsedToday, dailyCap } from "@/lib/firecrawl";
import { esc, sendMessage } from "@/lib/notify/telegram";
import { finishRun, startRun } from "@/lib/collectors/shared";

export const maxDuration = 60;

// Daily 8:30 IST message to the owner: silent failure is the worst outcome, so this says what is red.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return forbidden();
  const db = getDb();
  const run = await startRun(db, "heartbeat");
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [sources, [events], [alerts], used, [owner], [spotify], links, runs] = await Promise.all([
      db.select().from(schema.sources),
      db.select({ n: count() }).from(schema.events).where(and(gte(schema.events.firstSeenAt, since), eq(schema.events.isSample, false))),
      db.select({ n: count() }).from(schema.alerts).where(and(gte(schema.alerts.sentAt, since), eq(schema.alerts.status, "sent"), ne(schema.alerts.kind, "test"), ne(schema.alerts.kind, "digest"))),
      creditsUsedToday(db),
      db.select().from(schema.users).where(eq(schema.users.isOwner, true)),
      db.select().from(schema.spotifyConnections).innerJoin(schema.users, eq(schema.users.id, schema.spotifyConnections.userId)).where(eq(schema.users.isOwner, true)),
      db.select({ s: schema.events.ticketStatus, n: count() }).from(schema.events).groupBy(schema.events.ticketStatus),
      db.select().from(schema.runs).where(gte(schema.runs.startedAt, since)),
    ]);
    const bad = sources.filter((s) => !s.enabled || (s.consecutiveFailures ?? 0) > 0 || s.lastError);
    const ok = sources.length - bad.length;
    const never = sources.filter((s) => !s.lastOkAt && s.enabled).length;
    const jobsRan = new Set(runs.map((r) => r.job.replace(/^scan-now:.*/, "scan-now"))).size;
    const lc = Object.fromEntries(links.map((l) => [l.s ?? "unchecked", l.n]));
    const lines = [
      "<b>FrontRow heartbeat</b>",
      `Sources OK: ${ok}/${sources.length}${never ? ` (${never} not run yet)` : ""}`,
      `New shows (24h): ${events.n}`,
      `Alerts sent (24h): ${alerts.n}`,
      `Firecrawl credits (24h): ${used}/${dailyCap()}`,
      `Ticket links: ${lc.exact ?? 0} verified, ${(lc.unchecked ?? 0) + (lc.blocked ?? 0)} pending, ${(lc.generic ?? 0) + (lc.broken ?? 0) + (lc.mismatch ?? 0) + (lc.none ?? 0)} without a direct page`,
      `Job runs (24h): ${runs.length} across ${jobsRan} jobs`,
    ];
    if (spotify?.spotify_connections?.broken) lines.push("🔴 Spotify connection is broken: reconnect it in Setup");
    if (!runs.length) lines.push("🔴 No jobs ran in the last 24 hours. Check cron-job.org");
    for (const s of bad) lines.push(`🔴 ${esc(s.name)}: ${esc((s.lastError ?? (s.enabled ? "failing" : "disabled")).slice(0, 80))}`);
    const chatId = owner?.telegramChatId;
    if (!chatId) {
      await finishRun(db, run, { errors: ["owner has no Telegram chat linked"] });
      return Response.json({ ok: false, error: "Owner has no Telegram chat linked" });
    }
    await sendMessage(chatId, lines.join("\n"));
    await finishRun(db, run, { alertsSent: 1 });
    return Response.json({ ok: true, lines });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    await finishRun(db, run, { errors: [msg] });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
