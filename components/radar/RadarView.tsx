"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EventCard } from "@/components/event-card/EventCard";
import { ToastView, useEventActions } from "@/components/event-card/useEventActions";
import type { EventView } from "@/components/event-card/types";
import { SystemPulse } from "./SystemPulse";

type Chip = "home" | "india" | "festivals" | "rumors";

const ago = (iso: string | null) => {
  if (!iso) return null;
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};
const monthKey = (d: string | null) => (d ? d.slice(0, 7) : "tbd");
const monthLabel = (k: string) => (k === "tbd" ? "Date to be announced" : new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${k}-01T00:00:00Z`)));

// Shared by the dashboard (editable) and /demo (read-only).
export function RadarView({ events: initial, homeCity, readOnly, sourceCount, lastScanAt, hasArtists = true }: { events: EventView[]; homeCity: string; readOnly?: boolean; sourceCount: number; lastScanAt: string | null; hasArtists?: boolean }) {
  const { events, mark, dismiss, toggleCalendar, toast, clearToast } = useEventActions(initial, { returnTo: "/radar" });
  const [chip, setChip] = useState<Chip>("india");
  const [limit, setLimit] = useState(12);

  const act = events.filter((e) => e.stage === "live").slice(0, 8);
  const filtered = useMemo(() => events.filter((e) => (chip === "home" ? e.inHomeCity : chip === "festivals" ? e.isFestival : chip === "rumors" ? e.status === "rumored" : true)), [events, chip]);
  const groups = useMemo(() => {
    const m = new Map<string, EventView[]>();
    for (const e of filtered.slice(0, limit)) m.set(monthKey(e.date), [...(m.get(monthKey(e.date)) ?? []), e]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, limit]);

  const chips: { k: Chip; label: string; n: number }[] = [
    { k: "home", label: homeCity, n: events.filter((e) => e.inHomeCity).length },
    { k: "india", label: "All India", n: events.length },
    { k: "festivals", label: "Festivals", n: events.filter((e) => e.isFestival).length },
    { k: "rumors", label: "Rumours", n: events.filter((e) => e.status === "rumored").length },
  ];

  return (
    <div className="flex flex-col gap-10">
      {!hasArtists ? (
        <section className="rounded-card border border-dashed border-surface-border p-8 text-center">
          <h2 className="font-display text-3xl font-extrabold">No artists yet</h2>
          <p className="mt-1 text-sm text-muted">Add the artists you love and we&apos;ll watch for their India shows.</p>
          {!readOnly && <Link href="/onboarding?manage=1" className="mt-4 inline-block rounded-card bg-accent px-4 py-2 text-sm font-bold text-accent-foreground">Add artists</Link>}
        </section>
      ) : (
        <>
          {act.length > 0 && (
            <section aria-labelledby="act" className="space-y-3">
              <h2 id="act" className="font-display text-3xl font-extrabold"><span className="text-stage-live">●</span> On sale now</h2>
              <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
                {act.map((e, i) => (
                  <li key={e.id} className="w-[min(88vw,24rem)] shrink-0 snap-start">
                    <EventCard ev={e} onDismiss={dismiss} onMark={mark} onCalendar={toggleCalendar} readOnly={readOnly} auto={i === 0} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="timeline" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="timeline" className="font-display text-3xl font-extrabold">On the board</h2>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter shows">
                {chips.map((c) => (
                  <button
                    key={c.k}
                    onClick={() => {
                      setChip(c.k);
                      setLimit(12);
                    }}
                    aria-pressed={chip === c.k}
                    className={`rounded-full border px-3 py-1 text-sm ${chip === c.k ? "border-accent bg-accent font-bold text-accent-foreground" : "border-surface-border"}`}
                  >
                    {c.label} <span className="opacity-70">{c.n}</span>
                  </button>
                ))}
              </div>
            </div>
            {groups.length === 0 ? (
              <div className="rounded-card border border-dashed border-surface-border p-8 text-center">
                <p className="font-display text-2xl font-extrabold">{events.length === 0 ? "All quiet." : "Nothing in this view."}</p>
                <p className="mt-1 text-sm text-muted">
                  {events.length === 0 ? `We're watching ${sourceCount} sources${lastScanAt ? ` (last scan ${ago(lastScanAt)})` : ""} and will alert you the moment one of your artists announces a show.` : "Try another filter."}
                </p>
              </div>
            ) : (
              groups.map(([k, list]) => (
                <div key={k} className="space-y-3">
                  <h3 className="text-sm font-bold tracking-widest text-muted uppercase">{monthLabel(k)}</h3>
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {list.map((e) => (
                      <li key={e.id}>
                        <EventCard ev={e} onDismiss={dismiss} onMark={mark} onCalendar={toggleCalendar} readOnly={readOnly} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
            {filtered.length > limit && (
              <button onClick={() => setLimit((l) => l + 12)} className="w-full rounded-card border border-surface-border py-2.5 text-sm font-bold">
                Show more ({filtered.length - limit} more)
              </button>
            )}
          </section>
        </>
      )}

      <SystemPulse demo={readOnly} />
      <ToastView toast={toast} onClose={clearToast} />
    </div>
  );
}
