"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArtistAvatar } from "@/components/artist/ArtistAvatar";
import { EventCard } from "@/components/event-card/EventCard";
import type { AlertView, ArtistView, EventView } from "@/components/event-card/types";
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
const NEXT = { follow: "must_see", must_see: "muted", muted: "follow" } as const;
const LABEL = { follow: "Follow", must_see: "Must-see", muted: "Muted" } as const;

export function RadarView({ events: initial, artists: initialArtists, history, homeCity, readOnly, sourceCount, lastScanAt }: { events: EventView[]; artists: ArtistView[]; history?: AlertView[]; homeCity: string; readOnly?: boolean; sourceCount: number; lastScanAt: string | null }) {
  const [events, setEvents] = useState(initial);
  const [artists, setArtists] = useState(initialArtists);
  const [chip, setChip] = useState<Chip>("india");
  const [showAll, setShowAll] = useState(false);
  const [limit, setLimit] = useState(12);
  const [err, setErr] = useState<string | null>(null);

  const act = events.filter((e) => e.urgency === "red");
  const filtered = useMemo(
    () =>
      events.filter((e) => (chip === "home" ? e.inHomeCity : chip === "festivals" ? e.isFestival : chip === "rumors" ? e.status === "rumored" : true)),
    [events, chip],
  );
  const groups = useMemo(() => {
    const m = new Map<string, EventView[]>();
    for (const e of filtered.slice(0, limit)) m.set(monthKey(e.date), [...(m.get(monthKey(e.date)) ?? []), e]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, limit]);

  async function dismiss(id: string) {
    const prev = events;
    setEvents((es) => es.filter((e) => e.id !== id));
    try {
      const r = await fetch(`/api/events/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!r.ok) throw new Error();
    } catch {
      setEvents(prev);
      setErr("Couldn't save that. Try again.");
    }
  }
  async function cycle(a: ArtistView) {
    const next = NEXT[a.priority];
    setArtists((as) => as.map((x) => (x.id === a.id ? { ...x, priority: next } : x)));
    try {
      const r = await fetch("/api/artists", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artistId: a.id, priority: next }) });
      if (!r.ok) throw new Error();
    } catch {
      setArtists((as) => as.map((x) => (x.id === a.id ? { ...x, priority: a.priority } : x)));
      setErr("Couldn't change that artist. Try again.");
    }
  }
  async function wrongArtist(a: ArtistView) {
    try {
      const r = await fetch("/api/artists", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artistId: a.id, reopen: true }) });
      if (!r.ok) throw new Error((await r.json()).error);
      window.location.href = "/onboarding";
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't reopen that artist");
    }
  }

  const chips: { k: Chip; label: string; n: number }[] = [
    { k: "home", label: homeCity, n: events.filter((e) => e.inHomeCity).length },
    { k: "india", label: "All India", n: events.length },
    { k: "festivals", label: "Festivals", n: events.filter((e) => e.isFestival).length },
    { k: "rumors", label: "Rumours", n: events.filter((e) => e.status === "rumored").length },
  ];
  const shownArtists = showAll ? artists : artists.slice(0, 12);

  return (
    <div className="flex flex-col gap-10">
      {err && (
        <p role="alert" className="flex items-center justify-between rounded-card border border-urgency-red/60 px-4 py-3 text-sm">
          {err}
          <button onClick={() => setErr(null)} className="underline">Dismiss</button>
        </p>
      )}

      {artists.length === 0 ? (
        <section className="rounded-card border border-dashed border-surface-border p-8 text-center">
          <h2 className="text-lg font-semibold">No artists yet</h2>
          <p className="mt-1 text-sm text-muted">Add the artists you love and we&apos;ll watch for their India shows.</p>
          {!readOnly && <Link href="/onboarding" className="mt-4 inline-block rounded-card bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">Add artists</Link>}
        </section>
      ) : (
        <>
          {act.length > 0 && (
            <section aria-labelledby="act" className="space-y-3">
              <h2 id="act" className="text-lg font-semibold"><span className="text-urgency-red">●</span> Act now</h2>
              <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
                {act.map((e) => (
                  <li key={e.id} className="w-[min(88vw,22rem)] shrink-0 snap-start">
                    <EventCard ev={e} onDismiss={dismiss} readOnly={readOnly} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="timeline" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="timeline" className="text-lg font-semibold">Radar timeline</h2>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter shows">
                {chips.map((c) => (
                  <button key={c.k} onClick={() => {
                      setChip(c.k);
                      setLimit(12);
                    }} aria-pressed={chip === c.k} className={`rounded-full border px-3 py-1 text-sm ${chip === c.k ? "border-accent bg-accent text-accent-foreground" : "border-surface-border"}`}>
                    {c.label} <span className="opacity-70">{c.n}</span>
                  </button>
                ))}
              </div>
            </div>
            {groups.length === 0 ? (
              <div className="rounded-card border border-dashed border-surface-border p-8 text-center">
                <p className="font-medium">{events.length === 0 ? "All quiet." : "Nothing in this view."}</p>
                <p className="mt-1 text-sm text-muted">
                  {events.length === 0
                    ? `We're watching ${sourceCount} sources${lastScanAt ? ` (last scan ${ago(lastScanAt)})` : ""} and will alert you the moment one of your artists announces a show.`
                    : "Try another filter."}
                </p>
              </div>
            ) : (
              groups.map(([k, list]) => (
                <div key={k} className="space-y-3">
                  <h3 className="text-sm font-medium tracking-wide text-muted uppercase">{monthLabel(k)}</h3>
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {list.map((e) => (
                      <li key={e.id}>
                        <EventCard ev={e} onDismiss={dismiss} readOnly={readOnly} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
            {filtered.length > limit && (
              <button onClick={() => setLimit((l) => l + 12)} className="w-full rounded-card border border-surface-border py-2.5 text-sm font-medium">
                Show more ({filtered.length - limit} more)
              </button>
            )}
          </section>

          <section aria-labelledby="artists" className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 id="artists" className="text-lg font-semibold">Your artists <span className="text-sm font-normal text-muted">{artists.length}</span></h2>
              {!readOnly && <p className="text-xs text-muted">Tap the badge to change priority</p>}
            </div>
            <ul className="divide-y divide-surface-border rounded-card border border-surface-border bg-surface">
              {shownArtists.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                  <ArtistAvatar name={a.name} imageUrl={a.imageUrl} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate font-medium">
                      <span className="truncate">{a.name}</span>
                      {a.identityStatus === "unverified" && <span className="shrink-0 rounded-full border border-surface-border px-1.5 text-[10px] text-muted">Name only</span>}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {a.lastCheckedAt ? `Checked ${ago(a.lastCheckedAt)}` : "Not checked yet"} ·{" "}
                      {a.upcomingCount > 0 ? `${a.upcomingCount} upcoming` : a.lastIndiaShow ? `Last in India: ${a.lastIndiaShow}` : "No India show found"}
                    </p>
                    {!readOnly && a.identityStatus !== "verified" && (
                      <button onClick={() => wrongArtist(a)} className="text-xs text-muted underline underline-offset-2">Is this the right artist?</button>
                    )}
                  </div>
                  <button
                    onClick={() => !readOnly && cycle(a)}
                    disabled={readOnly}
                    aria-label={`${a.name}: ${LABEL[a.priority]}`}
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs ${a.priority === "must_see" ? "border-accent text-accent" : a.priority === "muted" ? "border-surface-border text-muted line-through" : "border-surface-border"}`}
                  >
                    {LABEL[a.priority]}
                  </button>
                </li>
              ))}
            </ul>
            {artists.length > 12 && (
              <button onClick={() => setShowAll((v) => !v)} className="text-sm text-muted underline underline-offset-2">
                {showAll ? "Show fewer" : `Show all ${artists.length}`}
              </button>
            )}
          </section>
        </>
      )}

      <SystemPulse demo={readOnly} />

      {!readOnly && history && (
        <section aria-labelledby="history" className="space-y-3">
          <h2 id="history" className="text-lg font-semibold">Alert history</h2>
          {history.length === 0 ? (
            <p className="rounded-card border border-dashed border-surface-border p-6 text-center text-sm text-muted">No alerts sent yet. They&apos;ll show up here with the channel, time and what you did.</p>
          ) : (
            <ul className="divide-y divide-surface-border rounded-card border border-surface-border bg-surface text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                  <span className="font-medium">{h.artistName}</span>
                  <span className="text-muted">{h.city ?? ""}</span>
                  <span className="rounded-full border border-surface-border px-2 text-xs capitalize">{h.channel}{h.kind === "test" ? " · test" : ""}</span>
                  <span className="ml-auto text-xs text-muted">
                    {h.action === "bought" ? "Going 🎉 · " : h.action === "dismissed" ? "Not for me · " : ""}
                    {ago(h.sentAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
