"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setCallMeAction } from "@/app/artists/actions";

// "Call me when tickets drop" switch for one artist. Placing calls is separately gated by VOICE_CALLS_ENABLED.
export function CallMeToggle({ artistId, initial, label = "Call me", onChange }: { artistId: string; initial: boolean; label?: string; onChange?: (on: boolean) => void }) {
  const [on, setOn] = useState(initial);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean; link?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const flip = () => {
    const next = !on;
    setOn(next);
    setMsg(null);
    onChange?.(next);
    start(async () => {
      const r = await setCallMeAction(artistId, next).catch(() => ({ ok: false as const, error: "Couldn't save that" }));
      if (!r.ok) {
        setOn(!next);
        onChange?.(!next);
        setMsg({ text: r.error, bad: true });
      } else if (next && r.needsPhone) setMsg({ text: "Add your number and consent to calls to finish.", link: true });
    });
  };
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={pending}
        onClick={flip}
        className="inline-flex items-center gap-2 rounded-full border border-surface-border bg-surface px-3 py-1.5 text-xs font-semibold"
      >
        <span aria-hidden className={`relative h-4 w-7 rounded-full transition ${on ? "bg-[var(--magenta)]" : "bg-surface-border"}`}>
          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? "left-3.5" : "left-0.5"}`} />
        </span>
        {label}
      </button>
      {msg && (
        <span role="status" className={`mt-1 max-w-56 text-xs ${msg.bad ? "text-[var(--urgency-red)]" : "text-muted"}`}>
          {msg.text} {msg.link && <Link href="/radar#call-me" className="underline">Open Call me</Link>}
        </span>
      )}
    </span>
  );
}
