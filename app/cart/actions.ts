"use server";

import { after } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { track } from "@/lib/activity";
import { addToCart, getCartLines, removeFromCart, setCartQty } from "@/lib/merch/core";
import { startMerchCheckout } from "@/lib/payments/checkout";

const Id = z.uuid();

async function uid() {
  const s = await auth();
  if (!s?.user?.id) throw new Error("unauthorized");
  return s.user.id;
}

export async function addToCartAction(variantId: string, qty = 1): Promise<{ ok: boolean }> {
  const userId = await uid();
  const id = Id.parse(variantId);
  const ok = await addToCart(userId, id, z.number().int().min(1).max(10).parse(qty));
  if (ok) after(() => track("cart_add", userId, { variantId: id, qty }));
  return { ok };
}

export async function setQtyAction(variantId: string, qty: number): Promise<void> {
  const userId = await uid();
  await setCartQty(userId, Id.parse(variantId), z.number().int().min(0).max(10).parse(qty));
}

export async function removeFromCartAction(variantId: string): Promise<void> {
  const userId = await uid();
  await removeFromCart(userId, Id.parse(variantId));
}

export type CheckoutState = { kind: "stub" } | { kind: "redirect"; url: string } | { kind: "error"; message: string };

export async function checkoutAction(): Promise<CheckoutState> {
  const userId = await uid();
  const r = await startMerchCheckout(userId);
  if (r.kind === "stub") {
    after(() => track("checkout_interest", userId, { items: r.items }));
    return { kind: "stub" };
  }
  return r;
}

/** Signed-in "has cart" count helper for the cart badge (cheap). */
export async function cartCountAction(): Promise<number> {
  const userId = await uid();
  return (await getCartLines(userId)).reduce((n, l) => n + l.qty, 0);
}
