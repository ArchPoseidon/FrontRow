import { and, eq, inArray, isNotNull, ne, or, sql, gte, isNull, gt } from "drizzle-orm";
import { callReminders, schema, type Db } from "@/lib/db";
import { visibleArtist } from "@/lib/identity/store";
import { todayIST } from "@/lib/util/ist";
import { clampToCallWindow, inCallWindow } from "./window";

export const GO_LIVE_GRACE_MS = 3600_000; // never call more than an hour after tickets went live

type Scope = { eventId?: string; userId?: string; artistId?: string };

/** The instant a reminder should ring: go-live minus the lead, pushed into 09:00-21:00 IST. */
export function reminderTime(saleOpensAt: Date, leadMinutes: number, now = new Date()): Date {
  const ideal = new Date(Math.max(saleOpensAt.getTime() - leadMinutes * 60_000, now.getTime()));
  const t = clampToCallWindow(ideal, saleOpensAt);
  return t.getTime() < now.getTime() ? clampToCallWindow(now) : t;
}

/**
 * Reconcile call_reminders with what should exist for the scope: create/update rows for users who have
 * call-me on for the event's artist, a phone and recorded consent; cancel scheduled rows that no longer qualify
 * (call-me off, consent withdrawn, muted, show cancelled/past, user dismissed it). Never revives a row that was
 * already attempted, so nobody is called twice for the same show.
 */
export async function syncReminders(db: Db, scope: Scope, now = new Date()): Promise<{ scheduled: number; cancelled: number }> {
  const E = schema.events;
  const events = await db
    .select({ id: E.id, artistId: E.artistId, saleOpensAt: E.saleOpensAt })
    .from(E)
    .innerJoin(schema.artists, eq(schema.artists.id, E.artistId))
    .where(
      and(
        visibleArtist,
        ne(E.status, "cancelled"),
        eq(E.isSample, false),
        isNotNull(E.saleOpensAt),
        gt(E.saleOpensAt, new Date(now.getTime() - GO_LIVE_GRACE_MS)),
        or(isNull(E.eventDate), gte(E.eventDate, todayIST(now))),
        scope.eventId ? eq(E.id, scope.eventId) : undefined,
        scope.artistId ? eq(E.artistId, scope.artistId) : undefined,
      ),
    );
  const desired = new Map<string, { userId: string; artistId: string; eventId: string; scheduledFor: Date }>();
  if (events.length) {
    const U = schema.userArtists;
    const eligible = await db
      .select({ userId: U.userId, artistId: U.artistId, lead: U.callLeadMinutes })
      .from(U)
      .innerJoin(schema.users, eq(schema.users.id, U.userId))
      .where(
        and(
          eq(U.callMe, true),
          ne(U.priority, "muted"),
          isNotNull(schema.users.phoneE164),
          isNotNull(schema.users.phoneConsentAt),
          isNull(schema.users.disabledAt),
          inArray(U.artistId, [...new Set(events.map((e) => e.artistId))]),
          scope.userId ? eq(U.userId, scope.userId) : undefined,
        ),
      );
    if (eligible.length) {
      const dismissed = await db
        .select({ userId: schema.alerts.userId, eventId: schema.alerts.eventId })
        .from(schema.alerts)
        .where(and(eq(schema.alerts.userAction, "dismissed"), inArray(schema.alerts.eventId, events.map((e) => e.id)), inArray(schema.alerts.userId, [...new Set(eligible.map((x) => x.userId))])));
      const dis = new Set(dismissed.map((d) => `${d.userId}:${d.eventId}`));
      for (const e of events) {
        for (const u of eligible) {
          if (u.artistId !== e.artistId || dis.has(`${u.userId}:${e.id}`)) continue;
          desired.set(`${u.userId}:${e.id}`, { userId: u.userId, artistId: e.artistId, eventId: e.id, scheduledFor: reminderTime(e.saleOpensAt!, u.lead, now) });
        }
      }
    }
  }

  const existing = await db
    .select({ id: callReminders.id, userId: callReminders.userId, eventId: callReminders.eventId })
    .from(callReminders)
    .where(
      and(
        eq(callReminders.status, "scheduled"),
        scope.eventId ? eq(callReminders.eventId, scope.eventId) : undefined,
        scope.userId ? eq(callReminders.userId, scope.userId) : undefined,
        scope.artistId ? eq(callReminders.artistId, scope.artistId) : undefined,
      ),
    );
  const stale = existing.filter((r) => !desired.has(`${r.userId}:${r.eventId}`)).map((r) => r.id);
  if (stale.length) {
    await db
      .update(callReminders)
      .set({ status: "cancelled", outcome: sql`coalesce(${callReminders.outcome}, '{}'::jsonb) || '{"cancelled":true}'::jsonb` })
      .where(and(inArray(callReminders.id, stale), eq(callReminders.status, "scheduled")));
  }
  const rows = [...desired.values()];
  for (let i = 0; i < rows.length; i += 100) {
    await db
      .insert(callReminders)
      .values(rows.slice(i, i + 100).map((r) => ({ ...r, status: "scheduled" })))
      .onConflictDoUpdate({
        target: [callReminders.userId, callReminders.eventId],
        set: { scheduledFor: sql`excluded.scheduled_for`, artistId: sql`excluded.artist_id`, status: "scheduled", outcome: null },
        setWhere: and(inArray(callReminders.status, ["scheduled", "cancelled"]), eq(callReminders.attempts, 0)),
      });
  }
  return { scheduled: rows.length, cancelled: stale.length };
}

export const scheduleForEvent = (db: Db, eventId: string, now?: Date) => syncReminders(db, { eventId }, now);
export { inCallWindow };
