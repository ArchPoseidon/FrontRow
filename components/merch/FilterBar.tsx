"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Filters } from "@/lib/merch/core";

const SIZES = ["S", "M", "L", "XL", "Free"];
const SORTS = [
  { v: "newest", l: "Newest" },
  { v: "price_asc", l: "Price: low to high" },
  { v: "price_desc", l: "Price: high to low" },
];

export function FilterBar({ filters, artistOptions, count }: { filters: Filters; artistOptions: { id: string; name: string }[]; count: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [min, setMin] = useState(filters.min?.toString() ?? "");
  const [max, setMax] = useState(filters.max?.toString() ?? "");

  function push(next: Partial<{ artists: string[]; min: string; max: string; sizes: string[]; sort: string }>) {
    const a = next.artists ?? filters.artists;
    const s = next.sizes ?? filters.sizes;
    const mn = next.min ?? min;
    const mx = next.max ?? max;
    const sort = next.sort ?? filters.sort;
    const p = new URLSearchParams();
    if (a.length) p.set("artist", a.join(","));
    if (mn) p.set("min", mn);
    if (mx) p.set("max", mx);
    if (s.length) p.set("size", s.join(","));
    if (sort !== "newest") p.set("sort", sort);
    const qs = p.toString();
    start(() => router.replace(qs ? `/merch?${qs}` : "/merch", { scroll: false }));
  }
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const shown = artistOptions.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()));
  const active = filters.artists.length + filters.sizes.length + (filters.min !== null ? 1 : 0) + (filters.max !== null ? 1 : 0);
  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-sm ring-1 transition ${on ? "bg-[var(--magenta)] text-white ring-[var(--magenta)]" : "bg-white/5 ring-white/10"}`;
  const input = "w-full rounded-lg bg-[var(--ink-2)] px-3 py-2 text-sm ring-1 ring-white/10 outline-none focus:ring-[var(--magenta)]";

  return (
    <div className={pending ? "opacity-70 transition" : "transition"}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted" aria-live="polite">{count} {count === 1 ? "product" : "products"}</p>
        <select aria-label="Sort" value={filters.sort} onChange={(e) => push({ sort: e.target.value })} className="rounded-lg bg-[var(--ink-2)] px-3 py-2 text-sm ring-1 ring-white/10">
          {SORTS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
        </select>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className={chip(filters.artists.length > 0)}>
          Artist{filters.artists.length ? ` (${filters.artists.length})` : ""} ▾
        </button>
        {SIZES.map((s) => (
          <button key={s} aria-pressed={filters.sizes.includes(s)} onClick={() => push({ sizes: toggle(filters.sizes, s) })} className={chip(filters.sizes.includes(s))}>{s}</button>
        ))}
        {active > 0 && (
          <button onClick={() => { setMin(""); setMax(""); start(() => router.replace("/merch", { scroll: false })); }} className="px-2 text-sm text-muted underline">Clear all</button>
        )}
      </div>

      {open && (
        <div className="mt-3 rounded-2xl bg-[var(--ink-2)] p-3 ring-1 ring-white/10">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search artists" aria-label="Search artists" className={input} />
          <ul className="mt-2 max-h-48 overflow-y-auto">
            {shown.map((a) => (
              <li key={a.id}>
                <label className="flex min-h-10 cursor-pointer items-center gap-3 px-1 text-sm">
                  <input type="checkbox" checked={filters.artists.includes(a.id)} onChange={() => push({ artists: toggle(filters.artists, a.id) })} className="size-4 accent-[var(--magenta)]" />
                  {a.name}
                </label>
              </li>
            ))}
            {!shown.length && <li className="px-1 py-2 text-sm text-muted">No artists match.</li>}
          </ul>
        </div>
      )}

      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); push({ min, max }); }}
      >
        <span className="text-sm text-muted">₹</span>
        <input inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} onBlur={() => min !== (filters.min?.toString() ?? "") && push({ min, max })} placeholder="Min" aria-label="Minimum price in rupees" className={input} />
        <span className="text-muted">–</span>
        <input inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} onBlur={() => max !== (filters.max?.toString() ?? "") && push({ min, max })} placeholder="Max" aria-label="Maximum price in rupees" className={input} />
        <button className="rounded-lg bg-white/10 px-3 py-2 text-sm">Go</button>
      </form>
    </div>
  );
}
