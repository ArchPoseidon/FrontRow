"use client";

import { useState, useTransition } from "react";
import { removePhoneAction, savePhoneAction, setConsentAction, setLeadAction, suggestAction, toggleCallMeAction } from "@/lib/calls/actions";
import { CALL_ME_MAX, LEAD_OPTIONS } from "@/lib/calls/flag";
import type { CallMeData } from "@/lib/calls/store";

const STATUS: Record<string, string> = { scheduled: "Scheduled", calling: "Calling", done: "Done", no_answer: "No answer", failed: "Couldn't connect" };
const when = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));

/**
 * "Call me" list for the Radar page: phone + explicit consent, lead time, which artists to ring (3 of 5), reminder status.
 * Data comes from getCallMeData(); `voiceOn` mirrors VOICE_CALLS_ENABLED and, when false, no call is ever placed.
 */
export function CallMeSection({ data, voiceOn }: { data: CallMeData; voiceOn: boolean }) {
  const [artists, setArtists] = useState(data.artists);
  const [lead, setLead] = useState(data.leadMinutes);
  const [phone, setPhone] = useState("");
  const [masked, setMasked] = useState(data.phoneMasked);
  const [consent, setConsent] = useState(data.hasConsent);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const count = artists.filter((a) => a.callMe).length;
  const shown = [...artists].sort((a, b) => Number(b.callMe) - Number(a.callMe) || Number(data.suggestedIds.includes(b.id)) - Number(data.suggestedIds.includes(a.id)) || a.name.localeCompare(b.name));

  const savePhone = () =>
    start(async () => {
      const r = await (phone.trim() ? savePhoneAction(phone, consent) : masked ? setConsentAction(consent) : Promise.resolve({ ok: false as const, error: "Enter your phone number first" })).catch(() => ({ ok: false as const, error: "Couldn't save that" }));
      if (!r.ok) return setMsg({ text: r.error, bad: true });
      setMasked(r.masked);
      setPhone("");
      if (!r.masked) setConsent(false);
      setMsg({ text: r.masked ? (consent ? "Saved. We'll only call this number for artists you switch on." : "Number saved. Tick the consent box so we're allowed to call.") : "Number removed." });
    });
  const removePhone = () =>
    start(async () => {
      const r = await removePhoneAction().catch(() => ({ ok: false as const, error: "Couldn't save that" }));
      if (!r.ok) return setMsg({ text: r.error, bad: true });
      setMasked("");
      setConsent(false);
      setMsg({ text: "Number removed. Pending calls are cancelled." });
    });
  const toggle = (id: string, on: boolean) => {
    setArtists((as) => as.map((a) => (a.id === id ? { ...a, callMe: on } : a)));
    start(async () => {
      const r = await toggleCallMeAction(id, on).catch(() => ({ ok: false as const, error: "Couldn't save that" }));
      if (!r.ok) {
        setArtists((as) => as.map((a) => (a.id === id ? { ...a, callMe: !on } : a)));
        setMsg({ text: r.error, bad: true });
      }
    });
  };
  const changeLead = (m: number) => {
    const prev = lead;
    setLead(m);
    start(async () => {
      const r = await setLeadAction(m).catch(() => ({ ok: false as const, error: "Couldn't save that" }));
      if (!r.ok) { setLead(prev); setMsg({ text: r.error, bad: true }); }
    });
  };
  const suggest = () =>
    start(async () => {
      const r = await suggestAction().catch(() => ({ ok: false as const, error: "Couldn't save that" }));
      if (!r.ok) return setMsg({ text: r.error, bad: true });
      setArtists((as) => {
        let room = CALL_ME_MAX - as.filter((a) => a.callMe).length;
        return as.map((a) => (!a.callMe && data.suggestedIds.includes(a.id) && room-- > 0 ? { ...a, callMe: true } : a));
      });
      setMsg({ text: r.added ? `Added ${r.added} of your must-see artists.` : "No more must-see artists to add." });
    });

  return (
    <section id="call-me" aria-labelledby="call-me-h" className="rounded-card border border-surface-border bg-surface/80 p-4 backdrop-blur">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="call-me-h" className="font-display text-3xl font-extrabold">Call me</h2>
        <span className="text-sm text-muted">{count} of {CALL_ME_MAX}</span>
      </div>
      <p className="mt-1 text-sm text-muted">A short phone call when tickets go live for artists you pick. Only between 9 am and 9 pm IST; earlier or later times move to the nearest slot. Press 9 on any call to stop them all.</p>
      {!voiceOn && <p className="mt-3 rounded-md border border-dashed border-surface-border px-3 py-2 text-sm font-semibold">Voice calls switch on soon. Set up your list now and nothing is called until then.</p>}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Phone number</span>
          <input inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={masked || "+91 98765 43210"} aria-label="Phone number" className="rounded-md border border-surface-border bg-background px-3 py-2 text-base" />
          <span className="text-xs text-muted">{masked ? `Saved: ${masked}. Enter a new number to change it.` : "Indian mobile numbers start with +91 by default."}</span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Call me</span>
          <select value={lead} onChange={(e) => changeLead(Number(e.target.value))} className="rounded-md border border-surface-border bg-background px-3 py-2 text-base">
            {LEAD_OPTIONS.map((o) => <option key={o.minutes} value={o.minutes}>{o.label} tickets go live</option>)}
          </select>
        </label>
      </div>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4" />
        <span>I agree that FrontRow may phone this number with show reminders. I can stop at any time by pressing 9 on a call or switching artists off.</span>
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending} onClick={savePhone} className="rounded-card bg-accent px-4 py-2 text-sm font-bold text-accent-foreground">Save</button>
        {masked && <button type="button" disabled={pending} onClick={removePhone} className="text-sm underline">Remove number</button>}
        {msg && <span role="status" className={`text-sm ${msg.bad ? "text-[var(--urgency-red)]" : "text-muted"}`}>{msg.text}</span>}
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold tracking-wide uppercase">Artists to call about</h3>
        {data.suggestedIds.length > 0 && <button type="button" disabled={pending} onClick={suggest} className="text-sm underline">Use my top {Math.min(CALL_ME_MAX, data.suggestedIds.length)} must-see</button>}
      </div>
      {shown.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Follow some artists first.</p>
      ) : (
        <ul className="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto">
          {shown.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 rounded-md px-1 py-1.5">
              <span className="min-w-0 truncate text-sm">{a.name}{a.priority === "must_see" && <span className="ml-2 text-xs text-muted">must-see</span>}</span>
              <button type="button" role="switch" aria-checked={a.callMe} aria-label={`Call me about ${a.name}`} disabled={pending} onClick={() => toggle(a.id, !a.callMe)} className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${a.callMe ? "border-transparent bg-[var(--magenta)] text-black" : "border-surface-border"}`}>
                {a.callMe ? "On" : "Off"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {data.reminders.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-bold tracking-wide uppercase">Reminders</h3>
          <ul className="mt-2 flex flex-col divide-y divide-surface-border text-sm">
            {data.reminders.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0"><span className="block truncate font-medium">{r.artistName}{r.city ? `, ${r.city}` : ""}</span><span className="text-xs text-muted">{r.status === "scheduled" ? `Call at ${when(r.scheduledFor)} IST` : when(r.scheduledFor)}</span></span>
                <span className="shrink-0 rounded-full border border-surface-border px-2.5 py-0.5 text-xs">{STATUS[r.status] ?? r.status}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
