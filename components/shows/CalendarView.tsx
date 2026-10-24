"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EventCard } from "@/components/event-card/EventCard";
import { ToastView, useEventActions } from "@/components/event-card/useEventActions";
import type { EventView } from "@/components/event-card/types";
import { calendarCounts, cityChips, filterCalendar, type CalFilter } from "@/lib/data/show-filters";
import { SearchBox } from "@/components/radar/SearchBox";
import { CityChips } from "@/components/radar/CityChips";
import { useShowFilters } from "@/components/radar/useShowFilters";

const DOT: Record<string, string> = { live: "bg-stage-live", soon: "bg-stage-soon", announced: "bg-stage-announced", soldout: "bg-stage-soldout", rumor: "bg-urgency-info" };
const pad = (n: number) => String(n).padStart(2, "0");

const FILTERS: { k: CalFilter; label: string }[] = [
  { k: "all", label: "All shows" },
  { k: "added", label: "In my calendar" },
  { k: "going", label: "Going" },
  { k: "saved", label: "Saved" },
  { k: "fav", label: "Live concerts of my favourite artists" },
];
const EMPTY: Record<CalFilter, string> = {
  all: "No dated shows yet.",
  added: "Nothing in your calendar yet. Tap Add to calendar on a show.",
  going: "No Going shows yet. Tap Going on a show to put it here.",
  saved: "No saved shows yet. Tap the bookmark on a show to keep it here.",
  fav: "No upcoming shows for your artists yet. We'll add them the moment one is announced.",
};

// Month grid. Each show is a dot in its stage colour. Green ring = going, magenta ring = saved, tick = in your calendar.
export function CalendarView({ events: initial, today, p1Cities = [], p2Cities = [] }: { events: EventView[]; today: string; p1Cities?: string[]; p2Cities?: string[] }) {
  const { events, mark, toggleCalendar, toast, clearToast } = useEventActions(initial, { returnTo: "/calendar" });
  const [ty, tm] = today.split("-").map(Number);
  const [ym, setYm] = useState<[number, number]>([ty, tm]);
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<CalFilter>("all");
  const { input, setInput, q, city, setCity } = useShowFilters("calendar");

  // The set of chips comes from the shows under the current chip; counts follow the search box.
  const prefs = useMemo(() => ({ p1: p1Cities, p2: p2Cities }), [p1Cities, p2Cities]);
  const chipBase = useMemo(() => filterCalendar(events, { q: "", chip: filter, city: null }), [events, filter]);
  const cities = useMemo(() => cityChips(chipBase, prefs, filterCalendar(events, { q, chip: filter, city: null })), [chipBase, prefs, events, q, filter]);
  const activeCity = city && cities.some((c) => c.slug === city) ? city : null;
  const shown = useMemo(() => filterCalendar(events, { q, chip: filter, city: activeCity }), [events, q, filter, activeCity]);
  const byDay = useMemo(() => {
    const m = new Map<string, EventView[]>();
    for (const e of shown) m.set(e.date!, [...(m.get(e.date!) ?? []), e]);
    return m;
  }, [shown]);

  // Jump to the first month that has something for this filter.
  useEffect(() => {
    const first = shown.map((e) => e.date!).sort()[0];
    if (!first) return;
    const key = `${ym[0]}-${pad(ym[1])}`;
    if (!shown.some((e) => e.date!.startsWith(key))) setYm([Number(first.slice(0, 4)), Number(first.slice(5, 7))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, q, activeCity]);

  const counts = calendarCounts(events, { q, city: activeCity });

  const [y, mo] = ym;
  const firstDow = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 6) % 7; // Monday first
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const label = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, mo - 1, 1)));
  const go = (d: number) => {
    const t = new Date(Date.UTC(y, mo - 1 + d, 1));
    setYm([t.getUTCFullYear(), t.getUTCMonth() + 1]);
    setSel(null);
  };
  const monthPrefix = `${y}-${pad(mo)}`;
  const inMonth = shown.filter((e) => e.date!.startsWith(monthPrefix)).length;
  const dayList = sel ? byDay.get(sel) ?? [] : [];

  return (
    <div className="flex flex-col gap-5">
      <SearchBox value={input} onChange={setInput} placeholder="Search artist, city or venue" />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Which shows to show">
        {FILTERS.map((f) => (
          <button key={f.k} onClick={() => { setFilter(f.k); setSel(null); }} aria-pressed={filter === f.k} className={`rounded-full border px-3 py-1.5 text-sm ${filter === f.k ? "border-accent bg-accent font-bold text-accent-foreground" : "border-surface-border"}`}>
            {f.label} <span className="ml-0.5 opacity-70" data-testid={`count-${f.k}`}>{counts[f.k]}</span>
          </button>
        ))}
      </div>
      <CityChips chips={cities} total={filterCalendar(events, { q, chip: filter, city: null }).length} active={activeCity} onPick={(c) => { setCity(c); setSel(null); }} />

      <div className="flex items-center gap-2">
        <button onClick={() => go(-1)} aria-label="Previous month" className="rounded-card border border-surface-border px-3 py-1.5">‹</button>
        <h2 className="font-display min-w-44 text-center text-3xl font-extrabold">{label}</h2>
        <button onClick={() => go(1)} aria-label="Next month" className="rounded-card border border-surface-border px-3 py-1.5">›</button>
        <span className="ml-auto text-sm text-muted">{inMonth} show{inMonth === 1 ? "" : "s"}</span>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={label}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-1 text-[11px] tracking-wider text-muted uppercase">{d}</div>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => <div key={`p${i}`} />)}
        {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
          const key = `${monthPrefix}-${pad(d)}`;
          const list = byDay.get(key) ?? [];
          const going = list.some((e) => e.mine === "going");
          const saved = list.some((e) => e.mine === "saved");
          const added = list.some((e) => e.inCalendar);
          const isSel = sel === key;
          return (
            <button
              key={key}
              onClick={() => setSel(isSel ? null : key)}
              disabled={!list.length}
              aria-pressed={isSel}
              aria-label={`${d} ${label}${list.length ? `, ${list.length} show${list.length === 1 ? "" : "s"}${going ? ", going" : ""}${saved ? ", saved" : ""}${added ? ", in your calendar" : ""}` : ""}`}
              className={`relative flex aspect-square flex-col items-center justify-center gap-1 rounded-md border text-sm ${isSel ? "border-accent bg-accent text-accent-foreground" : list.length ? "border-surface-border bg-surface" : "border-transparent text-muted"} ${key === today ? "underline decoration-2 underline-offset-4" : ""} ${going && !isSel ? "ring-2 ring-[var(--tier-open)]" : saved && !isSel ? "ring-2 ring-[var(--magenta)]" : ""}`}
            >
              <span className={list.length ? "font-bold" : ""}>{d}</span>
              {list.length > 0 && (
                <span className="flex gap-0.5">
                  {list.slice(0, 3).map((e) => <i key={e.id} className={`h-1.5 w-1.5 rounded-full ${DOT[e.stage]}`} />)}
                </span>
              )}
              {added && <span className="absolute top-0.5 right-1 text-[10px] leading-none text-[var(--tier-open)]" aria-hidden>✓</span>}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-stage-live" />Tickets live</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-stage-soon" />Go-live date announced</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-stage-announced" />Announced</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full ring-2 ring-[var(--tier-open)]" />Going</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full ring-2 ring-[var(--magenta)]" />Saved</span>
        <span><span className="mr-1.5 text-[var(--tier-open)]">✓</span>In your calendar</span>
      </div>

      {sel ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {dayList.map((e) => <li key={e.id}><EventCard ev={e} onMark={mark} onCalendar={toggleCalendar} auto /></li>)}
        </ul>
      ) : shown.length === 0 ? (
        <p className="rounded-card border border-dashed border-surface-border p-6 text-center text-sm text-muted">
          {q || activeCity ? "No shows match this search." : EMPTY[filter]} <Link href="/radar" className="underline">Browse the radar</Link>
        </p>
      ) : (
        <p className="text-sm text-muted">Pick a day with a dot to see its tickets.</p>
      )}
      <ToastView toast={toast} onClose={clearToast} />
    </div>
  );
}
