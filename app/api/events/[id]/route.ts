import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/session";
import { loadEventCard } from "@/lib/notify/content";

// Public event facts (every event carries its sources).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const ev = await loadEventCard(getDb(), id).catch(() => null);
  return ev ? Response.json(ev) : Response.json({ error: "Not found" }, { status: 404 });
}

// "Not for me" from the dashboard (same effect as the Telegram button); `{ undo: true }` brings it back.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (!u) return unauthorized();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { undo?: boolean };
  const action = body.undo ? null : "dismissed";
  await u.db
    .insert(schema.alerts)
    .values({ userId: u.user.id, eventId: id, kind: "new_show", channel: "telegram", status: "dismissed", userAction: action })
    .onConflictDoUpdate({ target: [schema.alerts.userId, schema.alerts.eventId, schema.alerts.kind, schema.alerts.channel], set: { userAction: action } });
  // Mirror onto the email row if there is one, so every channel agrees.
  await u.db.update(schema.alerts).set({ userAction: action }).where(and(eq(schema.alerts.eventId, id), eq(schema.alerts.userId, u.user.id)));
  return Response.json({ ok: true });
}
