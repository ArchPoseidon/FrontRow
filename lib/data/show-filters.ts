import { citySlug, displayCity, normalizeCity } from "@/lib/util/city";

// Pure helpers for the radar, calendar and My shows filters. No server imports: used by client components and tests.

type CityOf = { city: string | null };
export type CityPrefs = { p1: string[]; p2: string[] };
export type CityChip = { slug: string; label: string; count: number; tier: "p1" | "p2" | "other" };

const fold = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** URL slug of a show's city, or null when the show has no city. Gurugram / Noida / NCR all give "delhi". */
export const showCitySlug = (e: CityOf) => (e.city ? citySlug(e.city) : null);

/** True when the show matches the search text (artist, city or venue). Every word must match somewhere. */
export function matchesQuery(e: { artistName: string; city: string | null; venue: string | null; title?: string | null }, q: string): boolean {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  // "Delhi NCR" shows should also be found by "gurugram" etc., so include the normalised key too.
  const hay = `${fold(e.artistName)} ${fold(e.city)} ${normalizeCity(e.city)} ${fold(e.venue)} ${fold(e.title)}`;
  // A city alias in the query counts too: "gurugram", "noida" or "bangalore" find Delhi NCR / Bengaluru shows.
  return words.every((w) => hay.includes(w) || (normalizeCity(w) !== "" && hay.includes(normalizeCity(w))));
}

export const matchesCity = (e: CityOf, slug: string | null) => !slug || showCitySlug(e) === slug;

/**
 * City chips: P1 cities first, then P2, then everything else by show count (desc, then name).
 * Order and the set of chips come from `all`; each count comes from `counted` (defaults to `all`),
 * so counts can follow the search box while the chips stay put. Only cities with at least one show in `all`
 * (plus the viewer's P1 / P2 cities that have shows) appear.
 */
export function cityChips<T extends CityOf>(all: T[], prefs: CityPrefs, counted: T[] = all): CityChip[] {
  const total = new Map<string, number>();
  const now = new Map<string, number>();
  for (const e of all) {
    const s = showCitySlug(e);
    if (s) total.set(s, (total.get(s) ?? 0) + 1);
  }
  for (const e of counted) {
    const s = showCitySlug(e);
    if (s) now.set(s, (now.get(s) ?? 0) + 1);
  }
  const p1 = prefs.p1.map(citySlug);
  const p2 = prefs.p2.map(citySlug);
  const rank = (s: string) => (p1.includes(s) ? 0 : p2.includes(s) ? 1 : 2);
  const tier = ["p1", "p2", "other"] as const;
  return [...total.keys()]
    .sort((a, b) => rank(a) - rank(b) || (rank(a) === 2 ? total.get(b)! - total.get(a)! : (rank(a) === 0 ? p1 : p2).indexOf(a) - (rank(a) === 0 ? p1 : p2).indexOf(b)) || a.localeCompare(b))
    .map((s) => ({ slug: s, label: displayCity(s.replace(/-/g, " ")), count: now.get(s) ?? 0, tier: tier[rank(s)] }));
}

export type CalFilter = "all" | "added" | "going" | "saved" | "fav";
type CalEvent = CityOf & { artistName: string; venue: string | null; title?: string | null; date: string | null; inCalendar?: boolean; mine?: "going" | "saved" | null; watched?: boolean; notFollowed?: boolean };

export const inCalFilter = (e: CalEvent, f: CalFilter) =>
  !!e.date &&
  (f === "all"
    ? e.watched !== false || !!e.mine || !!e.inCalendar // a show in a city the viewer does not watch still counts once they marked it
    : f === "added"
      ? !!e.inCalendar
      : f === "going"
        ? e.mine === "going"
        : f === "saved"
          ? e.mine === "saved"
          : !e.notFollowed); // every upcoming show of an artist the viewer follows

/** Search + chip + city all apply together. */
export function filterCalendar<T extends CalEvent>(events: T[], o: { q: string; chip: CalFilter; city: string | null }): T[] {
  return events.filter((e) => inCalFilter(e, o.chip) && matchesCity(e, o.city) && matchesQuery(e, o.q));
}

/** Count per chip, given the current search and city (so the numbers move as you type). */
export function calendarCounts<T extends CalEvent>(events: T[], o: { q: string; city: string | null }): Record<CalFilter, number> {
  const c = (f: CalFilter) => filterCalendar(events, { ...o, chip: f }).length;
  return { all: c("all"), added: c("added"), going: c("going"), saved: c("saved"), fav: c("fav") };
}
