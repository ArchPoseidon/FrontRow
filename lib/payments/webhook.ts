import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, paymentEvents, subscriptions, users } from "@/lib/db";
import { clearCart } from "@/lib/merch/core";

/**
 * Pine Labs webhook verification: HMAC-SHA256 over `${webhook-id}.${webhook-timestamp}.${rawBody}`,
 * key = base64-decoded secret, signature header = "v1,<base64>" (possibly several, space separated).
 */
export function verifySignature(opts: { id: string; timestamp: string; body: string; signature: string; secret: string; nowMs?: number }): boolean {
  const ts = Number(opts.timestamp);
  if (!Number.isFinite(ts) || Math.abs((opts.nowMs ?? Date.now()) / 1000 - ts) > 300) return false;
  const expected = createHmac("sha256", Buffer.from(opts.secret, "base64"))
    .update(`${opts.id}.${opts.timestamp}.${opts.body}`).digest();
  for (const part of opts.signature.split(" ")) {
    const [ver, sig] = part.split(",");
    if (ver !== "v1" || !sig) continue;
    const got = Buffer.from(sig, "base64");
    if (got.length === expected.length && timingSafeEqual(got, expected)) return true;
  }
  return false;
}

type Outcome = "paid" | "failed" | "ignore";

export function classify(body: unknown): { outcome: Outcome; reference: string | null; orderId: string | null } {
  const b = (body ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const d = b.data ?? {};
  const text = [b.event_type, b.type, d.status, d.order_status, d.order?.status].filter((x) => typeof x === "string").join(" ").toUpperCase();
  const outcome: Outcome = /FAIL|CANCEL/.test(text) ? "failed" : /PROCESSED|AUTHORIZED|CAPTURED|PAID|SUCCESS/.test(text) ? "paid" : "ignore";
  const reference = d.merchant_order_reference ?? d.order?.merchant_order_reference ?? b.merchant_order_reference ?? null;
  const orderId = d.order_id ?? d.order?.order_id ?? b.order_id ?? null;
  return { outcome, reference: typeof reference === "string" ? reference : null, orderId: typeof orderId === "string" ? orderId : null };
}

const expand = (c: string) => `${c.slice(0, 8)}-${c.slice(8, 12)}-${c.slice(12, 16)}-${c.slice(16, 20)}-${c.slice(20)}`;

/** Returns false when the event id was already processed (idempotent). Throws to let Pine Labs retry. */
export async function applyEvent(eventId: string, payload: unknown): Promise<boolean> {
  const db = getDb();
  const ins = await db.insert(paymentEvents).values({ provider: "pinelabs", eventId, payload: payload as object })
    .onConflictDoNothing({ target: paymentEvents.eventId }).returning({ id: paymentEvents.id });
  if (!ins.length) return false;
  try {
    const { outcome, reference, orderId } = classify(payload);
    if (outcome === "ignore") return true;
    if (reference?.startsWith("s_") && /^s_[0-9a-f]{32}$/.test(reference)) {
      const subId = expand(reference.slice(2));
      const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, subId));
      if (sub) {
        if (outcome === "paid") {
          await db.update(subscriptions).set({ status: "active", pinelabsOrderId: orderId ?? sub.pinelabsOrderId, currentPeriodEnd: new Date(Date.now() + 30 * 86400_000) }).where(eq(subscriptions.id, sub.id));
          await db.update(users).set({ plan: sub.plan }).where(eq(users.id, sub.userId));
        } else if (sub.status !== "active") {
          await db.update(subscriptions).set({ status: "failed" }).where(and(eq(subscriptions.id, sub.id)));
        }
      }
    } else if (reference && /^m_[0-9a-f]{32}_/.test(reference) && outcome === "paid") {
      const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, expand(reference.slice(2, 34))));
      if (u) await clearCart(u.id); // merch orders aren't persisted yet (no orders table)
    }
    return true;
  } catch (e) {
    await db.delete(paymentEvents).where(eq(paymentEvents.eventId, eventId)); // allow retry
    throw e;
  }
}
