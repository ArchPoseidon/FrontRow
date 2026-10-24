"use client";

import { useState, useTransition } from "react";
import { plusAction } from "@/app/plans/actions";

export function PlusButton({ paymentsEnabled, priceInr }: { paymentsEnabled: boolean; priceInr: number }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function go() {
    setMsg(null);
    start(async () => {
      try {
        const r = await plusAction();
        if (r.kind === "redirect") window.location.href = r.url;
        else if (r.kind === "waitlisted") setMsg("You're on the waitlist. We'll message you when Plus opens.");
        else if (r.kind === "already") setMsg("You're already on the waitlist.");
        else if (r.kind === "error") setMsg(r.message);
      } catch {
        setMsg("Something went wrong. Try again.");
      }
    });
  }
  return (
    <div>
      <button onClick={go} disabled={pending} className="w-full rounded-full bg-[var(--magenta)] px-6 py-3 font-medium text-white disabled:opacity-50">
        {paymentsEnabled ? `Get Plus${priceInr > 0 ? ` · ₹${priceInr}` : ""}` : "Coming soon — join the waitlist"}
      </button>
      {msg && <p className="mt-2 text-sm" role="status">{msg}</p>}
    </div>
  );
}
