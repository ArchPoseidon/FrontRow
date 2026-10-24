// Pure date / link helpers for "Add to calendar". Shows are in India: no time = all-day, else Asia/Kolkata (UTC+05:30), 3 h by default.

export const DEFAULT_HOURS = 3;
const IST_OFFSET = "+05:30";

/** "18:30:00+05:30", "18:30", "7 PM", "7:30pm" -> {h, m}; anything else (free text, empty) -> null. */
export function parseShowTime(t: string | null | undefined): { h: number; m: number } | null {
  if (!t) return null;
  const x = /^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?(?:\s*(?:\+05:30|IST))?$/i.exec(t.trim());
  if (!x) return null;
  let h = Number(x[1]);
  const m = Number(x[2] ?? 0);
  const ap = x[3]?.toLowerCase();
  if (!ap && x[2] === undefined) return null; // a bare number is not a time
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return h > 23 || m > 59 ? null : { h, m };
}

const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const local = (ms: number) => new Date(ms).toISOString().slice(0, 19); // YYYY-MM-DDTHH:MM:SS, the IST wall-clock fields

export type ShowWindow =
  | { allDay: true; startDate: string; endDate: string } // endDate is exclusive
  | { allDay: false; start: string; end: string }; // IST wall-clock "YYYY-MM-DDTHH:MM:SS"

export function showWindow(date: string, time: string | null | undefined, hours = DEFAULT_HOURS): ShowWindow {
  const t = parseShowTime(time);
  if (!t) return { allDay: true, startDate: date, endDate: nextDay(date) };
  const [y, mo, d] = date.split("-").map(Number);
  const startMs = Date.UTC(y, mo - 1, d, t.h, t.m);
  return { allDay: false, start: local(startMs), end: local(startMs + hours * 3600_000) };
}

/** Google Calendar API start/end objects. */
export function googleApiTimes(date: string, time: string | null | undefined) {
  const w = showWindow(date, time);
  return w.allDay
    ? { start: { date: w.startDate }, end: { date: w.endDate } }
    : { start: { dateTime: `${w.start}${IST_OFFSET}`, timeZone: "Asia/Kolkata" }, end: { dateTime: `${w.end}${IST_OFFSET}`, timeZone: "Asia/Kolkata" } };
}

const compact = (s: string) => s.replace(/[-:]/g, "");

export type LinkShow = { id: string; artistName: string; title?: string | null; isFestival?: boolean; venue: string | null; city: string | null; date: string | null; time: string | null; ticketUrl?: string | null };

export const showSummary = (ev: Pick<LinkShow, "artistName" | "title" | "isFestival">) => `${ev.artistName}${ev.title && ev.title !== ev.artistName && ev.isFestival ? ` · ${ev.title}` : ""} (live)`;

export function showDetails(ev: Pick<LinkShow, "id" | "ticketUrl">, appUrl: string) {
  return [ev.ticketUrl ? `Tickets: ${ev.ticketUrl}` : "", `Details: ${appUrl}/event/${ev.id}`, "Added from FrontRow"].filter(Boolean).join("\n");
}

/** "Add to Google Calendar" template link (works without any Google connection). Null when the show has no date. */
export function googleTemplateUrl(ev: LinkShow, appUrl: string): string | null {
  if (!ev.date) return null;
  const w = showWindow(ev.date, ev.time);
  const dates = w.allDay ? `${compact(w.startDate)}/${compact(w.endDate)}` : `${compact(w.start)}/${compact(w.end)}`;
  const q = new URLSearchParams({ action: "TEMPLATE", text: showSummary(ev), dates });
  if (!w.allDay) q.set("ctz", "Asia/Kolkata");
  const loc = [ev.venue, ev.city].filter(Boolean).join(", ");
  if (loc) q.set("location", loc);
  q.set("details", showDetails(ev, appUrl));
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** DTSTART/DTEND lines for an .ics file (UTC for timed shows, DATE for all-day). */
export function icsTimes(date: string, time: string | null | undefined): string[] {
  const w = showWindow(date, time);
  if (w.allDay) return [`DTSTART;VALUE=DATE:${compact(w.startDate)}`, `DTEND;VALUE=DATE:${compact(w.endDate)}`];
  const utc = (l: string) => `${compact(new Date(Date.parse(`${l}${IST_OFFSET}`)).toISOString().slice(0, 19))}Z`;
  return [`DTSTART:${utc(w.start)}`, `DTEND:${utc(w.end)}`];
}
