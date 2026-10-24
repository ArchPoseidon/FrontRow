"use client";

import { useState, useTransition } from "react";
import { setPriorityAction } from "@/app/artists/actions";
import type { Priority } from "@/lib/artists/queries";

const LABEL: Record<Priority, string> = { must_see: "Must-see", follow: "Follow", muted: "Muted" };
const TONE: Record<Priority, string> = {
  must_see: "bg-[var(--magenta)] text-black border-transparent",
  follow: "bg-surface text-foreground border-surface-border",
  muted: "bg-transparent text-muted border-dashed border-surface-border",
};

// Priority chip that is also the control: a native select, so it works well on phones.
export function PriorityControl({ artistId, value, onChange, size = "sm" }: { artistId: string; value: Priority; onChange?: (p: Priority) => void; size?: "sm" | "md" }) {
  const [p, setP] = useState(value);
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();
  const change = (next: Priority) => {
    const prev = p;
    setP(next);
    setErr(null);
    onChange?.(next);
    start(async () => {
      const r = await setPriorityAction(artistId, next).catch(() => ({ ok: false as const, error: "Couldn't save that" }));
      if (!r.ok) {
        setP(prev);
        onChange?.(prev);
        setErr(r.error);
      }
    });
  };
  return (
    <span className="inline-flex flex-col">
      <select
        aria-label="Priority"
        value={p}
        onChange={(e) => change(e.target.value as Priority)}
        className={`cursor-pointer appearance-none rounded-full border font-semibold ${size === "md" ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs"} ${TONE[p]}`}
      >
        {(Object.keys(LABEL) as Priority[]).map((k) => (
          <option key={k} value={k} className="bg-surface text-foreground">{LABEL[k]}</option>
        ))}
      </select>
      {err && <span role="alert" className="mt-1 text-xs text-[var(--urgency-red)]">{err}</span>}
    </span>
  );
}
