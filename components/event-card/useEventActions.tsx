"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { googleTemplateUrl } from "@/lib/data/calendar-links";
import { clientTrack } from "@/lib/data/track-client";
import type { EventView } from "./types";

export type ToastAction = { label: string; href?: string; newTab?: boolean; onClick?: () => void };
export type Toast = { text: string; tone?: "ok" | "error"; actions?: ToastAction[] } | null;

// Going / Saved / Not for me / Add to calendar, shared by every screen that lists shows.
export function useEventActions(initial: EventView[], opts: { returnTo: string }) {
  const [events, setEvents] = useState(initial);
  const [toast, setToast] = useState<Toast>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.actions?.length ? 12000 : 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const toggleCalendarRef = useRef<(id: string, forceAdd?: boolean) => Promise<void>>(async () => {});
  const patch = useCallback((id: string, p: Partial<EventView>) => setEvents((es) => es.map((e) => (e.id === id ? { ...e, ...p } : e))), []);

  const send = async (id: string, action: "going" | "saved" | "dismissed" | "clear") => {
    const r = await fetch(`/api/events/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    if (!r.ok) throw new Error();
  };

  const mark = async (id: string, m: "going" | "saved" | null) => {
    const prev = events;
    patch(id, { mine: m });
    try {
      await send(id, m ?? "clear");
      setToast({ text: m === "going" ? "Marked as going" : m === "saved" ? "Saved. Find it under My shows and the calendar's Saved view." : "Removed", tone: "ok" });
    } catch {
      setEvents(prev);
      setToast({ text: "Couldn't save that. Try again.", tone: "error" });
    }
  };

  const dismiss = async (id: string) => {
    const prev = events;
    setEvents((es) => es.filter((e) => e.id !== id));
    try {
      await send(id, "dismissed");
    } catch {
      setEvents(prev);
      setToast({ text: "Couldn't save that. Try again.", tone: "error" });
    }
  };

  // Add to calendar never dead-ends: the in-app entry always lands, Google is tried, and whatever goes wrong
  // the toast offers the .ics file and a "Add to Google Calendar" link that needs no connection.
  const toggleCalendar = async (id: string, forceAdd = false) => {
    const ev = events.find((e) => e.id === id);
    const adding = forceAdd || !ev?.inCalendar;
    try {
      const r = await fetch(`/api/events/${id}/calendar`, { method: adding ? "POST" : "DELETE" });
      const j = (await r.json().catch(() => ({}))) as { error?: string; google?: boolean; reason?: string | null; googleRemoved?: boolean | null };
      if (!r.ok) throw new Error(j.error ?? "Couldn't update your calendar");
      patch(id, { inCalendar: adding });
      if (!adding) {
        if (j.googleRemoved === false) setToast({ text: "Removed from your FrontRow calendar. The Google Calendar copy is still there: delete it in Google Calendar, or reconnect to let us remove it.", tone: "ok", actions: j.reason === "token_expired" || j.reason === "not_connected" ? [reconnect(id)] : [] });
        else setToast({ text: j.googleRemoved ? "Removed from your Google Calendar and your FrontRow calendar" : "Removed from your calendar", tone: "ok" });
        return;
      }
      if (j.google) return setToast({ text: "Added to your Google Calendar and your FrontRow calendar", tone: "ok" });
      const fallback: ToastAction[] = [];
      const tpl = ev ? googleTemplateUrl(ev, window.location.origin) : null;
      if (tpl) fallback.push({ label: "Add to Google Calendar", href: tpl, newTab: true, onClick: () => clientTrack("calendar_add", { via: "template" }) });
      fallback.push({ label: "Download .ics", href: `/api/ics/${id}`, onClick: () => clientTrack("calendar_add", { via: "ics" }) });
      if (j.reason === "token_expired") setToast({ text: "Added to your FrontRow calendar. Your Google Calendar access expired, so reconnect it.", tone: "ok", actions: [{ ...reconnect(id), label: "Reconnect Google Calendar" }, ...fallback] });
      else if (j.reason === "google_error") setToast({ text: "Added to your FrontRow calendar. Google Calendar didn't answer.", tone: "ok", actions: [{ label: "Retry", onClick: () => void toggleCalendar(id, true) }, ...fallback] });
      else setToast({ text: "Added to your FrontRow calendar. Want it in Google Calendar too?", tone: "ok", actions: [{ ...reconnect(id), label: "Connect Google Calendar" }, ...fallback] });
    } catch (e) {
      setToast({ text: e instanceof Error ? e.message : "Couldn't update your calendar", tone: "error" });
    }
  };
  const reconnect = (id: string): ToastAction => ({ label: "Reconnect Google Calendar", href: `/api/gcal/connect?return=${encodeURIComponent(`${opts.returnTo}${opts.returnTo.includes("?") ? "&" : "?"}add=${id}`)}` });

  useEffect(() => {
    toggleCalendarRef.current = toggleCalendar;
  });
  // Coming back from "Connect / Reconnect Google Calendar": finish adding the show that started it.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    const u = new URL(window.location.href);
    const id = u.searchParams.get("add");
    if (id && /^[0-9a-f-]{36}$/i.test(id)) {
      u.searchParams.delete("add");
      window.history.replaceState(null, "", `${u.pathname}${u.search}`);
      void toggleCalendarRef.current(id, true);
    }
  }, []);

  const notify = (text: string, tone: "ok" | "error" = "ok") => setToast({ text, tone });
  return { events, setEvents, mark, dismiss, toggleCalendar, notify, toast, clearToast: () => setToast(null) };
}

export function ToastView({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  if (!toast) return null;
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-md flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-surface-border bg-[var(--paper)] px-4 py-3 text-sm text-[var(--paper-ink)] shadow-lg sm:bottom-6">
      <span className={`h-2 w-2 shrink-0 rounded-full ${toast.tone === "error" ? "bg-urgency-red" : "bg-[var(--tier-open)]"}`} />
      <span className="flex-1 font-medium">{toast.text}</span>
      {toast.actions && toast.actions.length > 0 && (
        <span className="order-last flex w-full flex-wrap gap-2">
          {toast.actions.map((a) =>
            a.href ? (
              <a key={a.label} href={a.href} {...(a.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})} onClick={a.onClick} className="rounded-md bg-[var(--paper-ink)] px-3 py-1.5 text-xs font-bold text-[var(--paper)]">{a.label}</a>
            ) : (
              <button key={a.label} onClick={() => { a.onClick?.(); onClose(); }} className="rounded-md bg-[var(--paper-ink)] px-3 py-1.5 text-xs font-bold text-[var(--paper)]">{a.label}</button>
            ),
          )}
        </span>
      )}
      <button onClick={onClose} aria-label="Dismiss" className="shrink-0 text-lg leading-none opacity-60">×</button>
    </div>
  );
}
