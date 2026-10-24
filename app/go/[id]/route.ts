import { after, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { track } from "@/lib/activity";
import { getDb, schema } from "@/lib/db";
import { verifyBatch } from "@/lib/brain/process";
import { ticketLinkOf } from "@/lib/links/display";

export const maxDuration = 30;
const DAY = 24 * 3600 * 1000;

// Ticket click tracker. Never adds a wrong destination: only a verified exact link is redirected to
// (re-checked first when the last check is older than a day); otherwise the event page, which lists every source.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin), 302);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return to("/");
  const db = getDb();
  let [e] = await db.select().from(schema.events).where(eq(schema.events.id, id));
  if (!e) return to("/");
  if (e.ticketUrl && (!e.ticketVerifiedAt || Date.now() - e.ticketVerifiedAt.getTime() > DAY)) {
    await verifyBatch(db, [id], { maxEvents: 1, timeMs: 12_000, revalidate: true }).catch(() => 0);
    [e] = await db.select().from(schema.events).where(eq(schema.events.id, id));
  }
  const link = e ? ticketLinkOf(e) : null;
  after(async () => {
    let userId = (await auth().catch(() => null))?.user?.id ?? null;
    const alertId = url.searchParams.get("a");
    if (!userId && alertId && /^[0-9a-f-]{36}$/i.test(alertId)) {
      const [a] = await db.select({ u: schema.alerts.userId }).from(schema.alerts).where(eq(schema.alerts.id, alertId));
      userId = a?.u ?? null;
    }
    await track("ticket_click", userId, { eventId: id, verified: !!link, src: url.searchParams.get("s") ?? "web" });
  });
  return link ? NextResponse.redirect(link, 302) : to(`/event/${id}`);
}
