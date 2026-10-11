"use client";

import { useCallback, useEffect, useState } from "react";

type S = { name: string | null; email: string | null; image: string | null; homeCity: string; watchCities: string[]; emailEnabled: boolean; telegramLinked: boolean; emailAvailable: boolean; cities: string[] };
type Link = { linked: boolean; url?: string | null; configured?: boolean };

export function SettingsForm({ isOwner }: { isOwner: boolean }) {
  const [s, setS] = useState<S | null>(null);
  const [link, setLink] = useState<Link | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const loadLink = useCallback(() => fetch("/api/telegram/link").then((r) => r.json()).then(setLink).catch(() => {}), []);
  useEffect(() => {
    fetch("/api/settings").then((r) => (r.ok ? r.json() : Promise.reject())).then(setS).catch(() => setMsg({ tone: "error", text: "Couldn't load your settings" }));
    loadLink();
  }, [loadLink]);
  useEffect(() => {
    if (!link || link.linked || !link.url) return;
    const t = setInterval(loadLink, 3000);
    return () => clearInterval(t);
  }, [link, loadLink]);

  async function save(patch: Partial<S>) {
    if (!s) return;
    const prev = s;
    setS({ ...s, ...patch });
    try {
      const r = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!r.ok) throw new Error();
      setMsg({ tone: "ok", text: "Saved" });
    } catch {
      setS(prev);
      setMsg({ tone: "error", text: "Couldn't save that. Try again." });
    }
  }
  async function unlink() {
    await fetch("/api/telegram/link", { method: "DELETE" });
    await loadLink();
    setS((x) => (x ? { ...x, telegramLinked: false } : x));
    setMsg({ tone: "ok", text: "Telegram unlinked" });
  }
  async function del() {
    setBusy(true);
    try {
      const r = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      window.location.href = "/";
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Couldn't delete" });
      setBusy(false);
    }
  }

  if (!s) return msg ? <p role="alert" className="text-sm">{msg.text}</p> : <div className="space-y-4">{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-card bg-surface-border" />)}</div>;
  const all = s.watchCities.includes("ALL_INDIA");
  const card = "space-y-3 rounded-card border border-surface-border bg-surface p-4";
  return (
    <div className="flex flex-col gap-6">
      {msg && <p role="status" className={`rounded-card border px-4 py-2 text-sm ${msg.tone === "ok" ? "border-emerald-500/60" : "border-urgency-red/60"}`}>{msg.text}</p>}

      <section className={card}>
        <h2 className="font-semibold">Profile</h2>
        <div className="flex items-center gap-3">
          {s.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.image} alt="" width={48} height={48} className="rounded-full" referrerPolicy="no-referrer" />
          )}
          <div>
            <p className="font-medium">{s.name}</p>
            <p className="text-sm text-muted">{s.email} · from your Google account</p>
          </div>
        </div>
      </section>

      <section className={card}>
        <h2 className="font-semibold">Alert channels</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">Telegram</p>
            <p className="text-sm text-muted">{link === null ? "Checking…" : link.linked ? "Connected. Alerts arrive in your Telegram chat." : link.configured === false ? "Not set up on this server." : "Not connected."}</p>
          </div>
          {link?.linked ? (
            <button onClick={unlink} className="rounded-card border border-surface-border px-3 py-2 text-sm">Unlink</button>
          ) : link?.url ? (
            <a href={link.url} target="_blank" rel="noopener noreferrer" className="rounded-card bg-accent px-3 py-2 text-sm font-medium text-accent-foreground">Connect Telegram</a>
          ) : null}
        </div>
        {!link?.linked && link?.url && <p className="text-xs text-muted">Tap the button, then press Start in Telegram. This page updates by itself.</p>}
        <div className="border-t border-surface-border pt-3">
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={s.emailEnabled && s.emailAvailable} disabled={!s.emailAvailable} onChange={(e) => save({ emailEnabled: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
            <span>
              Email alerts and daily digest
              {!s.emailAvailable && <span className="block text-xs text-muted">Email isn&apos;t switched on for this server yet. Telegram is the way to get alerts for now.</span>}
            </span>
          </label>
        </div>
      </section>

      <section className={card}>
        <h2 className="font-semibold">Cities</h2>
        <label className="block text-sm">
          <span className="text-muted">Home city (loudest alerts)</span>
          <select value={s.homeCity} onChange={(e) => save({ homeCity: e.target.value })} className="mt-1 w-full rounded-card border border-surface-border bg-background px-3 py-2.5">
            {[...new Set([s.homeCity, ...s.cities])].map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={all} onChange={() => save({ watchCities: all ? [s.homeCity] : ["ALL_INDIA"] })} className="h-4 w-4 accent-[var(--accent)]" />
          All India
        </label>
        {!all && (
          <ul className="flex flex-wrap gap-2">
            {s.cities.map((c) => {
              const on = s.watchCities.includes(c) || c === s.homeCity;
              return (
                <li key={c}>
                  <button disabled={c === s.homeCity} aria-pressed={on} onClick={() => save({ watchCities: s.watchCities.includes(c) ? s.watchCities.filter((x) => x !== c) : [...s.watchCities, c] })} className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-accent bg-accent text-accent-foreground" : "border-surface-border"}`}>{c}</button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {!isOwner && (
        <section className={`${card} border-urgency-red/40`}>
          <h2 className="font-semibold">Delete account</h2>
          <p className="text-sm text-muted">Removes your artists, alerts and Telegram link for good. Type DELETE to confirm.</p>
          <div className="flex gap-2">
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" className="min-w-0 flex-1 rounded-card border border-surface-border bg-background px-3 py-2" aria-label="Type DELETE" />
            <button onClick={del} disabled={confirm !== "DELETE" || busy} className="rounded-card bg-urgency-red px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Deleting…" : "Delete"}</button>
          </div>
        </section>
      )}
    </div>
  );
}
