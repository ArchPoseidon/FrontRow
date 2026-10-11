"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EventCard } from "@/components/event-card/EventCard";
import type { EventView } from "@/components/event-card/types";

const DOT: Record<string, string> = { live: "bg-stage-live", soon: "bg-stage-soon", announced: "bg-stage-announced", soldout: "bg-stage-soldout", rumor: "bg-urgency-info" };
const pad = (n: number) => String(n).padStart(2, "0");

// Month grid. Each show is a dot in its stage colour; Going shows get a ring. Pick a day to see its tickets.
export function CalendarView({ events, today }: { events: EventView[]; today: string }) {
  const [ty, tm] = today.split("-").map(Number);
  const first = events.map((e) => e.date).filter(Boolean).sort()[0];
  const [ym, setYm] = useState<[number, number]>(first && first.slice(0, 7) > today.slice(0, 7) ? [Number(first.slice(0, 4)), Number(first.slice(5, 7))] : [ty, tm]);
  const [sel, setSel] = useState<string | null>(null);
  const [goingOnly, setGoingOnly] = useState(false);

  const shown = useMemo(() => events.filter((e) => e.date && (!goingOnly || e.mine === "going")), [events, goingOnly]);
  const byDay = useMemo(() => {
    const m = new Map<string, EventView[]>();
    for (const e of shown) m.set(e.date!, [...(m.get(e.date!) ?? []), e]);
    return m;
  }, [shown]);

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => go(-1)} aria-label="Previous month" className="rounded-card border border-surface-border px-3 py-1.5">‹</button>
          <h2 className="font-display min-w-44 text-center text-3xl font-extrabold">{label}</h2>
          <button onClick={() => go(1)} aria-label="Next month" className="rounded-card border border-surface-border px-3 py-1.5">›</button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={goingOnly} onChange={(e) => setGoingOnly(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          Going only
        </label>
      </div>
      <p className="-mt-3 text-sm text-muted">{inMonth} show{inMonth === 1 ? "" : "s"} this month</p>

      <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={label}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-1 text-[11px] tracking-wider text-muted uppercase">{d}</div>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => <div key={`p${i}`} />)}
        {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
          const key = `${monthPrefix}-${pad(d)}`;
          const list = byDay.get(key) ?? [];
          const going = list.some((e) => e.mine === "going");
          const isSel = sel === key;
          return (
            <button
              key={key}
              onClick={() => setSel(isSel ? null : key)}
              disabled={!list.length}
              aria-pressed={isSel}
              aria-label={`${d} ${label}${list.length ? `, ${list.length} show${list.length === 1 ? "" : "s"}` : ""}`}
              className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-md border text-sm ${isSel ? "border-accent bg-accent text-accent-foreground" : list.length ? "border-surface-border bg-surface" : "border-transparent text-muted"} ${key === today ? "underline decoration-2 underline-offset-4" : ""} ${going && !isSel ? "ring-2 ring-[var(--tier-open)]" : ""}`}
            >
              <span className={list.length ? "font-bold" : ""}>{d}</span>
              {list.length > 0 && (
                <span className="flex gap-0.5">
                  {list.slice(0, 3).map((e) => <i key={e.id} className={`h-1.5 w-1.5 rounded-full ${DOT[e.stage]}`} />)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-stage-live" />Tickets live</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-stage-soon" />Go-live date announced</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-stage-announced" />Announced</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full ring-2 ring-[var(--tier-open)]" />Going</span>
      </div>

      {sel ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {dayList.map((e) => <li key={e.id}><EventCard ev={e} readOnly /></li>)}
        </ul>
      ) : shown.length === 0 ? (
        <p className="rounded-card border border-dashed border-surface-border p-6 text-center text-sm text-muted">
          {goingOnly ? "No Going shows yet. Tap Going on a show to put it here." : "No dated shows yet."} <Link href="/radar" className="underline">Browse the radar</Link>
        </p>
      ) : (
        <p className="text-sm text-muted">Pick a day with a dot to see its tickets.</p>
      )}
    </div>
  );
}
