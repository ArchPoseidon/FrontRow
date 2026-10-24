import { and, desc, eq } from "drizzle-orm";
import { getDb, subscriptions, users } from "@/lib/db";
import { getCartLines } from "@/lib/merch/core";
import { PLANS } from "@/lib/plans";
import { paymentsEnabled } from "./flag";
import { createOrder } from "./pinelabs";

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const compact = (id: string) => id.replace(/-/g, "");

export type CheckoutResult =
  | { kind: "stub"; items: { sku: string; qty: number }[] }
  | { kind: "redirect"; url: string }
  | { kind: "error"; message: string };

/** Merch checkout. Flag off: no network call, just report interest. */
export async function startMerchCheckout(userId: string): Promise<CheckoutResult> {
  const lines = await getCartLines(userId);
  if (!lines.length) return { kind: "error", message: "Your cart is empty." };
  if (!paymentsEnabled()) return { kind: "stub", items: lines.map((l) => ({ sku: `${l.productId}-${l.size}`, qty: l.qty })) };
  try {
    const [u] = await getDb().select({ email: users.email, name: users.name }).from(users).where(eq(users.id, userId));
    const total = lines.reduce((s, l) => s + l.priceInr * l.qty, 0);
    const o = await createOrder({
      reference: `m_${compact(userId)}_${Date.now().toString(36)}`,
      amountInr: total,
      customerId: userId,
      email: u?.email,
      firstName: u?.name?.split(" ")[0],
      callbackUrl: `${appUrl()}/cart?paid=1`,
      failureCallbackUrl: `${appUrl()}/cart?paid=0`,
      notes: "merch",
      items: lines.map((l) => ({ id: `${l.productId}-${l.size}`, name: l.name, qty: l.qty, unitPriceInr: l.priceInr })),
    });
    return { kind: "redirect", url: o.redirectUrl };
  } catch (e) {
    console.error("merch checkout failed", e instanceof Error ? e.message : e);
    return { kind: "error", message: "Couldn't start checkout. Try again shortly." };
  }
}

/** Waitlist row for Plus (flag off). Idempotent per user. */
export async function joinPlusWaitlist(userId: string): Promise<"joined" | "already"> {
  const db = getDb();
  const [ex] = await db.select({ id: subscriptions.id }).from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.plan, "plus"), eq(subscriptions.status, "pending")));
  if (ex) return "already";
  await db.insert(subscriptions).values({ userId, plan: "plus", status: "pending", amountInr: 0 });
  return "joined";
}

export async function startPlusCheckout(userId: string): Promise<CheckoutResult> {
  if (!paymentsEnabled()) return { kind: "error", message: "Payments are not enabled." };
  const price = PLANS.plus.priceInr;
  if (price <= 0) return { kind: "error", message: "Plus isn't priced yet." };
  try {
    const db = getDb();
    const [u] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, userId));
    const [sub] = await db.insert(subscriptions).values({ userId, plan: "plus", status: "pending", amountInr: price }).returning({ id: subscriptions.id });
    const o = await createOrder({
      reference: `s_${compact(sub.id)}`,
      amountInr: price,
      customerId: userId,
      email: u?.email,
      firstName: u?.name?.split(" ")[0],
      callbackUrl: `${appUrl()}/plans?paid=1`,
      failureCallbackUrl: `${appUrl()}/plans?paid=0`,
      notes: "plus",
      items: [{ id: "plus", name: "FrontRow Plus", qty: 1, unitPriceInr: price }],
    });
    if (o.orderId) await db.update(subscriptions).set({ pinelabsOrderId: o.orderId }).where(eq(subscriptions.id, sub.id));
    return { kind: "redirect", url: o.redirectUrl };
  } catch (e) {
    console.error("plus checkout failed", e instanceof Error ? e.message : e);
    return { kind: "error", message: "Couldn't start checkout. Try again shortly." };
  }
}

export async function currentBilling(userId: string): Promise<{ plan: string; status: string | null }> {
  const db = getDb();
  const [u] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, userId));
  const [s] = await db.select({ status: subscriptions.status }).from(subscriptions)
    .where(eq(subscriptions.userId, userId)).orderBy(desc(subscriptions.createdAt)).limit(1);
  return { plan: u?.plan ?? "free", status: s?.status ?? null };
}
