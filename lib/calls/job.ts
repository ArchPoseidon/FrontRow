import { and, eq, sql } from "drizzle-orm";
import { callReminders, schema, type Db } from "@/lib/db";
import { track } from "@/lib/activity";
import { displayCity } from "@/lib/util/city";
import { voiceCallsEnabled } from "./flag";
import { settleAttempt } from "./outcome";
import { getProvider, type CallProvider } from "./provider";
import { GO_LIVE_GRACE_MS } from "./schedule";
import { clampToCallWindow, inCallWindow } from "./window";

const IST = "Asia/Kolkata";
const STALE_CALLING_MS = 20 * 60_000;

function spoken(goLive: Date, now: Date) {
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(d);
  const time = new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true }).format(goLive).replace(/\s?([ap])m/i, " $1m");
  const when = day(goLive) === day(now) ? "today" : new Intl.DateTimeFormat("en-IN", { timeZone: IST, weekday: "long", day: "numeric", month: "long" }).format(goLive);
  return `${time} ${when}`;
}
const showDate = (d: string | null) => (d ? new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${d}T00:00:00Z`)) : "soon");

type Claimed = { id: string; user_id: string; artist_id: string; event_id: string; attempts: number; first_attempt_at: string | null };

/** Atomically claim due rows: `for update skip locked` inside one statement (the HTTP driver has no transactions). */
async function claimDue(db: Db, limit: number, at: Date): Promise<Claimed[]> {
  const r = await db.execute(sql`
    update call_reminders set status = 'calling', attempts = attempts + 1,
      outcome = coalesce(outcome, '{}'::jsonb) || jsonb_build_object('attemptAt', ${at.toISOString()}::text, 'firstAttemptAt', coalesce(outcome->>'firstAttemptAt', ${at.toISOString()}::text))
    where id in (select id from call_reminders where status = 'scheduled' and scheduled_for <= now() order by scheduled_for limit ${limit} for update skip locked)
    returning id, user_id, artist_id, event_id, attempts, outcome->>'firstAttemptAt' as first_attempt_at`);
  return r.rows as unknown as Claimed[];
}

export type CallsJobResult = { ok: true; skipped?: "disabled"; placed?: number; cancelled?: number; retried?: number; errors?: string[] };

/** Places due reminder calls. With the flag off it returns immediately: no DB claim, no provider request. */
export async function runCallsJob(db: Db, opts: { now?: Date; provider?: CallProvider; limit?: number } = {}): Promise<CallsJobResult> {
  if (!voiceCallsEnabled()) return { ok: true, skipped: "disabled" };
  const now = opts.now ?? new Date();
  const provider = opts.provider ?? getProvider();
  const errors: string[] = [];
  let placed = 0;
  let cancelled = 0;
  let retried = 0;

  // Calls whose webhook never arrived: treat as failed so the retry rules apply.
  const stale = await db.execute(sql`
    select c.id, c.attempts, c.outcome->>'firstAttemptAt' as first_attempt_at, e.sale_opens_at
    from call_reminders c join events e on e.id = c.event_id
    where c.status = 'calling' and (c.outcome->>'attemptAt')::timestamptz < now() - ${`${STALE_CALLING_MS / 1000} seconds`}::interval limit 20`);
  for (const s of stale.rows as { id: string; attempts: number; first_attempt_at: string | null; sale_opens_at: string | Date | null }[]) {
    await settleAttempt(db, { id: s.id, attempts: s.attempts, firstAttemptAt: s.first_attempt_at, saleOpensAt: s.sale_opens_at ? new Date(s.sale_opens_at) : null }, "failed", now);
    retried++;
  }

  for (const c of await claimDue(db, opts.limit ?? 10, now)) {
    const cancel = async (reason: string) => {
      await db.update(callReminders).set({ status: "cancelled", outcome: sql`coalesce(${callReminders.outcome}, '{}'::jsonb) || ${JSON.stringify({ reason })}::jsonb` }).where(eq(callReminders.id, c.id));
      cancelled++;
    };
    try {
      const [row] = await db
        .select({ name: schema.users.name, phone: schema.users.phoneE164, consent: schema.users.phoneConsentAt, disabled: schema.users.disabledAt, artist: schema.artists.name, saleOpensAt: schema.events.saleOpensAt, status: schema.events.status, city: schema.events.city, date: schema.events.eventDate, callMe: schema.userArtists.callMe, hidden: sql<boolean>`(${schema.artists.isDeceased} or ${schema.artists.inactiveReason} is not null)` })
        .from(schema.users)
        .innerJoin(schema.userArtists, and(eq(schema.userArtists.userId, schema.users.id), eq(schema.userArtists.artistId, c.artist_id)))
        .innerJoin(schema.artists, eq(schema.artists.id, c.artist_id))
        .innerJoin(schema.events, eq(schema.events.id, c.event_id))
        .where(eq(schema.users.id, c.user_id));
      if (!row || !row.phone || !row.consent || row.disabled || !row.callMe || row.hidden) { await cancel("no_consent"); continue; }
      if (row.status === "cancelled" || !row.saleOpensAt) { await cancel("event_cancelled"); continue; }
      if (now.getTime() > row.saleOpensAt.getTime() + GO_LIVE_GRACE_MS) { await cancel("too_late"); continue; }
      if (!inCallWindow(now)) {
        // Quiet hours: put it back for the next window without using up an attempt.
        await db.update(callReminders).set({ status: "scheduled", attempts: c.attempts - 1, scheduledFor: clampToCallWindow(now) }).where(eq(callReminders.id, c.id));
        continue;
      }
      const { providerCallId } = await provider.placeCall({
        reminderId: c.id,
        to: row.phone,
        firstName: (row.name ?? "").split(" ")[0] || "there",
        artist: row.artist,
        city: row.city ? displayCity(row.city) : "your city",
        date: showDate(row.date),
        goLive: spoken(row.saleOpensAt, now),
      });
      await db.update(callReminders).set({ providerCallId }).where(eq(callReminders.id, c.id));
      placed++;
      await track("call_placed", c.user_id, { artistId: c.artist_id, eventId: c.event_id, attempt: c.attempts });
    } catch (e) {
      errors.push(e instanceof Error ? e.message.slice(0, 80) : "call failed");
      await settleAttempt(db, { id: c.id, attempts: c.attempts, firstAttemptAt: c.first_attempt_at, saleOpensAt: null }, "failed", now).catch(() => {});
    }
  }
  return { ok: true, placed, cancelled, retried, errors };
}
