"use server";

import { after } from "next/server";
import { auth } from "@/auth";
import { track } from "@/lib/activity";
import { joinPlusWaitlist, startPlusCheckout, type CheckoutResult } from "@/lib/payments/checkout";
import { paymentsEnabled } from "@/lib/payments/flag";

export async function plusAction(): Promise<{ kind: "waitlisted" | "already" } | Exclude<CheckoutResult, { kind: "stub" }>> {
  const s = await auth();
  if (!s?.user?.id) throw new Error("unauthorized");
  const userId = s.user.id;
  after(() => track("plan_interest", userId, { plan: "plus", paymentsEnabled: paymentsEnabled() }));
  if (!paymentsEnabled()) {
    return { kind: (await joinPlusWaitlist(userId)) === "joined" ? "waitlisted" : "already" };
  }
  const r = await startPlusCheckout(userId);
  return r.kind === "stub" ? { kind: "error", message: "Payments are not enabled." } : r;
}
