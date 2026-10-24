import Link from "next/link";
import { currentBilling } from "@/lib/payments/checkout";
import { paymentsEnabled } from "@/lib/payments/flag";
import { PLANS } from "@/lib/plans";

/** Async server component: render inside <Suspense> (reads the DB). */
export async function BillingCard({ userId }: { userId: string }) {
  const { plan, status } = await currentBilling(userId);
  const name = plan === "plus" ? PLANS.plus.name : PLANS.free.name;
  const label = status === "pending" ? "Waitlisted for Plus" : status === "active" ? "Active" : status === "failed" ? "Payment failed" : status === "cancelled" ? "Cancelled" : "No charges";
  return (
    <section className="rounded-2xl bg-[var(--ink-2)] p-4 ring-1 ring-white/10">
      <h2 className="font-display text-2xl uppercase tracking-wide">Billing</h2>
      <p className="mt-2 text-sm">Current plan: <strong>{name}</strong></p>
      <p className="text-sm text-muted">Status: {label}</p>
      <div className="mt-3 flex gap-2">
        {paymentsEnabled() ? (
          <Link href="/plans" className="rounded-full bg-white/10 px-4 py-2 text-sm">Manage</Link>
        ) : (
          <button disabled className="cursor-not-allowed rounded-full bg-white/10 px-4 py-2 text-sm opacity-50" title="Payments open soon">Manage</button>
        )}
        <Link href="/plans" className="px-2 py-2 text-sm text-muted underline">See plans</Link>
      </div>
    </section>
  );
}
