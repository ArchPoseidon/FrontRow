import { normalizeCity } from "@/lib/util/city";

export type Urgency = "red" | "amber" | "info";

export type UrgencyEvent = {
  city: string | null;
  status: string | null;
  confidence: number | null;
  isFestival: boolean | null;
  ticketUrl: string | null;
  saleOpensAt: Date | null;
  sourceCount: number;
  tiers: { status: string | null; closesAt: Date | null }[];
};
export type UrgencyUser = {
  p1Cities: string[] | null;
  p2Cities: string[] | null;
  watchAllIndia: boolean | null;
  homeCity: string | null; // legacy fallback when no P1/P2 were chosen
  priority: string | null;
};

const DAY = 24 * 3600 * 1000;

export type CityTier = "p1" | "p2" | "other";

export function cityTier(city: string | null, user: UrgencyUser): CityTier {
  const c = normalizeCity(city);
  let p1 = (user.p1Cities ?? []).map(normalizeCity);
  const p2 = (user.p2Cities ?? []).map(normalizeCity);
  if (!p1.length && !p2.length && user.homeCity) p1 = [normalizeCity(user.homeCity)];
  if (c && p1.includes(c)) return "p1";
  if (c && p2.includes(c)) return "p2";
  return "other";
}

// Returns null when the user never wants alerts for this city.
//  P1 city: red when tickets are open/imminent and the link is verified or 2+ sources agree, else amber.
//  P2 city: amber when tickets are open or the artist is must-see, else info (digest).
//  Other city with All India ticked: info (digest), amber for must-see. Not ticked: never.
export function computeUrgency(ev: UrgencyEvent, user: UrgencyUser, now = Date.now()): Urgency | null {
  const tier = cityTier(ev.city, user);
  const mustSee = user.priority === "must_see";
  if (tier === "other" && !user.watchAllIndia) return null;

  const anyOpen = ev.tiers.some((t) => t.status === "open") || ev.status === "early_bird" || ev.status === "on_sale";
  const rumor = ev.status === "rumored";
  if (rumor || (ev.confidence ?? 0) < 0.6 || (ev.isFestival && !ev.ticketUrl)) return "info";

  const imminent =
    (ev.saleOpensAt && ev.saleOpensAt.getTime() > now && ev.saleOpensAt.getTime() - now <= DAY) ||
    ev.tiers.some((t) => t.status === "open" && t.closesAt && t.closesAt.getTime() > now && t.closesAt.getTime() - now <= DAY);

  if (tier === "p1") {
    if (anyOpen || imminent) return ev.ticketUrl || ev.sourceCount >= 2 ? "red" : "amber";
    return "amber";
  }
  if (tier === "p2") return anyOpen || mustSee ? "amber" : "info";
  return mustSee ? "amber" : "info";
}
