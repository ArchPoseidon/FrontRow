import { Suspense } from "react";
import Link from "next/link";
import { auth } from "@/auth";
import { currentBilling } from "@/lib/payments/checkout";
import { paymentsEnabled } from "@/lib/payments/flag";
import { PLANS } from "@/lib/plans";
import { PlusButton } from "@/components/merch/PlusButton";

async function Body({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [session, sp] = await Promise.all([auth(), searchParams]);
  const billing = session?.user?.id ? await currentBilling(session.user.id) : null;
  const enabled = paymentsEnabled();
  const plusPrice = PLANS.plus.priceInr;
  const card = "rounded-2xl bg-[var(--ink-2)] p-5 ring-1 ring-white/10";
  return (
    <>
      {sp.paid === "1" && <p className="mt-3 rounded-xl bg-white/5 p-3 text-sm" role="status">Thanks! Your payment is being confirmed. Plus switches on in a minute.</p>}
      {sp.paid === "0" && <p className="mt-3 rounded-xl bg-white/5 p-3 text-sm" role="status">Payment didn&apos;t go through. You&apos;re still on Free.</p>}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <section className={card}>
          <h2 className="font-display text-3xl uppercase tracking-wide">{PLANS.free.name}</h2>
          <p className="font-display text-2xl text-muted">₹0</p>
          <ul className="mt-3 space-y-1.5 text-sm">{PLANS.free.features.map((f) => <li key={f}>✓ {f}</li>)}</ul>
          <Link href="/radar" className="mt-5 block rounded-full bg-white/10 px-6 py-3 text-center font-medium">
            Continue free
          </Link>
          {billing?.plan === "free" && <p className="mt-2 text-center text-xs text-muted">Your current plan</p>}
        </section>
        <section className={`${card} ring-[var(--magenta)]/60`}>
          <h2 className="font-display text-3xl uppercase tracking-wide">{PLANS.plus.name}</h2>
          {enabled && plusPrice > 0 && <p className="font-display text-2xl">₹{plusPrice}<span className="text-sm text-muted"> / month</span></p>}
          <ul className="mt-3 space-y-1.5 text-sm">{PLANS.plus.features.map((f) => <li key={f}>✓ {f}</li>)}</ul>
          <div className="mt-5">
            {billing?.plan === "plus" ? (
              <p className="text-center text-sm text-muted">You&apos;re on Plus.</p>
            ) : session?.user?.id ? (
              <PlusButton paymentsEnabled={enabled} priceInr={plusPrice} />
            ) : (
              <p className="text-center text-sm text-muted">Sign in to join.</p>
            )}
          </div>
        </section>
      </div>
      {!enabled && <p className="mt-4 text-center text-xs text-muted">Everything works free for now. Nothing is charged.</p>}
    </>
  );
}

export default function PlansPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-4 pb-24 pt-6">
      <h1 className="font-display text-4xl uppercase tracking-wide">Choose your plan</h1>
      <p className="text-sm text-muted">You can change this any time.</p>
      <Suspense fallback={<p className="mt-6 text-muted">Loading…</p>}>
        <Body searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
