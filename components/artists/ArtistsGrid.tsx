"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArtistPhoto } from "@/components/artist/ArtistPhoto";
import type { FollowedArtist } from "@/lib/artists/queries";
import { AddArtist } from "./AddArtist";
import { CallMeToggle } from "./CallMeToggle";
import { PriorityControl } from "./PriorityControl";

export function ArtistsGrid({ artists }: { artists: FollowedArtist[] }) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim().toLowerCase()), 150);
    return () => clearTimeout(t);
  }, [input]);
  const shown = useMemo(() => (q ? artists.filter((a) => a.name.toLowerCase().includes(q)) : artists), [artists, q]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search your artists"
          aria-label="Search your artists"
          className="min-w-0 flex-1 rounded-card border border-surface-border bg-surface/80 px-3 py-2.5 text-base backdrop-blur"
        />
        <AddArtist />
      </div>
      <p className="text-sm text-muted">{shown.length} of {artists.length} artists</p>
      {shown.length === 0 ? (
        <div className="rounded-card border border-dashed border-surface-border p-10 text-center">
          <p className="font-display text-3xl font-extrabold">{artists.length ? "No match" : "No artists yet"}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{artists.length ? "Nothing in your list matches that name." : "Add an artist above and their India shows will land on your radar."}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((a) => (
            <li key={a.id} className={`flex flex-col gap-3 rounded-card border border-surface-border bg-surface/80 p-3 backdrop-blur ${a.priority === "muted" ? "opacity-75" : ""}`}>
              <Link href={`/artists/${a.id}`} className="flex items-center gap-3">
                <span className="h-16 w-16 shrink-0 overflow-hidden rounded-card"><ArtistPhoto name={a.name} imageUrl={a.image} /></span>
                <span className="min-w-0 flex-1">
                  <span className="font-display block truncate text-2xl leading-none font-extrabold">{a.name}</span>
                  <span className="mt-1 block text-xs text-muted">{a.upcoming === 0 ? "No upcoming India shows" : `${a.upcoming} upcoming ${a.upcoming === 1 ? "show" : "shows"}`}</span>
                </span>
              </Link>
              {a.cities.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Cities">
                  {a.cities.slice(0, 6).map((c) => (
                    <li key={c} className="rounded-full border border-surface-border px-2 py-0.5 text-[11px] text-muted">{c}</li>
                  ))}
                  {a.cities.length > 6 && <li className="text-[11px] text-muted">+{a.cities.length - 6}</li>}
                </ul>
              )}
              <div className="mt-auto flex flex-wrap items-start gap-2">
                <PriorityControl artistId={a.id} value={a.priority} />
                {a.priority !== "muted" && <CallMeToggle artistId={a.id} initial={a.callMe} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
