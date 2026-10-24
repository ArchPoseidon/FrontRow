"use client";

import { useCallback, useEffect, useState } from "react";

type S = { name: string | null; email: string | null; image: string | null; homeCity: string; p1Cities: string[]; p2Cities: string[]; watchAllIndia: boolean; emailEnabled: boolean; telegramLinked: boolean; emailAvailable: boolean; cities: string[] };
type Link = { linked: boolean; url?: string | null; configured?: boolean };

export function SettingsForm({ isOwner, embedded }: { isOwner: boolean; embedded?: boolean }) {
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
  const card = "space-y-3 rounded-card border border-surface-border bg-surface p-4";
  const pickP1 = (c: string) => {
    const on = s.p1Cities.includes(c);
    if (!on && s.p1Cities.length >= 3) return;
    const p1 = on ? s.p1Cities.filter((x) => x !== c) : [...s.p1Cities, c];
    save({ p1Cities: p1, p2Cities: s.p2Cities.filter((x) => !p1.includes(x)) });
  };
  const pickP2 = (c: string) => {
    if (s.p1Cities.includes(c)) return;
    const on = s.p2Cities.includes(c);
    if (!on && s.p2Cities.length >= 5) return;
    save({ p2Cities: on ? s.p2Cities.filter((x) => x !== c) : [...s.p2Cities, c] });
  };
  const chip = (on: boolean, off?: boolean) => `rounded-full border px-3 py-1.5 text-sm ${on ? "border-magenta bg-magenta text-white" : "border-surface-border"} ${off ? "opacity-40" : ""}`;
  return (
    <div className="flex flex-col gap-6">
      {msg && <p role="status" className={`rounded-card border px-4 py-2 text-sm ${msg.tone === "ok" ? "border-emerald-500/60" : "border-urgency-red/60"}`}>{msg.text}</p>}

      {!embedded && <section className={card}>
        <h2 className="font-semibold">Profile</h2>
        <p className="font-medium">{s.name}</p>
        <p className="text-sm text-muted">{s.email} · from your Google account</p>
      </section>}

      <section className={card}>
        <h2 className="font-semibold">Cities</h2>
        <p className="text-sm text-muted">P1 cities get an instant alert (up to 3). P2 cities get one when tickets open or the artist is must-see (up to 5).</p>
        <h3 className="text-sm font-semibold">P1 · alert me instantly ({s.p1Cities.length}/3)</h3>
        <ul className="flex flex-wrap gap-2">{s.cities.map((c) => <li key={c}><button aria-pressed={s.p1Cities.includes(c)} onClick={() => pickP1(c)} className={chip(s.p1Cities.includes(c), !s.p1Cities.includes(c) && s.p1Cities.length >= 3)}>{c}</button></li>)}</ul>
        <h3 className="text-sm font-semibold">P2 · also tell me ({s.p2Cities.length}/5)</h3>
        <ul className="flex flex-wrap gap-2">{s.cities.filter((c) => !s.p1Cities.includes(c)).map((c) => <li key={c}><button aria-pressed={s.p2Cities.includes(c)} onClick={() => pickP2(c)} className={chip(s.p2Cities.includes(c), !s.p2Cities.includes(c) && s.p2Cities.length >= 5)}>{c}</button></li>)}</ul>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={s.watchAllIndia} onChange={() => save({ watchAllIndia: !s.watchAllIndia })} className="h-4 w-4 accent-[var(--magenta)]" />
          All India (other cities arrive in the daily digest)
        </label>
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
