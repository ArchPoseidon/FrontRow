"use client";

import { useCallback, useEffect, useState } from "react";
import { ArtistAvatar } from "@/components/artist/ArtistAvatar";

type Suggestion = { artistId: string; name: string; imageUrl: string | null; next: { city: string | null; date: string | null; status: string | null } };

const fmt = (d: string | null) => (d ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`)) : "date TBA");

// "Touring India now": real, already-found upcoming shows. Adding one guarantees the user a real result.
export function TouringNow({ onAdded }: { onAdded: () => void }) {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/artists/suggested");
      if (!r.ok) throw new Error();
      setItems((await r.json()).suggestions);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function add(id: string) {
    setBusy(id);
    try {
      const r = await fetch("/api/artists/suggested", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artistId: id }) });
      if (!r.ok) throw new Error();
      setItems((cur) => (cur ?? []).filter((s) => s.artistId !== id));
      onAdded();
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  if (items === null && !error) return <div className="h-24 animate-pulse rounded-card bg-surface-border" aria-label="Loading suggestions" />;
  if (error) return <p className="text-sm text-muted">Couldn&apos;t load shows touring right now. <button onClick={load} className="underline underline-offset-2">Try again</button></p>;
  if (!items?.length) return null;
  return (
    <section className="space-y-3" aria-label="Touring India now">
      <div>
        <h2 className="text-lg font-semibold">Touring India now</h2>
        <p className="text-sm text-muted">Real upcoming shows we&apos;ve already found. Add one to see a result right away.</p>
      </div>
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {items.map((s) => (
          <li key={s.artistId} className="flex w-56 shrink-0 flex-col gap-3 rounded-card border border-surface-border bg-surface p-3">
            <div className="flex items-center gap-3">
              <ArtistAvatar name={s.name} imageUrl={s.imageUrl} size={44} />
              <div className="min-w-0">
                <p className="truncate font-medium">{s.name}</p>
                <p className="truncate text-xs text-muted">{s.next.city ?? "India"} · {fmt(s.next.date)}</p>
              </div>
            </div>
            <button onClick={() => add(s.artistId)} disabled={busy === s.artistId} className="rounded-card border border-surface-border px-3 py-1.5 text-sm font-medium disabled:opacity-50">
              {busy === s.artistId ? "Adding…" : "Add"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
