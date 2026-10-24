import { and, eq, or, sql } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";

/**
 * Item 1: a fan says the ticket link is wrong. Stop showing it immediately, remember that URL as a mismatch for this
 * event, and queue a fresh verification (with the grounded finder) by marking the event unchecked.
 */
export async function reportWrongLink(db: Db, eventId: string): Promise<boolean> {
  const [e] = await db.select().from(schema.events).where(eq(schema.events.id, eventId));
  if (!e) return false;
  if (e.ticketUrl) {
    await db
      .update(schema.eventSources)
      .set({ status: "mismatch", checkedAt: new Date() })
      .where(and(eq(schema.eventSources.eventId, eventId), or(eq(schema.eventSources.url, e.ticketUrl), eq(schema.eventSources.finalUrl, e.ticketUrl))));
  }
  await db
    .update(schema.events)
    .set({
      ticketUrl: null,
      ticketStatus: "unchecked",
      ticketCheckedAt: null,
      ticketVerifiedAt: null,
      ticketReportCount: sql`${schema.events.ticketReportCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(schema.events.id, eventId));
  return true;
}
