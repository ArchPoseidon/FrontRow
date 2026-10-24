"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addArtistAction, searchArtistsAction } from "@/app/artists/actions";
import type { SpotifyArtist } from "@/lib/identity/spotify";
import { ArtistAvatar } from "@/components/artist/ArtistAvatar";

// Compact inline Spotify search + add (onboarding is not available once you're in).
export function AddArtist() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SpotifyArtist[]>([]);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();
  const seq = useRef(0);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const n = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await searchArtistsAction(q);
        if (n === seq.current) {
          setResults(r.results);
          setMine(new Set(r.mine));
          setNote(r.results.length ? null : "No artists found.");
        }
      } catch {
        if (n === seq.current) setNote("Search isn't working right now. Try again in a moment.");
      } finally {
        if (n === seq.current) setBusy(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const add = (a: SpotifyArtist) =>
    start(async () => {
      const r = await addArtistAction(a).catch(() => null);
      if (!r) return setNote("Couldn't add that artist. Try again.");
      if (r.kind === "inactive") return setNote(`${r.name} is no longer touring, so they can't be added.`);
      setMine((m) => new Set(m).add(a.id));
      setNote(`Added ${a.name}.`);
      router.refresh();
    });

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-card bg-accent px-4 py-2 text-sm font-bold text-accent-foreground">
        + Add artist
      </button>
    );
  return (
    <div className="w-full rounded-card border border-surface-border bg-surface/80 p-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search Spotify for an artist"
          aria-label="Search Spotify for an artist"
          className="min-w-0 flex-1 rounded-md border border-surface-border bg-background px-3 py-2 text-base"
        />
        <button type="button" onClick={() => { setOpen(false); setQ(""); setResults([]); setNote(null); }} className="px-2 py-2 text-sm text-muted">Close</button>
      </div>
      {busy && <p className="mt-2 text-xs text-muted">Searching…</p>}
      {note && <p role="status" className="mt-2 text-xs text-muted">{note}</p>}
      <ul className="mt-2 flex flex-col gap-1">
        {results.map((a) => (
          <li key={a.id} className="flex items-center gap-3 rounded-md p-1.5">
            <ArtistAvatar name={a.name} imageUrl={a.image} size={40} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.name}</span>
            {mine.has(a.id) ? (
              <span className="text-xs text-muted">Following</span>
            ) : (
              <button type="button" onClick={() => add(a)} className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground">Add</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
