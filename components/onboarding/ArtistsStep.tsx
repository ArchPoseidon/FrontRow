"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArtistAvatar } from "@/components/artist/ArtistAvatar";
import { NEXT_PRIORITY, PRIORITY_LABEL, type Candidate, type MyArtist, type Priority, type ReviewItem } from "@/components/artist/types";
import { ReviewTray } from "./ReviewTray";

type Notice = { tone: "info" | "error" | "ok"; text: string } | null;

const SPOTIFY_NOTICES: Record<string, Notice> = {
  invite_only: { tone: "info", text: "Spotify import is invite-only during beta. Search or paste your artists instead. It takes about a minute." },
  imported: { tone: "ok", text: "Imported your followed and top artists from Spotify." },
  denied: { tone: "info", text: "Spotify connection was cancelled. You can search or paste artists instead." },
  error: { tone: "error", text: "Couldn't connect to Spotify. Search or paste your artists instead, or try again." },
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? "Something went wrong");
  return j as T;
}

export function ArtistsStep({ initialStep, spotifyFlag }: { initialStep: number; spotifyFlag?: string }) {
  const [step, setStep] = useState(initialStep >= 2 ? 2 : 1);
  const [artists, setArtists] = useState<MyArtist[] | null>(null);
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(spotifyFlag ? SPOTIFY_NOTICES[spotifyFlag] ?? null : null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Candidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [resolving, setResolving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ artists: MyArtist[]; review: ReviewItem[] }>("/api/artists");
      setArtists(d.artists);
      setReview(d.review);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load your artists");
    }
  }, []);

  useEffect(() => {
    load();
    if (spotifyFlag === "invite_only") searchRef.current?.focus();
  }, [load, spotifyFlag]);

  // Live Spotify search, debounced 300 ms.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setSearchError(null);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/artists/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Search failed");
        setResults(j.candidates);
        setSearchError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setSearchError(e instanceof Error ? e.message : "Search failed");
      } finally {
        if (!ctl.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [query]);

  const saveStep = (n: number) => {
    setStep(n);
    fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ onboardingStep: n }) }).catch(() => {});
  };

  const addFromSearch = async (c: Candidate) => {
    try {
      await api("/api/artists/confirm", { method: "POST", body: JSON.stringify({ via: "search", pick: { spotifyId: c.spotifyId, mbid: c.mbid } }) });
      setResults((rs) => rs?.map((x) => (x === c ? { ...x, alreadyAdded: true } : x)) ?? null);
      await load();
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Couldn't add that artist");
    }
  };

  const resolvePaste = async () => {
    setResolving(true);
    setNotice(null);
    try {
      const r = await api<{ resolved: unknown[]; needsReview: unknown[]; unverified: unknown[]; failed: { inputText: string; reason: string }[] }>(
        "/api/artists/resolve",
        { method: "POST", body: JSON.stringify({ inputs: pasteText }) },
      );
      const added = r.resolved.length + r.unverified.length;
      const parts = [`Added ${added} artist${added === 1 ? "" : "s"}`];
      if (r.needsReview.length) parts.push(`${r.needsReview.length} need${r.needsReview.length === 1 ? "s" : ""} your confirmation`);
      if (r.failed.length) parts.push(`${r.failed.length} couldn't be looked up (${r.failed.map((f) => f.inputText).join(", ")})`);
      setNotice({ tone: r.failed.length ? "error" : "ok", text: parts.join(". ") + "." });
      setPasteText("");
      await load();
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof Error ? e.message : "Couldn't read that list" });
    } finally {
      setResolving(false);
    }
  };

  const cyclePriority = async (a: MyArtist) => {
    const next: Priority = NEXT_PRIORITY[a.priority];
    setArtists((as) => as?.map((x) => (x.id === a.id ? { ...x, priority: next } : x)) ?? null);
    try {
      await api("/api/artists", { method: "PATCH", body: JSON.stringify({ artistId: a.id, priority: next }) });
    } catch {
      setArtists((as) => as?.map((x) => (x.id === a.id ? { ...x, priority: a.priority } : x)) ?? null);
    }
  };

  const remove = async (a: MyArtist) => {
    setArtists((as) => as?.filter((x) => x.id !== a.id) ?? null);
    try {
      await api(`/api/artists?artistId=${a.id}`, { method: "DELETE" });
    } catch {
      load();
    }
  };

  const reopen = async (a: MyArtist) => {
    try {
      await api("/api/artists", { method: "PATCH", body: JSON.stringify({ artistId: a.id, reopen: true }) });
      await load();
    } catch (e) {
      setNotice({ tone: "info", text: e instanceof Error ? e.message : "No other matches found" });
    }
  };

  const confirm = async (item: ReviewItem, body: object) => {
    await api("/api/artists/confirm", { method: "POST", body: JSON.stringify({ candidateId: item.candidateId, ...body }) });
    await load();
  };

  const count = artists?.length ?? 0;
  const mustSee = artists?.filter((a) => a.priority === "must_see").length ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">{step === 1 ? "Who do you want to catch live?" : "Confirm your artists"}</h1>
          <span className="text-sm text-muted">Step {step} of 4</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-border" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={4}>
          <div className="h-full bg-accent transition-all" style={{ width: `${(step / 4) * 100}%` }} />
        </div>
        <p className="text-sm text-muted" aria-live="polite">
          {artists === null ? "Loading your artists…" : `${count} artist${count === 1 ? "" : "s"} added${mustSee ? ` · ${mustSee} must-see` : ""}`}
        </p>
      </header>

      {notice && (
        <p role="status" className={`rounded-card border px-4 py-3 text-sm ${notice.tone === "error" ? "border-urgency-red/60" : notice.tone === "ok" ? "border-emerald-500/60" : "border-surface-border"}`}>
          {notice.text}
        </p>
      )}
      {loadError && (
        <p role="alert" className="rounded-card border border-urgency-red/60 px-4 py-3 text-sm">
          {loadError}{" "}
          <button className="underline" onClick={load}>Retry</button>
        </p>
      )}

      <ReviewTray
        items={review}
        onPick={(item, c) => confirm(item, { pick: { spotifyId: c.spotifyId, mbid: c.mbid } })}
        onAsTyped={(item) => confirm(item, { asTyped: true })}
        onRemove={(item) => confirm(item, { remove: true })}
      />

      {step === 1 && (
        <>
          <section className="flex flex-col gap-3">
            <a href="/api/spotify/login" className="flex items-center justify-center rounded-card border border-surface-border bg-surface px-4 py-3 font-medium transition hover:border-accent">
              Connect Spotify
            </a>
            <div className="relative">
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search an artist by name"
                aria-label="Search artists"
                className="w-full rounded-card border border-surface-border bg-surface px-4 py-3 outline-none focus:border-accent"
              />
              {searching && <span className="absolute top-1/2 right-4 -translate-y-1/2 text-xs text-muted">Searching…</span>}
            </div>
            {searchError && <p role="alert" className="text-sm text-urgency-red">{searchError}</p>}
            {results && results.length === 0 && !searching && !searchError && (
              <p className="text-sm text-muted">No artists found for “{query.trim()}”. Try the paste option and add it as typed.</p>
            )}
            {results && results.length > 0 && (
              <ul className="flex flex-col gap-2">
                {results.map((c) => (
                  <li key={c.spotifyId ?? c.mbid} className="flex items-center gap-3 rounded-card border border-surface-border bg-surface p-2">
                    <ArtistAvatar name={c.name} imageUrl={c.imageUrl} size={48} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="truncate text-xs text-muted">{c.genres?.length ? c.genres.join(", ") : c.hint ?? (c.source === "musicbrainz" ? "From MusicBrainz" : "")}</p>
                    </div>
                    <button
                      disabled={c.alreadyAdded}
                      onClick={() => addFromSearch(c)}
                      className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:bg-surface-border disabled:text-muted"
                    >
                      {c.alreadyAdded ? "Added" : "Add"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-card border border-surface-border bg-surface">
            <button onClick={() => setPasteOpen((o) => !o)} aria-expanded={pasteOpen} className="flex w-full items-center justify-between px-4 py-3 text-left font-medium">
              Paste a list
              <span className="text-muted">{pasteOpen ? "−" : "+"}</span>
            </button>
            {pasteOpen && (
              <div className="flex flex-col gap-3 border-t border-surface-border p-4">
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={6}
                  placeholder={"One per line or comma separated.\nNames or open.spotify.com/artist links."}
                  aria-label="Paste artist names or Spotify links"
                  className="w-full rounded-card border border-surface-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <button
                  onClick={resolvePaste}
                  disabled={resolving || !pasteText.trim()}
                  className="self-start rounded-card bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
                >
                  {resolving ? "Finding artists…" : "Add these"}
                </button>
              </div>
            )}
          </section>
        </>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Your artists</h2>
          {step === 2 && <p className="text-xs text-muted">Tap a card to cycle Follow → Must-see → Muted</p>}
        </div>
        {artists === null && !loadError && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-card bg-surface-border" />
            ))}
          </div>
        )}
        {artists && artists.length === 0 && (
          <p className="rounded-card border border-dashed border-surface-border px-4 py-8 text-center text-sm text-muted">
            No artists yet. Search above, paste a list, or connect Spotify to get started.
          </p>
        )}
        {artists && artists.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {artists.map((a) => (
              <li key={a.id} className={`relative flex flex-col items-center gap-2 rounded-card border bg-surface p-3 text-center ${a.priority === "must_see" ? "border-accent" : "border-surface-border"} ${a.priority === "muted" ? "opacity-50" : ""}`}>
                <button onClick={() => cyclePriority(a)} aria-label={`${a.name}: ${PRIORITY_LABEL[a.priority]}. Tap to change.`} className="flex w-full flex-col items-center gap-2">
                  <ArtistAvatar name={a.name} imageUrl={a.imageUrl} size={64} />
                  <span className="w-full truncate text-sm font-medium">{a.name}</span>
                  <span className="text-xs text-muted">{PRIORITY_LABEL[a.priority]}</span>
                </button>
                {a.identityStatus === "unverified" && <span className="rounded-full border border-surface-border px-2 py-0.5 text-[10px] text-muted">Name only</span>}
                <button onClick={() => reopen(a)} className="text-[11px] text-muted underline underline-offset-2 hover:text-foreground">Is this the right artist?</button>
                <button onClick={() => remove(a)} aria-label={`Remove ${a.name}`} className="absolute top-1 right-2 text-lg leading-none text-muted hover:text-foreground">×</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="flex items-center justify-between gap-3 border-t border-surface-border pt-4">
        {step === 2 ? (
          <button onClick={() => saveStep(1)} className="text-sm text-muted underline underline-offset-2">Back</button>
        ) : (
          <span />
        )}
        {step === 1 ? (
          <button onClick={() => saveStep(2)} disabled={count === 0} className="rounded-card bg-accent px-5 py-2.5 font-medium text-accent-foreground disabled:opacity-50">
            Next: confirm
          </button>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <button disabled={review.length > 0 || count === 0} className="rounded-card bg-accent px-5 py-2.5 font-medium text-accent-foreground disabled:opacity-50">
              Continue
            </button>
            {review.length > 0 && <p className="text-xs text-muted">Resolve or remove the {review.length} unconfirmed first.</p>}
            {review.length === 0 && count > 0 && <p className="text-xs text-muted">Cities and alerts steps arrive in a later phase.</p>}
          </div>
        )}
      </footer>
    </div>
  );
}
