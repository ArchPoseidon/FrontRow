"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { followAction, setPriorityAction } from "@/app/artists/actions";
import type { Priority } from "@/lib/artists/queries";
import { CallMeToggle } from "./CallMeToggle";
import { PriorityControl } from "./PriorityControl";

// Header controls on /artists/[id]: priority, Mute/Unmute, Call me. A not-yet-followed artist shows Follow instead.
export function ArtistActions({ artistId, following, priority, callMe, voiceOn }: { artistId: string; following: boolean; priority: Priority; callMe: boolean; voiceOn: boolean }) {
  const router = useRouter();
  const [p, setP] = useState(priority);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [lastActive, setLast] = useState<Priority>(priority === "muted" ? "follow" : priority);

  if (!following)
    return (
      <div>
        <button type="button" disabled={pending} onClick={() => start(async () => { const r = await followAction(artistId); if (r.ok) router.refresh(); else setErr(r.error); })} className="rounded-card bg-accent px-4 py-2 text-sm font-bold text-accent-foreground">Follow</button>
        {err && <p role="alert" className="mt-1 text-xs text-[var(--urgency-red)]">{err}</p>}
      </div>
    );

  const toggleMute = () => {
    const next: Priority = p === "muted" ? lastActive : "muted";
    if (p !== "muted") setLast(p);
    const prev = p;
    setP(next);
    start(async () => {
      const r = await setPriorityAction(artistId, next).catch(() => ({ ok: false as const, error: "Couldn't save that" }));
      if (!r.ok) { setP(prev); setErr(r.error); } else router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-start gap-2">
      <PriorityControl key={p} artistId={artistId} value={p} onChange={(v) => { setP(v); if (v !== "muted") setLast(v); }} size="md" />
      <button type="button" disabled={pending} onClick={toggleMute} className="rounded-full border border-surface-border px-4 py-2 text-sm font-semibold">{p === "muted" ? "Unmute" : "Mute"}</button>
      {p !== "muted" && <CallMeToggle artistId={artistId} initial={callMe} label="Call me when tickets drop" />}
      {!voiceOn && p !== "muted" && <p className="basis-full text-xs text-muted">Voice calls switch on soon. Your choice is saved.</p>}
      {err && <p role="alert" className="basis-full text-xs text-[var(--urgency-red)]">{err}</p>}
    </div>
  );
}
