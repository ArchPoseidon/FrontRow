"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { checkoutAction, removeFromCartAction, setQtyAction } from "@/app/cart/actions";
import { localSetQty, useLocalCart, type LocalLine } from "./localCart";
import { inr } from "./ProductCard";

export function CartView({ signedIn, lines: serverLines, paymentsEnabled }: { signedIn: boolean; lines: LocalLine[]; paymentsEnabled: boolean }) {
  const router = useRouter();
  const local = useLocalCart();
  const lines = signedIn ? serverLines : local;
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const total = lines.reduce((s, l) => s + l.priceInr * l.qty, 0);

  function setQty(l: LocalLine, qty: number) {
    if (!signedIn) return localSetQty(l.variantId, qty);
    start(async () => {
      await (qty <= 0 ? removeFromCartAction(l.variantId) : setQtyAction(l.variantId, qty));
      router.refresh();
    });
  }
  function checkout() {
    setNote(null);
    start(async () => {
      try {
        const r = await checkoutAction();
        if (r.kind === "redirect") window.location.href = r.url;
        else if (r.kind === "stub") setNote("Checkout opens soon — we'll message you.");
        else setNote(r.message);
      } catch {
        setNote("Couldn't start checkout. Try again.");
      }
    });
  }

  if (!lines.length) {
    return (
      <div className="mt-10 text-center">
        <p className="text-muted">Your cart is empty.</p>
        <Link href="/merch" className="mt-4 inline-block rounded-full bg-white/10 px-5 py-2.5 text-sm">Browse merch</Link>
      </div>
    );
  }
  return (
    <div className={pending ? "opacity-70 transition" : "transition"}>
      <ul className="mt-4 space-y-3">
        {lines.map((l) => (
          <li key={l.variantId} className="flex gap-3 rounded-2xl bg-[var(--ink-2)] p-3 ring-1 ring-white/10">
            {l.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={l.image} alt="" className="size-20 shrink-0 rounded-xl object-cover" />
            ) : <div className="size-20 shrink-0 rounded-xl bg-white/5" />}
            <div className="min-w-0 flex-1">
              <Link href={`/merch/${l.productId}`} className="block truncate text-sm font-medium">{l.name}</Link>
              <p className="truncate text-xs text-muted">{l.artistName}{l.size ? ` · ${l.size}` : ""}</p>
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button aria-label="Decrease quantity" onClick={() => setQty(l, l.qty - 1)} className="size-8 rounded-full bg-white/10">−</button>
                  <span className="w-6 text-center text-sm" aria-live="polite">{l.qty}</span>
                  <button aria-label="Increase quantity" disabled={l.qty >= l.stock} onClick={() => setQty(l, l.qty + 1)} className="size-8 rounded-full bg-white/10 disabled:opacity-30">+</button>
                </div>
                <p className="font-display text-xl">{inr(l.priceInr * l.qty)}</p>
              </div>
              <button onClick={() => setQty(l, 0)} className="mt-1 text-xs text-muted underline">Remove</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex items-center justify-between">
        <p className="text-muted">Total</p>
        <p className="font-display text-3xl">{inr(total)}</p>
      </div>
      {signedIn ? (
        <>
          <button onClick={checkout} disabled={pending} className="mt-4 w-full rounded-full bg-[var(--magenta)] px-6 py-3 font-medium text-white disabled:opacity-50">
            {paymentsEnabled ? "Checkout" : "Checkout (opens soon)"}
          </button>
          {!paymentsEnabled && !note && <p className="mt-2 text-center text-xs text-muted">Tap to tell us you&apos;re interested.</p>}
        </>
      ) : (
        <p className="mt-4 text-center text-sm text-muted">Sign in to check out.</p>
      )}
      {note && <p className="mt-3 text-center text-sm" role="status">{note}</p>}
    </div>
  );
}
