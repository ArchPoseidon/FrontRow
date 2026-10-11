"use client";

import { useState } from "react";
import { SpotifyMark } from "./SpotifyMark";

// Perforated line streaming between the FrontRow stub and Spotify, then the real redirect.
export function ConnectOverlay({ phase }: { phase: "connecting" | "importing" }) {
  const steps = phase === "connecting" ? ["Opening Spotify", "Asking to read who you follow", "Back in a moment"] : ["Signed in", "Reading followed artists", "Reading top artists", "Matching to the right people"];
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-background/85 backdrop-blur-md px-6" role="status" aria-live="polite">
      <div className="flex w-full max-w-xs items-center">
        <div className="flex h-16 w-16 shrink-0 -rotate-3 items-center justify-center rounded-md border border-surface-border bg-surface font-display text-3xl font-black text-accent">F</div>
        <div className="relative mx-1 h-0.5 flex-1">
          <div className="perf-line absolute inset-x-0 top-0" />
          {[0, 0.6, 1.2].map((d) => (
            <i key={d} className="absolute -top-[3px] h-2 w-2 rounded-sm bg-[#1DB954]" style={{ animation: `trk-dot 1.8s linear ${d}s infinite` }} />
          ))}
        </div>
        <div className="flex h-16 w-16 shrink-0 rotate-3 items-center justify-center rounded-md border border-surface-border bg-[#121212]">
          <SpotifyMark size={38} />
        </div>
      </div>
      <div className="text-center">
        <h2 className="font-display text-4xl font-extrabold">{phase === "connecting" ? "Connecting to Spotify" : "Importing your artists"}</h2>
        <p className="mt-1 text-sm text-muted">Read-only. We only see who you follow and listen to.</p>
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {steps.map((s, i) => (
          <li key={s} className="rise-in flex items-center gap-3" style={{ animationDelay: `${0.3 + i * 0.7}s` }}>
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--tier-open)] text-[10px] font-bold text-black">✓</span>
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

// The "Connect Spotify" button: plays the animation for a beat, then goes to the real OAuth redirect.
export function ConnectSpotifyButton({ children, className }: { children: React.ReactNode; className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <a
        href="/api/spotify/login"
        onClick={(e) => {
          e.preventDefault();
          setBusy(true);
          setTimeout(() => {
            window.location.href = "/api/spotify/login";
          }, 1700);
        }}
        className={className}
      >
        {children}
      </a>
      {busy && <ConnectOverlay phase="connecting" />}
    </>
  );
}
