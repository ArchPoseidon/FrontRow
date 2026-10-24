"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";

type Link = { linked: boolean; bot: string; url?: string | null; configured?: boolean };

export function AlertsStep({ onBack, onFinish, pending }: { onBack: () => void; onFinish: () => void; pending: boolean }) {
  const [link, setLink] = useState<Link | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const loadLink = useCallback(async () => {
    try {
      const r = await fetch("/api/telegram/link");
      if (r.ok) setLink(await r.json());
    } catch {
      /* retried by the poll */
    }
  }, []);
  useEffect(() => { void loadLink(); }, [loadLink]);
  useEffect(() => {
    if (!link || link.linked) return;
    const t = setInterval(loadLink, 2500);
    return () => clearInterval(t);
  }, [link, loadLink]);
  useEffect(() => {
    if (link?.url) QRCode.toDataURL(link.url, { margin: 1, width: 180 }).then(setQr).catch(() => setQr(null));
  }, [link?.url]);

  const sendTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch("/api/alerts/test", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Couldn't send");
      setTestResult({ tone: "ok", text: `Sent: ${j.sample ? "a sample card (none of your artists has a show yet)" : `${j.artist}${j.city ? ` in ${j.city}` : ""}`}.` });
    } catch (e) {
      setTestResult({ tone: "error", text: e instanceof Error ? e.message : "Couldn't send the test" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-5">
      <section className="space-y-3 rounded-2xl bg-white/5 p-4">
        <h2 className="font-semibold">Telegram <span className="ml-1 text-xs font-normal text-muted">fastest, recommended</span></h2>
        {!link ? (
          <div className="h-24 animate-pulse rounded-xl bg-white/10" />
        ) : link.linked ? (
          <p className="font-medium text-emerald-400">✓ Telegram connected</p>
        ) : !link.configured ? (
          <p className="text-sm text-muted">Telegram isn&apos;t set up on this server yet.</p>
        ) : (
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {qr && <img src={qr} alt="QR code to link Telegram" width={140} height={140} className="rounded-xl bg-white p-1" />}
            <div className="space-y-2 text-sm">
              <a href={link.url ?? "#"} target="_blank" rel="noopener noreferrer" className="inline-block rounded-full bg-[var(--magenta)] px-4 py-2.5 font-semibold text-white">Connect Telegram</a>
              <p className="text-muted">Scan the QR on your phone, or tap the button on this device, then press <b>Start</b>. This page updates by itself.</p>
              <p className="flex items-center gap-2 text-xs text-muted"><span className="inline-block size-2 animate-pulse rounded-full bg-amber-400" />Waiting for you to press Start…</p>
            </div>
          </div>
        )}
      </section>
      <section className="space-y-2">
        <button onClick={sendTest} disabled={testing || !link?.linked} className="rounded-full bg-white/10 px-4 py-2.5 disabled:opacity-40">{testing ? "Sending…" : "Send test alert"}</button>
        {testResult && <p role="status" className={`rounded-xl px-4 py-3 text-sm ${testResult.tone === "ok" ? "bg-emerald-500/20" : "bg-red-500/20"}`}>{testResult.text}</p>}
      </section>
      <footer className="flex items-center justify-between border-t border-white/10 pt-4">
        <button onClick={onBack} className="rounded-full bg-white/10 px-4 py-2">Back</button>
        <div className="flex flex-col items-end gap-1">
          <button disabled={pending} onClick={onFinish} className="rounded-full bg-[var(--magenta)] px-5 py-2 font-semibold text-white">Go to my radar</button>
          {!link?.linked && link?.configured && <p className="text-xs text-muted">You can link Telegram later under Profile.</p>}
        </div>
      </footer>
    </div>
  );
}
