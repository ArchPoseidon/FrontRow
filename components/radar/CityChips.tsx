"use client";

import type { CityChip } from "@/lib/data/show-filters";

// Horizontally scrolling city filter: All, then the viewer's P1 cities, P2 cities, then the rest by count.
export function CityChips({ chips, total, active, onPick }: { chips: CityChip[]; total: number; active: string | null; onPick: (slug: string | null) => void }) {
  if (chips.length === 0) return null;
  const cls = (on: boolean) => `shrink-0 rounded-full border px-3 py-1 text-sm whitespace-nowrap ${on ? "border-accent bg-accent font-bold text-accent-foreground" : "border-surface-border"}`;
  return (
    <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter by city">
      <button onClick={() => onPick(null)} aria-pressed={!active} className={cls(!active)}>
        All <span className="opacity-70">{total}</span>
      </button>
      {chips.map((c) => (
        <button key={c.slug} onClick={() => onPick(active === c.slug ? null : c.slug)} aria-pressed={active === c.slug} className={cls(active === c.slug)}>
          {c.label} <span className="opacity-70">{c.count}</span>
        </button>
      ))}
    </div>
  );
}
