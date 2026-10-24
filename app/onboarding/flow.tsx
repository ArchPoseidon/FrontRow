"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addArtistAction, addKnownArtistAction, addKnownManyAction, chooseCandidateAction, finishOnboardingAction,
  pasteAction, removeArtistAction, saveCitiesAction, searchArtistsAction, type MyArtist,
} from "./actions";
import type { SpotifyArtist } from "@/lib/identity/spotify";
import { MAJOR_CITIES } from "@/lib/util/cities";

type Sug = { id: string; name: string; image: string | null; genres: string[] };
type Cand = { id: string; input: string; options: SpotifyArtist[] };

function Tile({ name, image, selected, onClick, hint }: { name: string; image: string | null; selected: boolean; onClick: () => void; hint?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={`relative w-36 shrink-0 snap-start overflow-hidden rounded-2xl text-left transition sm:w-40 ${selected ? "ring-2 ring-[var(--magenta)]" : "ring-1 ring-white/10"}`}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" loading="lazy" className="aspect-square w-full object-cover" />
      ) : (
        <div className="grid aspect-square w-full place-items-center bg-[var(--ink-2)] font-display text-4xl text-[var(--wordmark-soft)]">
          {name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
        </div>
      )}
      <div className="bg-[var(--ink-2)] p-2">
        <p className="truncate text-sm font-medium">{name}</p>
        {hint && <p className="truncate text-xs text-muted">{hint}</p>}
      </div>
      {selected && <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-[var(--magenta)] text-sm text-white">✓</span>}
    </button>
  );
}

function Row({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (d: number) => ref.current?.scrollBy({ left: d * 320, behavior: "smooth" });
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-display text-2xl uppercase tracking-wide">{title}</h2>
        <div className="flex items-center gap-2">
          {action}
          <button onClick={() => scroll(-1)} className="hidden size-8 rounded-full bg-white/10 sm:block" aria-label="Scroll left">‹</button>
          <button onClick={() => scroll(1)} className="hidden size-8 rounded-full bg-white/10 sm:block" aria-label="Scroll right">›</button>
        </div>
      </div>
      <div
        ref={ref}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ WebkitOverflowScrolling: "touch", maskImage: "linear-gradient(to right, transparent, #000 16px, #000 calc(100% - 24px), transparent)" }}
      >
        {children}
      </div>
    </section>
  );
}

export function OnboardingFlow(props: {
  firstName: string; initialMine: MyArtist[]; suggestions: { touring: Sug[]; popular: Sug[] };
  spotify: { connected: boolean; name: string | null }; cities: { p1: string[]; p2: string[]; allIndia: boolean };
  notice: string | null; candidates: Cand[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [mine, setMine] = useState<Map<string, MyArtist>>(new Map(props.initialMine.map((a) => [a.id, a])));
  const [cands, setCands] = useState<Cand[]>(props.candidates);
  const [msg, setMsg] = useState<string | null>(props.notice);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SpotifyArtist[]>([]);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [pending, start] = useTransition();
  const [p1, setP1] = useState<string[]>(props.cities.p1);
  const [p2, setP2] = useState<string[]>(props.cities.p2);
  const [allIndia, setAllIndia] = useState(props.cities.allIndia);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) return setResults([]);
      const r = await searchArtistsAction(q);
      setResults(r.results);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => { const s = () => setConnecting(false); window.addEventListener("pageshow", s); return () => window.removeEventListener("pageshow", s); }, []);

  const add = (a: MyArtist) => setMine((m) => new Map(m).set(a.id, a));
  const drop = (id: string) => setMine((m) => { const n = new Map(m); n.delete(id); return n; });

  const toggleKnown = (s: Sug) =>
    mine.has(s.id)
      ? (drop(s.id), void removeArtistAction(s.id))
      : (add({ id: s.id, name: s.name, image: s.image, priority: "follow" }), void addKnownArtistAction(s.id));

  const addSpotify = (a: SpotifyArtist) =>
    start(async () => {
      const r = await addArtistAction(a);
      if (r.kind === "added") add({ id: r.artistId, name: r.name, image: a.image, priority: "follow" });
      else if (r.kind === "inactive") setMsg(`${r.name} is no longer touring.`);
    });

  const selectAll = (list: Sug[]) =>
    start(async () => {
      const ids = list.filter((s) => !mine.has(s.id)).map((s) => s.id);
      const done = await addKnownManyAction(ids);
      list.filter((s) => done.includes(s.id)).forEach((s) => add({ id: s.id, name: s.name, image: s.image, priority: "follow" }));
    });

  const runPaste = () =>
    start(async () => {
      const r = await pasteAction(paste);
      setPaste("");
      setMsg(`${r.added} added${r.inactive.length ? `; ${r.inactive.join(", ")} no longer touring` : ""}.`);
      setCands((c) => [...c, ...r.choose.map((x) => ({ id: x.candidateId, input: x.input, options: x.options }))]);
      router.refresh();
    });

  const choose = (c: Cand, pick: SpotifyArtist | null) =>
    start(async () => {
      const r = await chooseCandidateAction(c.id, pick);
      setCands((x) => x.filter((y) => y.id !== c.id));
      if (r?.kind === "added") add({ id: r.artistId, name: r.name, image: pick?.image ?? null, priority: "follow" });
    });

  const togglePick = (list: string[], set: (v: string[]) => void, other: string[], setOther: (v: string[]) => void, max: number, city: string) => {
    if (list.includes(city)) return set(list.filter((c) => c !== city));
    if (list.length >= max) return;
    set([...list, city]);
    setOther(other.filter((c) => c !== city));
  };

  const saveCities = () => start(async () => { await saveCitiesAction({ p1, p2, allIndia }); setStep(2); });
  const finish = () => start(async () => { await finishOnboardingAction(); router.replace("/radar"); });

  const mineList = useMemo(() => [...mine.values()], [mine]);
  const canContinue = mine.size > 0 && cands.length === 0;

  return (
    <div>
      <header className="sticky top-0 z-20 -mx-4 flex items-center justify-between gap-3 bg-[var(--ink)]/90 px-4 py-3 backdrop-blur">
        <span className="font-display text-2xl uppercase text-[var(--wordmark)]">Front<span className="text-[var(--wordmark-soft)]">Row</span></span>
        {step === 0 && (
          <button disabled={!canContinue || pending} onClick={() => setStep(1)} className="rounded-full bg-[var(--magenta)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            Confirm {mine.size} artist{mine.size === 1 ? "" : "s"} and continue
          </button>
        )}
      </header>
      <p className="mt-1 text-xs uppercase tracking-widest text-muted">Step {step + 1} of 3 · {["Artists", "Cities", "Alerts"][step]}</p>
      {msg && <p className="mt-3 rounded-xl bg-white/10 p-3 text-sm" role="status">{msg}</p>}

      {step === 0 && (
        <>
          <h1 className="mt-3 font-display text-4xl uppercase">Who do you want to see{props.firstName ? `, ${props.firstName}` : ""}?</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href="/api/spotify/connect"
              onClick={() => setConnecting(true)}
              className="rounded-full bg-[#1db954] px-4 py-2 text-sm font-semibold text-black"
            >
              {props.spotify.connected ? `Re-import from Spotify${props.spotify.name ? ` (${props.spotify.name})` : ""}` : "Import from Spotify"}
            </a>
            <button onClick={() => setShowPaste((s) => !s)} className="rounded-full bg-white/10 px-4 py-2 text-sm">Paste a list</button>
          </div>
          {connecting && <p className="mt-2 text-sm text-muted">Opening Spotify… <a className="underline" href="/api/spotify/connect">Open Spotify</a> · <button className="underline" onClick={() => setConnecting(false)}>Cancel</button></p>}
          {showPaste && (
            <div className="mt-3">
              <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} placeholder="One artist per line, or Spotify links" className="w-full rounded-xl bg-[var(--ink-2)] p-3 text-sm ring-1 ring-white/10" />
              <button disabled={!paste.trim() || pending} onClick={runPaste} className="mt-2 rounded-full bg-white/15 px-4 py-2 text-sm disabled:opacity-40">{pending ? "Adding…" : "Add these"}</button>
            </div>
          )}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any artist" className="mt-4 w-full rounded-xl bg-[var(--ink-2)] px-4 py-3 ring-1 ring-white/10" />

          {cands.length > 0 && (
            <section className="mt-4 rounded-2xl bg-white/5 p-3">
              <h2 className="font-display text-xl uppercase">Which one?</h2>
              {cands.map((c) => (
                <div key={c.id} className="mt-2">
                  <p className="text-sm text-muted">“{c.input}”</p>
                  <div className="mt-1 flex snap-x gap-3 overflow-x-auto pb-1">
                    {c.options.map((o) => <Tile key={o.id} name={o.name} image={o.image} selected={false} onClick={() => choose(c, o)} hint={o.genres[0]} />)}
                  </div>
                  <button onClick={() => choose(c, null)} className="mt-1 text-xs underline text-muted">None of these, remove</button>
                </div>
              ))}
            </section>
          )}

          {results.length > 0 && (
            <Row title="Search results">
              {results.map((r) => {
                const sel = [...mine.values()].some((m) => m.name === r.name && m.image === r.image);
                return <Tile key={r.id} name={r.name} image={r.image} selected={sel} hint={r.genres[0]} onClick={() => addSpotify(r)} />;
              })}
            </Row>
          )}
          {props.suggestions.touring.length > 0 && (
            <Row title="Touring India now" action={<button onClick={() => selectAll(props.suggestions.touring)} className="text-xs underline">Select all visible</button>}>
              {props.suggestions.touring.map((s) => <Tile key={s.id} name={s.name} image={s.image} selected={mine.has(s.id)} hint={s.genres[0]} onClick={() => toggleKnown(s)} />)}
            </Row>
          )}
          {props.suggestions.popular.length > 0 && (
            <Row title="Popular with fans" action={<button onClick={() => selectAll(props.suggestions.popular)} className="text-xs underline">Select all visible</button>}>
              {props.suggestions.popular.map((s) => <Tile key={s.id} name={s.name} image={s.image} selected={mine.has(s.id)} hint={s.genres[0]} onClick={() => toggleKnown(s)} />)}
            </Row>
          )}

          {mineList.length > 0 && (
            <section className="mt-6">
              <h2 className="font-display text-2xl uppercase">Added · {mineList.length}</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {mineList.map((a) => (
                  <button key={a.id} onClick={() => { drop(a.id); void removeArtistAction(a.id); }} className="rounded-full bg-white/10 px-3 py-1 text-sm">{a.name} ×</button>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {step === 1 && (
        <>
          <h1 className="mt-3 font-display text-4xl uppercase">Where should we ping you?</h1>
          <CityGroup title="P1 · alert me instantly" hint="Up to 3" cities={MAJOR_CITIES} picked={p1} onPick={(c) => togglePick(p1, setP1, p2, setP2, 3, c)} />
          <CityGroup title="P2 · also tell me" hint="Up to 5" cities={MAJOR_CITIES.filter((c) => !p1.includes(c))} picked={p2} onPick={(c) => togglePick(p2, setP2, p1, setP1, 5, c)} />
          <label className="mt-6 flex items-center gap-3"><input type="checkbox" checked={allIndia} onChange={(e) => setAllIndia(e.target.checked)} className="size-5 accent-[var(--magenta)]" /> All India (digest only for other cities)</label>
          <div className="mt-6 flex gap-2">
            <button onClick={() => setStep(0)} className="rounded-full bg-white/10 px-4 py-2">Back</button>
            <button disabled={pending || (!p1.length && !p2.length && !allIndia)} onClick={saveCities} className="rounded-full bg-[var(--magenta)] px-5 py-2 font-semibold text-white disabled:opacity-40">Continue</button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="mt-3 font-display text-4xl uppercase">Get your alerts</h1>
          <p className="mt-2 text-muted">Telegram alerts switch on here in the next build step. You can link Telegram from Profile any time.</p>
          <div className="mt-6 flex gap-2">
            <button onClick={() => setStep(1)} className="rounded-full bg-white/10 px-4 py-2">Back</button>
            <button disabled={pending} onClick={finish} className="rounded-full bg-[var(--magenta)] px-5 py-2 font-semibold text-white">Go to my radar</button>
          </div>
        </>
      )}
    </div>
  );
}

function CityGroup({ title, hint, cities, picked, onPick }: { title: string; hint: string; cities: readonly string[]; picked: string[]; onPick: (c: string) => void }) {
  return (
    <section className="mt-6">
      <h2 className="font-display text-xl uppercase">{title} <span className="text-sm text-muted normal-case">{hint}</span></h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {cities.map((c) => (
          <button key={c} onClick={() => onPick(c)} aria-pressed={picked.includes(c)} className={`rounded-full px-3 py-1.5 text-sm ${picked.includes(c) ? "bg-[var(--magenta)] text-white" : "bg-white/10"}`}>{c}</button>
        ))}
      </div>
    </section>
  );
}
