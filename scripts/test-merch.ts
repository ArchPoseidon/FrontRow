import { config } from "dotenv";
config({ path: ".env.local" });
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { Filters } from "../lib/merch/core";

async function main() {
  process.env.PAYMENTS_ENABLED = "false";
  let fetches = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    if (/pinelabs|pinepg|pluralpay|pluralonline/i.test(url)) { fetches++; throw new Error("Pine Labs call blocked in test"); }
    return realFetch(input, init); // DB (Neon) goes over fetch
  }) as typeof fetch;

  const { getDb, artists, users, subscriptions, paymentEvents, cartItems, merchVariants } = await import("../lib/db");
  const core = await import("../lib/merch/core");
  const { startMerchCheckout, joinPlusWaitlist, startPlusCheckout } = await import("../lib/payments/checkout");
  const { createOrder } = await import("../lib/payments/pinelabs");
  const { applyEvent, verifySignature } = await import("../lib/payments/webhook");
  const { eq } = await import("drizzle-orm");
  const db = getDb();

  const [pk] = await db.select({ id: artists.id }).from(artists).where(eq(artists.normalizedName, "prateek kuhad"));
  const [aj] = await db.select({ id: artists.id }).from(artists).where(eq(artists.normalizedName, "anuv jain"));
  assert.ok(pk && aj, "artists exist (run seed-merch first)");
  const ids = (r: { id: string }[]) => r.map((x) => x.id).sort();
  const F = (o: Partial<Filters> = {}): Filters => ({ artists: [], min: null, max: null, sizes: [], sort: "newest", ...o });

  // 1. filters
  assert.deepEqual(ids(await core.listProducts(F())), ["aj-poster", "aj-tee", "aj-tote", "pk-hoodie", "pk-poster", "pk-tee"]);
  assert.deepEqual(ids(await core.listProducts(F({ artists: [pk.id] }))), ["pk-hoodie", "pk-poster", "pk-tee"]);
  assert.deepEqual(ids(await core.listProducts(F({ artists: [pk.id], min: 1000, max: 2000 }))), ["pk-tee"]);
  assert.deepEqual(ids(await core.listProducts(F({ artists: [pk.id], sizes: ["XL"] }))), ["pk-hoodie"]); // pk-tee XL stock 0
  assert.deepEqual(ids(await core.listProducts(F({ sizes: ["Free"], max: 600 }))), ["pk-poster"]); // aj-poster out of stock
  assert.deepEqual((await core.listProducts(F({ sort: "price_asc" }))).map((p) => p.priceInr), [499, 599, 799, 1299, 1499, 2999]);
  assert.deepEqual((await core.listProducts(F({ sort: "price_desc" }))).map((p) => p.priceInr), [2999, 1499, 1299, 799, 599, 499]);
  const pf = core.parseFilters({ artist: `${pk.id},nope`, min: "100", size: "M,ZZ", sort: "price_asc" });
  assert.deepEqual(pf, { artists: [pk.id], min: 100, max: null, sizes: ["M"], sort: "price_asc" });
  console.log("ok filters");

  // 2. cart
  const [u] = await db.insert(users).values({ name: "Merch Test", email: "merchtest@frontrow.test" }).onConflictDoUpdate({ target: users.email, set: { name: "Merch Test" } }).returning({ id: users.id });
  await db.delete(cartItems).where(eq(cartItems.userId, u.id));
  const detail = (await core.getProductDetail("pk-tee"))!;
  const vM = detail.variants.find((v) => v.size === "M")!;
  const vXL = detail.variants.find((v) => v.size === "XL")!;
  assert.equal(await core.addToCart(u.id, vXL.id), false, "out-of-stock refused");
  assert.equal(await core.addToCart(u.id, vM.id), true);
  await core.addToCart(u.id, vM.id);
  const lines = await core.getCartLines(u.id);
  assert.equal(lines.length, 1); assert.equal(lines[0].qty, 2);
  await core.setCartQty(u.id, vM.id, 3);
  assert.equal((await core.getCartLines(u.id))[0].qty, 3);
  await core.removeFromCart(u.id, vM.id);
  assert.equal((await core.getCartLines(u.id)).length, 0);
  console.log("ok cart");

  // 3. deceased exclusion
  await db.update(artists).set({ isDeceased: true }).where(eq(artists.id, aj.id));
  try {
    assert.deepEqual(ids(await core.listProducts(F())), ["pk-hoodie", "pk-poster", "pk-tee"]);
    assert.equal(await core.getProductDetail("aj-tee"), null);
    assert.ok(!(await core.artistOptions()).some((a) => a.id === aj.id));
  } finally {
    await db.update(artists).set({ isDeceased: false }).where(eq(artists.id, aj.id));
  }
  await db.update(artists).set({ inactiveReason: "disbanded" }).where(eq(artists.id, aj.id));
  try {
    assert.deepEqual(ids(await core.listProducts(F({ artists: [aj.id] }))), []);
  } finally {
    await db.update(artists).set({ inactiveReason: null }).where(eq(artists.id, aj.id));
  }
  assert.equal((await core.listProducts(F({ artists: [aj.id] }))).length, 3);
  console.log("ok deceased exclusion");

  // 4. flag off: no Pine Labs fetch
  await core.addToCart(u.id, vM.id);
  const r = await startMerchCheckout(u.id);
  assert.equal(r.kind, "stub");
  assert.equal(await joinPlusWaitlist(u.id), "joined");
  assert.equal(await joinPlusWaitlist(u.id), "already");
  assert.equal((await startPlusCheckout(u.id)).kind, "error");
  await assert.rejects(() => createOrder({ reference: "x", amountInr: 1, customerId: "x", callbackUrl: "", failureCallbackUrl: "", items: [] }), /disabled/);
  assert.equal(fetches, 0, "no network calls with flag off");
  console.log("ok flag off, fetch calls:", fetches);

  // 5. webhook: signature + idempotency + plan flip
  const secret = Buffer.from("test-secret").toString("base64");
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, u.id));
  const ref = `s_${sub.id.replace(/-/g, "")}`;
  const body = JSON.stringify({ event_type: "ORDER_PROCESSED", data: { order_id: "v1-test-1", merchant_order_reference: ref, status: "PROCESSED" } });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = "v1," + createHmac("sha256", Buffer.from(secret, "base64")).update(`evt1.${ts}.${body}`).digest("base64");
  assert.ok(verifySignature({ id: "evt1", timestamp: ts, body, signature: sig, secret }));
  assert.ok(!verifySignature({ id: "evt1", timestamp: ts, body: body + " ", signature: sig, secret }));
  assert.ok(!verifySignature({ id: "evt1", timestamp: String(Number(ts) - 1000), body, signature: sig, secret }));
  const eid = `test-${Date.now()}`;
  assert.equal(await applyEvent(eid, JSON.parse(body)), true);
  assert.equal(await applyEvent(eid, JSON.parse(body)), false, "duplicate ignored");
  const [after] = await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
  const [uu] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, u.id));
  assert.equal(after.status, "active"); assert.equal(uu.plan, "plus");
  await db.delete(paymentEvents).where(eq(paymentEvents.eventId, eid));
  console.log("ok webhook");

  // cleanup
  await db.delete(users).where(eq(users.id, u.id));
  void merchVariants;
  console.log("ALL PASSED");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
