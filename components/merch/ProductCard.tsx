import Link from "next/link";
import type { ProductCard as P } from "@/lib/merch/core";

export const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function Placeholder({ name }: { name: string }) {
  return (
    <div className="grid aspect-square w-full place-items-center bg-[var(--ink-2)] font-display text-4xl text-[var(--wordmark-soft)]">
      {name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
    </div>
  );
}

export function ProductCard({ p }: { p: P }) {
  return (
    <Link href={`/merch/${p.id}`} className="group relative block overflow-hidden rounded-2xl bg-[var(--ink-2)] ring-1 ring-white/10 transition hover:ring-[var(--magenta)]">
      {p.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.image} alt={p.name} loading="lazy" className="aspect-square w-full object-cover" />
      ) : (
        <Placeholder name={p.name} />
      )}
      <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">Demo store</span>
      {!p.inStock && <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] uppercase tracking-wider">Sold out</span>}
      <div className="p-3">
        <p className="truncate text-xs text-muted">{p.artistName}</p>
        <p className="truncate text-sm font-medium">{p.name}</p>
        <p className="mt-1 font-display text-xl tracking-wide">{inr(p.priceInr)}</p>
      </div>
    </Link>
  );
}
