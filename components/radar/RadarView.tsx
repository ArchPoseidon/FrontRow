"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EventCard } from "@/components/event-card/EventCard";
import { ToastView, useEventActions } from "@/components/event-card/useEventActions";
import type { ArtistView, EventView } from "@/components/event-card/types";
import { cityChips, matchesCity, matchesQuery } from "@/lib/data/show-filters";
import { SystemPulse } from "./SystemPulse";
import { SearchBox } from "./SearchBox";
import { CityChips } from "./CityChips";
import { useShowFilters } from "./useShowFilters";

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
export function RadarView({ events: initial, liveElsewhere = [], artists = [], homeCity, p1Cities = [], p2Cities = [], readOnly, sourceCount, lastScanAt, hasArtists = true }: { events: EventView[]; liveElsewhere?: EventView[]; artists?: ArtistView[]; homeCity: string; p1Cities?: string[]; p2Cities?: string[]; readOnly?: boolean; sourceCount: number; lastScanAt: string | null; hasArtists?: boolean }) {
  const { events, mark, dismiss, toggleCalendar, notify, toast, clearToast } = useEventActions(initial, { returnTo: "/radar" });
  const [chip, setChip] = useState<Chip>("india");
  const [limit, setLimit] = useState(12);

  const { input, setInput, q, city, setCity } = useShowFilters("radar", !readOnly);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [artistLimit, setArtistLimit] = useState(12);
  const mineIds = new Set(events.map((e) => e.id));
  const elsewhereAll = liveElsewhere.filter((e) => !mineIds.has(e.id) && !followed.has(e.artistId));

  // Search (artist, city, venue) and the city chip apply everywhere on the page.
  const prefs = useMemo(() => ({ p1: p1Cities, p2: p2Cities }), [p1Cities, p2Cities]);
  const chipSource = useMemo(() => [...events, ...elsewhereAll], [events, elsewhereAll]);
  const searched = useMemo(() => chipSource.filter((e) => matchesQuery(e, q)), [chipSource, q]);
  const cities = useMemo(() => cityChips(chipSource, prefs, searched), [chipSource, prefs, searched]);
  const activeCity = city && cities.some((c) => c.slug === city) ? city : null;
  const pass = (e: EventView) => matchesQuery(e, q) && matchesCity(e, activeCity);
  const act = events.filter((e) => e.stage === "live" && pass(e)).slice(0, 8);
  const elsewhere = elsewhereAll.filter(pass).slice(0, 6);
  const filtering = !!q || !!activeCity;
  const matchedArtists = useMemo(() => {
    const withShow = new Set(events.filter((e) => matchesQuery(e, q) && matchesCity(e, activeCity)).map((e) => e.artistId));
    return artists.filter((a) => a.priority !== "muted" && (activeCity ? withShow.has(a.id) : true) && (!q || matchesQuery({ artistName: a.name, city: null, venue: null }, q) || withShow.has(a.id)));
  }, [artists, events, q, activeCity]);

  async function follow(artistId: string) {
    const r = await fetch("/api/artists/suggested", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artistId }) }).catch(() => null);
    if (r?.ok) {
      setFollowed((f) => new Set(f).add(artistId));
      notify("Following. Their shows will show up on your radar and in your alerts.");
    } else notify("Couldn't follow that artist. Try again.", "error");
  }
  const base = useMemo(() => events.filter((e) => matchesQuery(e, q) && matchesCity(e, activeCity)), [events, q, activeCity]);
  const filtered = useMemo(() => base.filter((e) => (chip === "home" ? e.inHomeCity : chip === "festivals" ? e.isFestival : chip === "rumors" ? e.status === "rumored" : true)), [base, chip]);
  const groups = useMemo(() => {
    const m = new Map<string, EventView[]>();
    for (const e of filtered.slice(0, limit)) m.set(monthKey(e.date), [...(m.get(monthKey(e.date)) ?? []), e]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, limit]);

  const chips: { k: Chip; label: string; n: number }[] = [
    { k: "home", label: homeCity, n: base.filter((e) => e.inHomeCity).length },
    { k: "india", label: "All India", n: base.length },
    { k: "festivals", label: "Festivals", n: base.filter((e) => e.isFestival).length },
    { k: "rumors", label: "Rumours", n: base.filter((e) => e.status === "rumored").length },
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
          <div className="space-y-3">
            <SearchBox value={input} onChange={setInput} placeholder="Search artist, city or venue" />
            <CityChips chips={cities} total={searched.length} active={activeCity} onPick={setCity} />
          </div>

          <section aria-labelledby="act" className="space-y-3">
            <h2 id="act" className="font-display text-3xl font-extrabold"><span className="text-stage-live">●</span> On sale now</h2>
            {act.length > 0 && (
              <>
                {elsewhere.length > 0 && <p className="text-sm text-muted">From your artists</p>}
                <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
                  {act.map((e) => (
                    <li key={e.id} className="w-[min(88vw,24rem)] shrink-0 snap-start">
                      <EventCard ev={e} onDismiss={dismiss} onMark={mark} onCalendar={toggleCalendar} readOnly={readOnly} auto />
                    </li>
                  ))}
                </ul>
              </>
            )}
            {act.length === 0 && <p className="rounded-card border border-dashed border-surface-border p-4 text-sm text-muted">{filtering ? "No live shows match this search or city." : "None of your artists has tickets on sale right now."} We&apos;ll alert you the moment one does.{!filtering && elsewhere.length > 0 ? " Meanwhile, here is what is live across India." : ""}</p>}
            {elsewhere.length > 0 && (
              <>
                {act.length > 0 && <p className="pt-2 text-sm text-muted">Also on sale across India</p>}
                <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
                  {elsewhere.map((e) => (
                    <li key={e.id} className="w-[min(88vw,24rem)] shrink-0 snap-start">
                      <EventCard ev={e} onCalendar={toggleCalendar} onFollow={follow} readOnly={readOnly} auto />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* CALL-ME SECTION SLOT */}

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
                <p className="font-display text-2xl font-extrabold">{events.length === 0 ? "All quiet." : filtering ? "No shows match." : "Nothing in this view."}</p>
                <p className="mt-1 text-sm text-muted">
                  {events.length === 0 ? `We're watching ${sourceCount} sources${lastScanAt ? ` (last scan ${ago(lastScanAt)})` : ""} and will alert you the moment one of your artists announces a show.` : filtering ? "Try a different search or pick All cities." : "Try another filter."}
                </p>
              </div>
            ) : (
              groups.map(([k, list]) => (
                <div key={k} className="space-y-3">
                  <h3 className="text-sm font-bold tracking-widest text-muted uppercase">{monthLabel(k)}</h3>
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {list.map((e) => (
                      <li key={e.id}>
                        <EventCard ev={e} onDismiss={dismiss} onMark={mark} onCalendar={toggleCalendar} readOnly={readOnly} auto />
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

          {matchedArtists.length > 0 && (
            <section aria-labelledby="artists" className="space-y-3">
              <h2 id="artists" className="font-display text-3xl font-extrabold">Your artists</h2>
              <ul className="flex flex-wrap gap-2">
                {matchedArtists.slice(0, artistLimit).map((a) => (
                  <li key={a.id}>
                    <Link href={`/artists/${a.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-surface-border px-3 py-1 text-sm">
                      {a.name}
                      {a.upcomingCount > 0 && <span className="opacity-70">{a.upcomingCount}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
              {matchedArtists.length > artistLimit && (
                <button onClick={() => setArtistLimit((n) => n + 1000)} className="rounded-card border border-surface-border px-4 py-2 text-sm font-bold">Show all ({matchedArtists.length})</button>
              )}
            </section>
          )}
        </>
      )}

      <SystemPulse demo={readOnly} />
      <ToastView toast={toast} onClose={clearToast} />
    </div>
  );
}
