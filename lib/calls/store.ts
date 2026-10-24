import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { callReminders, getDb, schema, type Db } from "@/lib/db";
import { visibleArtist } from "@/lib/identity/store";
import { displayCity } from "@/lib/util/city";
import { CALL_ME_MAX, LEAD_OPTIONS } from "./flag";
import { maskPhone, normalizePhone } from "./phone";
import { syncReminders } from "./schedule";

export { maskPhone };
export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Turn "Call me" on/off for one followed artist. Creates or cancels the reminders for their upcoming shows. */
export async function setCallMe(userId: string, artistId: string, on: boolean, db: Db = getDb()): Promise<Result<{ count: number; needsPhone: boolean }>> {
  const U = schema.userArtists;
  const [row] = await db.select({ callMe: U.callMe, priority: U.priority }).from(U).innerJoin(schema.artists, eq(schema.artists.id, U.artistId)).where(and(eq(U.userId, userId), eq(U.artistId, artistId), visibleArtist));
  if (!row) return { ok: false, error: "Follow this artist first" };
  if (on && !row.callMe) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(U).where(and(eq(U.userId, userId), eq(U.callMe, true)));
    if (n >= CALL_ME_MAX) return { ok: false, error: `Your call list is full (${CALL_ME_MAX}). Remove one first.` };
  }
  await db.update(U).set({ callMe: on }).where(and(eq(U.userId, userId), eq(U.artistId, artistId)));
  await syncReminders(db, { userId, artistId });
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(U).where(and(eq(U.userId, userId), eq(U.callMe, true)));
  const [u] = await db.select({ phone: schema.users.phoneE164, consent: schema.users.phoneConsentAt }).from(schema.users).where(eq(schema.users.id, userId));
  return { ok: true, count: n, needsPhone: !u?.phone || !u.consent };
}

/** Store the phone number (E.164, +91 default) and the moment of explicit consent. Empty input removes both. */
export async function savePhone(userId: string, input: string, consent: boolean, db: Db = getDb()): Promise<Result<{ masked: string }>> {
  const [u] = await db.select({ phone: schema.users.phoneE164, consentAt: schema.users.phoneConsentAt }).from(schema.users).where(eq(schema.users.id, userId));
  if (!u) return { ok: false, error: "Not signed in" };
  if (!input.trim()) {
    await db.update(schema.users).set({ phoneE164: null, phoneConsentAt: null }).where(eq(schema.users.id, userId));
    await syncReminders(db, { userId });
    return { ok: true, masked: "" };
  }
  const e164 = normalizePhone(input);
  if (!e164) return { ok: false, error: "Enter a valid mobile number, for example 98765 43210" };
  if (!consent) {
    // A number without consent is kept but never called.
    await db.update(schema.users).set({ phoneE164: e164, phoneConsentAt: null }).where(eq(schema.users.id, userId));
    await syncReminders(db, { userId });
    return { ok: true, masked: maskPhone(e164) };
  }
  const keep = u.phone === e164 && u.consentAt ? u.consentAt : new Date();
  await db.update(schema.users).set({ phoneE164: e164, phoneConsentAt: keep }).where(eq(schema.users.id, userId));
  await syncReminders(db, { userId });
  return { ok: true, masked: maskPhone(e164) };
}

/** Change consent for the number already on file (no number re-entry). */
export async function setConsent(userId: string, consent: boolean, db: Db = getDb()): Promise<Result<{ masked: string }>> {
  const [u] = await db.select({ phone: schema.users.phoneE164, consentAt: schema.users.phoneConsentAt }).from(schema.users).where(eq(schema.users.id, userId));
  if (!u?.phone) return { ok: false, error: "Enter your number first" };
  await db.update(schema.users).set({ phoneConsentAt: consent ? (u.consentAt ?? new Date()) : null }).where(eq(schema.users.id, userId));
  await syncReminders(db, { userId });
  return { ok: true, masked: maskPhone(u.phone) };
}

export async function setLead(userId: string, minutes: number, db: Db = getDb()): Promise<Result> {
  if (!LEAD_OPTIONS.some((o) => o.minutes === minutes)) return { ok: false, error: "Pick 15 minutes, 1 hour or 1 day" };
  await db.update(schema.userArtists).set({ callLeadMinutes: minutes }).where(eq(schema.userArtists.userId, userId));
  await syncReminders(db, { userId });
  return { ok: true };
}

/** Default suggestion: the user's top must-see artists (at most CALL_ME_MAX in total). */
export async function suggestCallList(userId: string, db: Db = getDb()): Promise<Result<{ added: number }>> {
  const U = schema.userArtists;
  const rows = await db
    .select({ artistId: U.artistId, callMe: U.callMe, up: schema.artists.upcomingCount })
    .from(U)
    .innerJoin(schema.artists, eq(schema.artists.id, U.artistId))
    .where(and(eq(U.userId, userId), eq(U.priority, "must_see"), visibleArtist))
    .orderBy(desc(schema.artists.upcomingCount), asc(schema.artists.name));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(U).where(and(eq(U.userId, userId), eq(U.callMe, true)));
  const room = Math.max(0, CALL_ME_MAX - n);
  const pick = rows.filter((r) => !r.callMe).slice(0, room).map((r) => r.artistId);
  if (pick.length) {
    await db.update(U).set({ callMe: true }).where(and(eq(U.userId, userId), inArray(U.artistId, pick)));
    await syncReminders(db, { userId });
  }
  return { ok: true, added: pick.length };
}

/** "Press 9" / STOP: clear call-me for one artist or for all, and cancel pending reminders. */
export async function optOut(userId: string, artistId: string | null, db: Db = getDb()): Promise<void> {
  const U = schema.userArtists;
  await db.update(U).set({ callMe: false }).where(and(eq(U.userId, userId), artistId ? eq(U.artistId, artistId) : undefined));
  await syncReminders(db, artistId ? { userId, artistId } : { userId });
}

export type CallMeArtist = { id: string; name: string; image: string | null; priority: string; callMe: boolean };
export type CallReminderView = { id: string; artistName: string; city: string | null; date: string | null; scheduledFor: string; status: string };
export type CallMeData = {
  phoneMasked: string;
  hasConsent: boolean;
  leadMinutes: number;
  artists: CallMeArtist[];
  reminders: CallReminderView[];
  suggestedIds: string[];
};

export async function getCallMeData(db: Db, userId: string): Promise<CallMeData> {
  const U = schema.userArtists;
  const [[u], artistRows, reminderRows] = await Promise.all([
    db.select({ phone: schema.users.phoneE164, consent: schema.users.phoneConsentAt }).from(schema.users).where(eq(schema.users.id, userId)),
    db
      .select({ id: schema.artists.id, name: schema.artists.name, image: schema.artists.imageUrl, priority: U.priority, callMe: U.callMe, lead: U.callLeadMinutes, up: schema.artists.upcomingCount })
      .from(U)
      .innerJoin(schema.artists, eq(schema.artists.id, U.artistId))
      .where(and(eq(U.userId, userId), ne(U.priority, "muted"), visibleArtist))
      .orderBy(asc(schema.artists.name)),
    db
      .select({ id: callReminders.id, status: callReminders.status, scheduledFor: callReminders.scheduledFor, artistName: schema.artists.name, city: schema.events.city, date: schema.events.eventDate })
      .from(callReminders)
      .innerJoin(schema.events, eq(schema.events.id, callReminders.eventId))
      .innerJoin(schema.artists, eq(schema.artists.id, callReminders.artistId))
      .where(and(eq(callReminders.userId, userId), ne(callReminders.status, "cancelled"), visibleArtist))
      .orderBy(desc(callReminders.scheduledFor))
      .limit(12),
  ]);
  const suggested = artistRows.filter((a) => a.priority === "must_see").sort((a, b) => b.up - a.up).slice(0, CALL_ME_MAX).map((a) => a.id);
  return {
    phoneMasked: maskPhone(u?.phone),
    hasConsent: !!u?.consent && !!u.phone,
    leadMinutes: artistRows.find((a) => a.callMe)?.lead ?? artistRows[0]?.lead ?? 60,
    artists: artistRows.map((a) => ({ id: a.id, name: a.name, image: a.image, priority: a.priority, callMe: a.callMe })),
    reminders: reminderRows.map((r) => ({ id: r.id, artistName: r.artistName, city: r.city ? displayCity(r.city) : null, date: r.date, scheduledFor: r.scheduledFor.toISOString(), status: r.status })),
    suggestedIds: suggested,
  };
}
