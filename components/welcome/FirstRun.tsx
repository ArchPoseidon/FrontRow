"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArtistPhoto } from "@/components/artist/ArtistPhoto";

type Show = {
  eventId: string;
  artistName: string;
  imageUrl: string | null;
  title: string | null;
  venue: string | null;
  city: string | null;
  date: string | null;
  status: string | null;
  ticketUrl: string | null;
  isFestival: boolean;
  inHomeCity: boolean;
  confidence: number | null;
  sources: { url: string; platform: string | null }[];
};
type Quiet = { artistId: string; name: string; imageUrl: string | null; lastIndia: string | null };
type Summary = { headline: string; total: number; shows: Show[]; quiet: Quiet[]; deepCheckLater: number; artistCount: number };
type StepState = "idle" | "running" | "done" | "error";

const STEPS = [
  { key: "instant", label: "Shows we already know about" },
  { key: "news", label: "News across India" },
  { key: "sweep", label: "Web search for each artist" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  rumored: "Rumour",
  announced: "Announced",
  sale_soon: "Sale starting soon",
  on_sale: "Tickets on sale",
  early_bird: "Early bird open",
  sold_out: "Sold out",
};

const fmtDate = (d: string | null) => (d ? new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`)) : "Date to be announced");

// Reads a server-sent-event stream from a POST request.
async function* readSse(res: Response) {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const event = /^event: (.*)$/m.exec(chunk)?.[1];
      const data = /^data: (.*)$/m.exec(chunk)?.[1];
      if (event && data) yield { event, data: JSON.parse(data) };
    }
  }
}

export function FirstRun() {
  const [steps, setSteps] = useState<Record<string, StepState>>({ instant: "idle", news: "idle", sweep: "idle" });
  const [log, setLog] = useState<string[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const started = useRef(false);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    setSummary(null);
    setLog([]);
    setSteps({ instant: "idle", news: "idle", sweep: "idle" });
    try {
      const res = await fetch("/api/scan/first-run", { method: "POST" });
      if (res.status === 401) {
        window.location.href = "/";
        return;
      }
      if (!res.ok || !res.body) throw new Error("The scan couldn't start");
      let finished = false;
      for await (const { event, data } of readSse(res)) {
        if (event === "log") setLog((l) => [...l, data.text]);
        else if (event === "step") setSteps((s) => ({ ...s, [data.step]: data.state }));
        else if (event === "done") {
          finished = true;
          setSummary(data);
        } else if (event === "error") throw new Error(data.message);
      }
      if (!finished) throw new Error("The scan was interrupted");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
  }, [run]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="font-display text-6xl leading-[0.9] font-black">{summary ? "Here's what we found" : "Checking your artists"}</h1>
        <p className="text-sm text-muted">{summary ? "Real shows, with their sources. Nothing here is made up." : "This takes about a minute. Results appear as they come in."}</p>
      </header>

      {!summary && (
        <section aria-live="polite" className="space-y-4 rounded-card border border-surface-border bg-surface p-4">
          <ul className="space-y-2">
            {STEPS.map((s) => (
              <li key={s.key} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-center" aria-hidden>
                  {steps[s.key] === "done" ? "✓" : steps[s.key] === "error" ? "!" : steps[s.key] === "running" ? <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" /> : "·"}
                </span>
                <span className={steps[s.key] === "idle" ? "text-muted" : ""}>{s.label}</span>
                {steps[s.key] === "error" && <span className="text-xs text-urgency-amber">couldn&apos;t reach this source</span>}
              </li>
            ))}
          </ul>
          <ul className="max-h-48 space-y-1 overflow-y-auto border-t border-surface-border pt-3 font-mono text-xs text-muted">
            {log.length === 0 && !error && <li>Starting…</li>}
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-card border border-urgency-red/60 bg-surface px-4 py-3 text-sm">
          <span>{error}</span>
          <button onClick={run} disabled={running} className="rounded-card border border-surface-border px-3 py-1.5 font-medium disabled:opacity-50">
            Try again
          </button>
        </div>
      )}

      {summary && (
        <>
          <p className="text-lg font-medium">{summary.headline}</p>
          {summary.shows.length > 0 && (
            <ul className="space-y-3">
              {summary.shows.map((s) => (
                <li key={s.eventId} className="space-y-3 rounded-card border border-surface-border bg-surface p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-14 shrink-0"><ArtistPhoto name={s.artistName} imageUrl={s.imageUrl} /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{s.artistName}</p>
                      <p className="truncate text-sm text-muted">{[s.venue, s.city].filter(Boolean).join(" · ") || "Venue to be announced"}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${s.status === "early_bird" ? "bg-urgency-red text-accent-foreground" : "border border-surface-border text-muted"}`}>
                      {STATUS_LABEL[s.status ?? "announced"] ?? "Announced"}
                    </span>
                  </div>
                  <p className="text-sm">
                    {fmtDate(s.date)}
                    {s.inHomeCity && <span className="ml-2 text-muted">· Your city</span>}
                    {s.isFestival && <span className="ml-2 text-muted">· Festival</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {(s.confidence ?? 0) >= 0.9 ? "Confirmed" : "Unconfirmed"} ·{" "}
                    {s.sources.slice(0, 3).map((src, i) => (
                      <span key={src.url}>
                        {i > 0 && ", "}
                        <a href={src.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                          {src.platform ?? new URL(src.url).hostname}
                        </a>
                      </span>
                    ))}
                  </p>
                  {s.ticketUrl && (
                    <a href={s.ticketUrl} target="_blank" rel="noopener noreferrer" className="inline-block rounded-card bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">
                      Get tickets
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}

          {summary.quiet.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-medium text-muted">{summary.total ? "No India show announced yet" : "What we checked"}</h2>
              <ul className="divide-y divide-surface-border rounded-card border border-surface-border bg-surface">
                {summary.quiet.slice(0, 30).map((q) => (
                  <li key={q.artistId} className="flex items-center gap-3 px-3 py-2">
                    <div className="h-9 w-9 shrink-0"><ArtistPhoto name={q.name} imageUrl={q.imageUrl} /></div>
                    <span className="min-w-0 flex-1 truncate text-sm">{q.name}</span>
                    <span className="shrink-0 text-xs text-muted">{q.lastIndia ?? "Not yet found in India"}</span>
                  </li>
                ))}
              </ul>
              {summary.quiet.length > 30 && <p className="text-xs text-muted">and {summary.quiet.length - 30} more</p>}
            </section>
          )}
          {summary.deepCheckLater > 0 && <p className="text-sm text-muted">Deep check for {summary.deepCheckLater} more artist{summary.deepCheckLater === 1 ? "" : "s"} runs tonight.</p>}
          <Link href="/radar" className="self-start rounded-card bg-accent px-5 py-2.5 font-medium text-accent-foreground">
            Go to my radar
          </Link>
        </>
      )}
    </div>
  );
}
