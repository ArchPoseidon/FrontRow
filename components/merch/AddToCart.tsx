"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { addToCartAction } from "@/app/cart/actions";
import { localAdd } from "./localCart";

type V = { id: string; size: string | null; stock: number };

export function AddToCart(props: { variants: V[]; signedIn: boolean; product: { id: string; name: string; priceInr: number; image: string | null; artistName: string } }) {
  const firstInStock = props.variants.find((v) => v.stock > 0);
  const [sel, setSel] = useState<string | null>(firstInStock?.id ?? null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const chosen = props.variants.find((v) => v.id === sel);

  function add() {
    if (!chosen) return;
    setMsg(null);
    if (!props.signedIn) {
      localAdd({ variantId: chosen.id, productId: props.product.id, name: props.product.name, size: chosen.size, priceInr: props.product.priceInr, image: props.product.image, artistName: props.product.artistName, stock: chosen.stock });
      setMsg("Added to cart.");
      return;
    }
    start(async () => {
      try {
        const r = await addToCartAction(chosen.id, 1);
        setMsg(r.ok ? "Added to cart." : "Sorry, that size just sold out.");
      } catch {
        setMsg("Couldn't add. Try again.");
      }
    });
  }

  return (
    <div>
      <p className="mb-2 text-sm text-muted">Size</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Size">
        {props.variants.map((v) => {
          const out = v.stock <= 0;
          const on = v.id === sel;
          return (
            <button
              key={v.id}
              role="radio"
              aria-checked={on}
              disabled={out}
              onClick={() => setSel(v.id)}
              className={`min-w-12 rounded-xl px-4 py-2.5 text-sm ring-1 transition ${on ? "bg-[var(--magenta)] text-white ring-[var(--magenta)]" : "bg-white/5 ring-white/10"} ${out ? "cursor-not-allowed line-through opacity-40" : ""}`}
            >
              {v.size ?? "One size"}
            </button>
          );
        })}
      </div>
      {chosen && chosen.stock > 0 && chosen.stock <= 3 && <p className="mt-2 text-xs text-[var(--stage-announced)]">Only {chosen.stock} left</p>}
      <button onClick={add} disabled={!chosen || pending} className="mt-4 w-full rounded-full bg-[var(--magenta)] px-6 py-3 font-medium text-white disabled:opacity-40">
        {!firstInStock ? "Sold out" : pending ? "Adding…" : "Add to cart"}
      </button>
      {msg && (
        <p className="mt-3 text-sm" role="status">
          {msg} {msg.startsWith("Added") && <Link href="/cart" className="text-[var(--wordmark-soft)] underline">View cart</Link>}
        </p>
      )}
    </div>
  );
}
