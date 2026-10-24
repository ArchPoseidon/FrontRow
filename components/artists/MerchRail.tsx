import Link from "next/link";
import type { MerchRailItem } from "@/lib/artists/merch";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function MerchRail({ items }: { items: MerchRailItem[] }) {
  if (!items.length) return <p className="rounded-card border border-dashed border-surface-border p-6 text-sm text-muted">Official merch coming soon.</p>;
  return (
    <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
      {items.map((p) => (
        <li key={p.id} className="w-40 shrink-0 snap-start overflow-hidden rounded-card border border-surface-border bg-surface/80 backdrop-blur">
          <div className="relative">
            {p.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image} alt={p.name} loading="lazy" className="aspect-square w-full object-cover" />
            ) : (
              <div className="font-display grid aspect-square w-full place-items-center bg-surface text-4xl text-[var(--wordmark-soft)]">{p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</div>
            )}
            {p.isDemo && <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] tracking-wider text-muted uppercase">Demo</span>}
          </div>
          <div className="p-2.5">
            <p className="truncate text-sm font-medium">{p.name}</p>
            <p className="font-display text-xl">{inr(p.priceInr)}</p>
            <Link href={`/merch/${p.id}`} className="mt-1 inline-block rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground">View</Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
