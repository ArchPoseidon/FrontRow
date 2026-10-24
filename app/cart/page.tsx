import { Suspense } from "react";
import Link from "next/link";
import { auth } from "@/auth";
import { getCartLines } from "@/lib/merch/core";
import { paymentsEnabled } from "@/lib/payments/flag";
import { CartView } from "@/components/merch/CartView";

async function Body({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [session, sp] = await Promise.all([auth(), searchParams]);
  const userId = session?.user?.id;
  const lines = userId ? await getCartLines(userId) : [];
  return (
    <>
      {sp.paid === "1" && <p className="mt-3 rounded-xl bg-white/5 p-3 text-sm" role="status">Thanks! Your payment is being confirmed — we&apos;ll message you.</p>}
      {sp.paid === "0" && <p className="mt-3 rounded-xl bg-white/5 p-3 text-sm" role="status">Payment didn&apos;t go through. Your cart is still here.</p>}
      <CartView signedIn={!!userId} lines={lines} paymentsEnabled={paymentsEnabled()} />
    </>
  );
}

export default function CartPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 pb-24 pt-6">
      <Link href="/merch" className="text-sm text-muted">← Merch</Link>
      <h1 className="mt-2 font-display text-4xl uppercase tracking-wide">Cart</h1>
      <p className="text-xs uppercase tracking-wider text-muted">Demo store</p>
      <Suspense fallback={<p className="mt-6 text-muted">Loading…</p>}>
        <Body searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
