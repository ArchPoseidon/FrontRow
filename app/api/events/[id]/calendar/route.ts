import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { schema } from "@/lib/db";
import { requireApiUser, unauthorized } from "@/lib/session";
import { addToGoogleCalendar, calendarAccess, removeFromGoogleCalendar } from "@/lib/gcal";
import { track } from "@/lib/activity";

const UUID = /^[0-9a-f-]{36}$/i;

// Add to calendar: always lands in the FrontRow calendar; also in Google Calendar when it is connected.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireApiUser();
  if (!u) return unauthorized();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const [ev] = await u.db.select({ d: schema.events.eventDate }).from(schema.events).where(eq(schema.events.id, id));
  if (!ev) return Response.json({ error: "Not found" }, { status: 404 });
  if (!ev.d) return Response.json({ error: "This show has no date yet, so there's nothing to add." }, { status: 409 });

  // The in-app calendar entry is the base and always lands. Google is a bonus that can fail for a specific reason.
  const g = await addToGoogleCalendar(u.db, u.user.id, id);
  await u.db
    .insert(schema.calendarEntries)
    .values({ userId: u.user.id, eventId: id, googleEventId: g.ok ? g.googleEventId : null })
    .onConflictDoUpdate({ target: [schema.calendarEntries.userId, schema.calendarEntries.eventId], set: { googleEventId: g.ok ? g.googleEventId : null } });
  after(() => track("calendar_add", u.user.id, { via: g.ok ? "google" : "in_app" }));
  // reason (when google is false): not_connected | token_expired | google_error | no_date. The UI offers .ics / template link for every one.
  return Response.json({ ok: true, google: g.ok, reason: g.ok ? null : g.reason, needsConnect: !g.ok && g.reason === "not_connected", needsReconnect: !g.ok && g.reason === "token_expired", googleError: !g.ok && g.reason === "google_error" });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireApiUser();
  if (!u) return unauthorized();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const [row] = await u.db.select().from(schema.calendarEntries).where(and(eq(schema.calendarEntries.userId, u.user.id), eq(schema.calendarEntries.eventId, id)));
  // Remove from Google first; if that fails the in-app entry still goes, and the UI says the Google copy is still there.
  const g = row?.googleEventId ? await removeFromGoogleCalendar(u.db, u.user.id, row.googleEventId) : null;
  await u.db.delete(schema.calendarEntries).where(and(eq(schema.calendarEntries.userId, u.user.id), eq(schema.calendarEntries.eventId, id)));
  return Response.json({ ok: true, googleRemoved: g ? g.ok : null, reason: g && !g.ok ? g.reason : null });
}

export async function GET() {
  const u = await requireApiUser();
  if (!u) return unauthorized();
  const c = await calendarAccess(u.db, u.user.id);
  return Response.json({ connected: c.ok, reason: c.ok ? null : c.reason });
}
