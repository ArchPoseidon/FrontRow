"use client";

import { useEffect, useState } from "react";

type Settings = { homeCity: string; watchCities: string[]; cities: string[] };

export function CitiesStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setS)
      .catch(() => setError("Couldn't load your settings"));
  }, []);

  const save = async (patch: Partial<Settings>) => {
    if (!s) return;
    const prev = s;
    setS({ ...s, ...patch });
    try {
      const r = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!r.ok) throw new Error();
      setError(null);
    } catch {
      setS(prev);
      setError("Couldn't save that. Try again.");
    }
  };

  if (!s) return error ? <p role="alert" className="text-sm">{error}</p> : <div className="h-40 animate-pulse rounded-card bg-surface-border" />;
  const all = s.watchCities.includes("ALL_INDIA");
  const toggle = (c: string) => save({ watchCities: s.watchCities.includes(c) ? s.watchCities.filter((x) => x !== c) : [...s.watchCities.filter((x) => x !== "ALL_INDIA"), c] });

  return (
    <div className="flex flex-col gap-6">
      {error && <p role="alert" className="rounded-card border border-urgency-red/60 px-4 py-3 text-sm">{error}</p>}
      <section className="space-y-2">
        <h2 className="font-semibold">Your home city</h2>
        <p className="text-sm text-muted">Shows here get the loudest alerts.</p>
        <select value={s.homeCity} onChange={(e) => save({ homeCity: e.target.value })} className="w-full rounded-card border border-surface-border bg-surface px-3 py-2.5">
          {[...new Set([s.homeCity, ...s.cities])].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">Other cities to watch</h2>
        <label className="flex items-center gap-3 rounded-card border border-surface-border bg-surface px-4 py-3">
          <input type="checkbox" checked={all} onChange={() => save({ watchCities: all ? [s.homeCity] : ["ALL_INDIA"] })} className="h-4 w-4 accent-[var(--accent)]" />
          <span>
            <span className="font-medium">All India</span>
            <span className="block text-xs text-muted">Alert me for any Indian city (lower urgency outside your home city)</span>
          </span>
        </label>
        {!all && (
          <ul className="flex flex-wrap gap-2">
            {s.cities.map((c) => {
              const on = s.watchCities.includes(c) || c === s.homeCity;
              return (
                <li key={c}>
                  <button onClick={() => toggle(c)} aria-pressed={on} disabled={c === s.homeCity} className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-accent bg-accent text-accent-foreground" : "border-surface-border"}`}>
                    {c}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <footer className="flex items-center justify-between border-t border-surface-border pt-4">
        <button onClick={onBack} className="text-sm text-muted underline underline-offset-2">Back</button>
        <button
          onClick={() => {
            setSaving(true);
            onNext();
          }}
          disabled={saving}
          className="rounded-card bg-accent px-5 py-2.5 font-medium text-accent-foreground disabled:opacity-50"
        >
          Next: alerts
        </button>
      </footer>
    </div>
  );
}
