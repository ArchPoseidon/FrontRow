import { formatShowTime } from "@/lib/util/ist";
import { esc } from "./telegram";
import { URGENCY_EMOJI, headline, reasonLine, showDay, type EventCard, type Urgency } from "./content";

export function telegramCaption(ev: EventCard, urgency: Urgency, kind: "alert" | "test" = "alert") {
  const when = [showDay(ev.date), formatShowTime(ev.time)].filter(Boolean).join(", ");
  const reason = reasonLine(ev);
  const lines = [
    `${URGENCY_EMOJI[urgency]} <b>${esc(headline(ev, kind))}</b>`,
    `<b>${esc(ev.artistName)}</b>${ev.venue ? ` · ${esc(ev.venue)}` : ""}`,
    esc(when),
    reason ? `${/open/i.test(reason) ? "🟢" : "🕒"} ${esc(reason)}` : "",
    ev.platforms.length ? `Sources: ${esc(ev.platforms.slice(0, 4).join(", "))}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export function telegramButtons(ev: EventCard, alertId: string | null, appUrl: string, acted?: "bought" | "dismissed") {
  if (acted === "bought") return [[{ text: "Going 🎉", callback_data: "noop" }]];
  if (acted === "dismissed") return [[{ text: "Dismissed", callback_data: "noop" }]];
  const row1 = [] as { text: string; url?: string; callback_data?: string }[];
  // Only a verified exact ticket page gets the ticket button. Otherwise point at the event page here, which lists
  // every verified source, so no button ever lands on a homepage or a dead page.
  const link = ev.ticketUrl ?? null;
  if (link) row1.push({ text: "🎟 Get tickets", url: link });
  else row1.push({ text: "🔗 Details & sources", url: `${appUrl}/event/${ev.id}` });
  if (ev.date) row1.push({ text: "📅 Calendar", url: `${appUrl}/api/ics/${ev.id}` });
  const rows = [row1];
  if (alertId) rows.push([{ text: "✅ Bought it", callback_data: `bought:${alertId}` }, { text: "🙅 Not for me", callback_data: `dismiss:${alertId}` }]);
  return rows;
}
