import Link from "next/link";
import { ArtistAvatar } from "@/components/artist/ArtistAvatar";
import { formatShowTime } from "@/lib/util/ist";
import { Countdown } from "./Countdown";
import { TierLadder } from "./TierLadder";
import type { EventView } from "./types";

const BAND = { red: "bg-urgency-red text-white", amber: "bg-urgency-amber text-black", info: "bg-urgency-info text-white" } as const;

function dateParts(d: string | null) {
  if (!d) return { dow: "TBA", day: "?", mon: "" };
  const dt = new Date(`${d}T00:00:00Z`);
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", ...o }).format(dt);
  return { dow: f({ weekday: "short" }), day: f({ day: "numeric" }), mon: f({ month: "short" }) };
}

export function confidenceLine(ev: Pick<EventView, "confidence" | "sources">) {
  const names = [...new Set(ev.sources.map((s) => s.platform ?? new URL(s.url).hostname.replace(/^www\./, "")))];
  const confirmed = (ev.confidence ?? 0) >= 0.9 || names.length >= 2;
  return confirmed ? `Confirmed · ${names.slice(0, 3).join(", ")}` : `Unconfirmed · ${names.length || 1} source${names.length === 1 ? "" : "s"}`;
}

// One component, two sizes (compact for the timeline, full for the detail page). The poster size is /api/og/event/[id].
export function EventCard({ ev, size = "compact", onDismiss, readOnly }: { ev: EventView; size?: "compact" | "full"; onDismiss?: (id: string) => void; readOnly?: boolean }) {
  const p = dateParts(ev.date);
  const rumor = ev.status === "rumored";
  const full = size === "full";
  const others = ev.lineup.filter((n) => n.toLowerCase() !== ev.artistName.toLowerCase());
  return (
    <article
      className={`flex flex-col overflow-hidden rounded-card bg-surface ${rumor ? "border border-dashed border-muted" : "border border-surface-border"} ${full ? "" : "h-full"}`}
      aria-label={`${ev.artistName}${ev.city ? `, ${ev.city}` : ""}`}
    >
      <div className={`flex flex-wrap items-center justify-between gap-x-3 px-4 py-2 text-sm font-semibold ${BAND[ev.urgency]}`}>
        <span>{ev.isSample ? "Sample · " : ""}{ev.urgency === "red" ? "Act now" : ev.urgency === "amber" ? "Worth a look" : rumor ? "Rumour" : "FYI"}</span>
        <span className="font-medium">{ev.reason}</span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex gap-3">
          <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-lg border border-surface-border py-2 text-center leading-none" aria-label={ev.date ?? "Date to be announced"}>
            <span className="text-[11px] tracking-wide text-muted uppercase">{p.dow}</span>
            <span className="my-1 text-2xl font-bold">{p.day}</span>
            <span className="text-xs font-semibold uppercase">{p.mon}</span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold">{ev.artistName}</h3>
            <p className="truncate text-sm text-muted">{[ev.venue, formatShowTime(ev.time)].filter(Boolean).join(" · ") || "Venue to be announced"}</p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
              {ev.city && (
                <span className={`rounded-full border px-2 py-0.5 ${ev.inHomeCity ? "border-accent text-accent" : "border-surface-border text-muted"}`}>
                  {ev.inHomeCity ? "Your city" : `${ev.city} · worth the trip`}
                </span>
              )}
              {ev.isFestival && <span className="rounded-full border border-surface-border px-2 py-0.5 text-muted">Festival</span>}
              {ev.isSample && <span className="rounded-full bg-urgency-info px-2 py-0.5 text-white">Sample</span>}
            </p>
          </div>
          <ArtistAvatar name={ev.artistName} imageUrl={ev.artistImage} size={full ? 72 : 52} />
        </div>

        <TierLadder tiers={ev.tiers} />
        {ev.countdown && <Countdown to={ev.countdown.to} label={ev.countdown.label} />}

        {ev.isFestival && others.length > 0 && (
          <p className="text-sm text-muted">
            <span className="font-medium text-foreground">Also on the lineup: </span>
            {others.slice(0, full ? 40 : 6).join(", ")}
            {!full && others.length > 6 ? ` +${others.length - 6} more` : ""}
          </p>
        )}

        <p className="mt-auto text-xs text-muted">{confidenceLine(ev)}</p>

        <div className="flex flex-wrap items-center gap-2">
          {!rumor && ev.ticketUrl && (
            <a href={ev.ticketUrl} target="_blank" rel="noopener noreferrer" className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">
              Get tickets
            </a>
          )}
          {ev.date && (
            <a href={`/api/ics/${ev.id}`} aria-label="Add to calendar" title="Add to calendar" className="rounded-card border border-surface-border px-3 py-2 text-sm">
              📅
            </a>
          )}
          {!readOnly && onDismiss && (
            <button onClick={() => onDismiss(ev.id)} aria-label="Not for me" title="Not for me" className="rounded-card border border-surface-border px-3 py-2 text-sm">
              🙅
            </button>
          )}
          {!full && (
            <Link href={`/event/${ev.id}`} className="ml-auto text-sm text-muted underline underline-offset-2">
              Details
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
