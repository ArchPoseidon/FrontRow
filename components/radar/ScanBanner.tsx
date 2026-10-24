"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Slim, dismissible banner while the first scan runs in the background. Refreshes the radar until it settles.
export function ScanBanner({ since, count }: { since: string; count: number }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try { if (sessionStorage.getItem("fr-scan-banner") === "1") setHidden(true); } catch {}
    const t = setInterval(() => {
      if (Date.now() - new Date(since).getTime() > 4 * 60_000) return clearInterval(t);
      router.refresh();
    }, 6000);
    return () => clearInterval(t);
  }, [since, router]);
  if (hidden) return null;
  return (
    <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-card border border-surface-border bg-surface/80 px-4 py-2.5 text-sm backdrop-blur">
      <span><span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-magenta" />Finding your shows… we&apos;ll message you the moment one lands. <b>{count}</b> found so far.</span>
      <button aria-label="Dismiss" className="text-muted" onClick={() => { setHidden(true); try { sessionStorage.setItem("fr-scan-banner", "1"); } catch {} }}>✕</button>
    </div>
  );
}
