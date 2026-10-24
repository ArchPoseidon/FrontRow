// Unit tests for the pure pieces of items 4, 6 and 10: `npx tsx scripts/test-views.ts`
import assert from "node:assert/strict";
import { calendarCounts, cityChips, filterCalendar, matchesQuery, showCitySlug, type CalFilter } from "@/lib/data/show-filters";
import { googleApiTimes, googleTemplateUrl, icsTimes, parseShowTime, showWindow } from "@/lib/data/calendar-links";

let n = 0;
const t = (name: string, f: () => void) => {
  f();
  n++;
  console.log("ok  ", name);
};

const ev = (id: string, artistName: string, city: string | null, venue: string | null, extra: Record<string, unknown> = {}) => ({ id, artistName, city, venue, date: "2026-12-05", time: null as string | null, ...extra });
const shows = [
  ev("1", "Prateek Kuhad", "Mumbai", "NCPA", { mine: "going", inCalendar: true }),
  ev("2", "Prateek Kuhad", "Delhi NCR", "Jawaharlal Nehru Stadium", { mine: "saved" }),
  ev("3", "Prateek Kuhad", "Gurugram", "Kingdom of Dreams"),
  ev("4", "Zakir Khan", "Mumbai", "Shanmukhananda"),
  ev("5", "Zakir Khan", "Pune", "Balewadi", { watched: false }),
  ev("6", "Lisa Mishra", "Bangalore", "Phoenix Marketcity", { notFollowed: true }),
  ev("7", "Lisa Mishra", null, null),
];

t("city slugs: Gurugram / Noida / Delhi NCR all give delhi", () => {
  assert.equal(showCitySlug({ city: "Gurugram" }), "delhi");
  assert.equal(showCitySlug({ city: "Noida" }), "delhi");
  assert.equal(showCitySlug({ city: "Delhi NCR" }), "delhi");
  assert.equal(showCitySlug({ city: "Bangalore" }), "bengaluru");
  assert.equal(showCitySlug({ city: null }), null);
});

t("city chips: P1 first, then P2, then others by count desc (ties alphabetical); counts per city", () => {
  const c = cityChips(shows, { p1: ["Pune"], p2: ["Bengaluru"] });
  assert.deepEqual(c.map((x) => x.slug), ["pune", "bengaluru", "delhi", "mumbai"]);
  assert.deepEqual(c.map((x) => x.tier), ["p1", "p2", "other", "other"]);
  assert.equal(c.find((x) => x.slug === "delhi")!.count, 2); // NCR + Gurugram
  assert.equal(c.find((x) => x.slug === "delhi")!.label, "Delhi NCR");
  assert.equal(c.find((x) => x.slug === "mumbai")!.count, 2);
  assert.equal(c.find((x) => x.slug === "pune")!.count, 1);
});

t("city chips: P1 order follows the viewer's order; a P1 city with no shows has no chip", () => {
  assert.deepEqual(cityChips(shows, { p1: ["Mumbai", "Pune"], p2: [] }).map((x) => x.slug), ["mumbai", "pune", "delhi", "bengaluru"]);
  assert.deepEqual(cityChips(shows, { p1: ["Pune", "Mumbai"], p2: [] }).slice(0, 2).map((x) => x.slug), ["pune", "mumbai"]);
  assert.ok(!cityChips(shows, { p1: ["Chennai"], p2: [] }).some((x) => x.slug === "chennai"));
  const heavy = [...shows, ev("8", "X", "Hyderabad", null), ev("9", "Y", "Hyderabad", null), ev("10", "Z", "Hyderabad", null)];
  assert.deepEqual(cityChips(heavy, { p1: [], p2: [] }).map((x) => x.slug).slice(0, 3), ["hyderabad", "delhi", "mumbai"]);
});

t("city chips: counts follow the filtered list while the chips stay put", () => {
  const filtered = shows.filter((s) => matchesQuery(s, "prateek"));
  const c = cityChips(shows, { p1: [], p2: [] }, filtered);
  assert.equal(c.length, 4);
  assert.equal(c.find((x) => x.slug === "delhi")!.count, 2);
  assert.equal(c.find((x) => x.slug === "mumbai")!.count, 1);
  assert.equal(c.find((x) => x.slug === "pune")!.count, 0);
});

t("search: artist, city, venue, accents, several words", () => {
  const f = (q: string) => shows.filter((s) => matchesQuery(s, q)).map((s) => s.id);
  assert.deepEqual(f("Prateek"), ["1", "2", "3"]);
  assert.deepEqual(f("prateek mumbai"), ["1"]);
  assert.deepEqual(f("ncpa"), ["1"]);
  assert.deepEqual(f("zakir"), ["4", "5"]);
  assert.deepEqual(f("bengaluru"), ["6"]); // Bangalore normalises
  assert.deepEqual(f("delhi"), ["2", "3"]); // Gurugram shows are found by "delhi"
  assert.deepEqual(f("gurugram"), ["2", "3"]); // alias in the query
  assert.deepEqual(f("bangalore"), ["6"]);
  assert.deepEqual(f("2026"), []); // digits do not become an empty alias that matches everything
  assert.equal(f("").length, shows.length);
  assert.equal(f("nobody").length, 0);
  assert.equal(matchesQuery({ artistName: "Anoushka Shankar", city: "Mumbai", venue: "Café Bombay" }, "cafe"), true);
});

t("calendar chips: all / added / going / saved / fav", () => {
  const ids = (chip: CalFilter) => filterCalendar(shows, { q: "", chip, city: null }).map((s) => s.id);
  assert.deepEqual(ids("all"), ["1", "2", "3", "4", "6", "7"]); // 5 is in a city the viewer does not watch
  assert.deepEqual(ids("added"), ["1"]);
  assert.deepEqual(ids("going"), ["1"]);
  assert.deepEqual(ids("saved"), ["2"]);
  assert.deepEqual(ids("fav"), ["1", "2", "3", "4", "5", "7"]); // every show of a followed artist, incl. unwatched cities; not 6 (not followed)
});

t("filters combine: search + chip + city, and counts follow", () => {
  assert.deepEqual(filterCalendar(shows, { q: "prateek", chip: "fav", city: "delhi" }).map((s) => s.id), ["2", "3"]);
  assert.deepEqual(filterCalendar(shows, { q: "prateek", chip: "going", city: "delhi" }).map((s) => s.id), []);
  assert.deepEqual(filterCalendar(shows, { q: "prateek", chip: "going", city: "mumbai" }).map((s) => s.id), ["1"]);
  assert.deepEqual(calendarCounts(shows, { q: "", city: null }), { all: 6, added: 1, going: 1, saved: 1, fav: 6 });
  assert.deepEqual(calendarCounts(shows, { q: "prateek", city: null }), { all: 3, added: 1, going: 1, saved: 1, fav: 3 });
  assert.deepEqual(calendarCounts(shows, { q: "zakir", city: "pune" }), { all: 0, added: 0, going: 0, saved: 0, fav: 1 });
});

t("shows without a date never appear in the calendar", () => {
  assert.equal(filterCalendar([{ ...shows[0], date: null }], { q: "", chip: "all", city: null }).length, 0);
});

t("parseShowTime", () => {
  assert.deepEqual(parseShowTime("18:30:00+05:30"), { h: 18, m: 30 });
  assert.deepEqual(parseShowTime("18:30"), { h: 18, m: 30 });
  assert.deepEqual(parseShowTime("7 PM"), { h: 19, m: 0 });
  assert.deepEqual(parseShowTime("7:30pm"), { h: 19, m: 30 });
  assert.deepEqual(parseShowTime("12 am"), { h: 0, m: 0 });
  assert.equal(parseShowTime("Doors 7"), null);
  assert.equal(parseShowTime(""), null);
  assert.equal(parseShowTime(null), null);
  assert.equal(parseShowTime("25:00"), null);
});

t("window: all-day without a time, timed IST with 3 h by default, crossing midnight", () => {
  assert.deepEqual(showWindow("2026-12-31", null), { allDay: true, startDate: "2026-12-31", endDate: "2027-01-01" });
  assert.deepEqual(showWindow("2026-12-05", "18:30:00+05:30"), { allDay: false, start: "2026-12-05T18:30:00", end: "2026-12-05T21:30:00" });
  assert.deepEqual(showWindow("2026-12-31", "22:00"), { allDay: false, start: "2026-12-31T22:00:00", end: "2027-01-01T01:00:00" });
});

t("google api times", () => {
  assert.deepEqual(googleApiTimes("2026-12-05", null), { start: { date: "2026-12-05" }, end: { date: "2026-12-06" } });
  assert.deepEqual(googleApiTimes("2026-12-05", "19:00"), { start: { dateTime: "2026-12-05T19:00:00+05:30", timeZone: "Asia/Kolkata" }, end: { dateTime: "2026-12-05T22:00:00+05:30", timeZone: "Asia/Kolkata" } });
});

t("template link: all-day", () => {
  const u = new URL(googleTemplateUrl({ id: "abc", artistName: "Prateek Kuhad", venue: "NCPA", city: "Mumbai", date: "2026-12-05", time: null, ticketUrl: "https://in.bookmyshow.com/x" }, "https://frontrow.app")!);
  assert.equal(u.origin + u.pathname, "https://calendar.google.com/calendar/render");
  assert.equal(u.searchParams.get("action"), "TEMPLATE");
  assert.equal(u.searchParams.get("text"), "Prateek Kuhad (live)");
  assert.equal(u.searchParams.get("dates"), "20261205/20261206");
  assert.equal(u.searchParams.get("ctz"), null);
  assert.equal(u.searchParams.get("location"), "NCPA, Mumbai");
  assert.match(u.searchParams.get("details")!, /Tickets: https:\/\/in\.bookmyshow\.com\/x/);
  assert.match(u.searchParams.get("details")!, /https:\/\/frontrow\.app\/event\/abc/);
});

t("template link: timed in Asia/Kolkata, 3 h", () => {
  const u = new URL(googleTemplateUrl({ id: "abc", artistName: "Prateek Kuhad", venue: null, city: "Mumbai", date: "2026-12-05", time: "18:30:00+05:30" }, "https://frontrow.app")!);
  assert.equal(u.searchParams.get("dates"), "20261205T183000/20261205T213000");
  assert.equal(u.searchParams.get("ctz"), "Asia/Kolkata");
  assert.equal(u.searchParams.get("location"), "Mumbai");
});

t("template link: festival title, no date -> null, special characters encoded", () => {
  const u = new URL(googleTemplateUrl({ id: "f", artistName: "Zakir Khan", title: "Sunburn & Co.", isFestival: true, venue: "A, B", city: "Goa", date: "2026-12-27", time: null }, "https://x.y")!);
  assert.equal(u.searchParams.get("text"), "Zakir Khan · Sunburn & Co. (live)");
  assert.equal(u.searchParams.get("location"), "A, B, Goa");
  assert.equal(googleTemplateUrl({ id: "f", artistName: "Z", venue: null, city: null, date: null, time: null }, "https://x.y"), null);
});

t("ics times: all-day vs UTC conversion of IST", () => {
  assert.deepEqual(icsTimes("2026-12-05", null), ["DTSTART;VALUE=DATE:20261205", "DTEND;VALUE=DATE:20261206"]);
  assert.deepEqual(icsTimes("2026-12-05", "18:30"), ["DTSTART:20261205T130000Z", "DTEND:20261205T160000Z"]);
  assert.deepEqual(icsTimes("2026-12-05", "01:00"), ["DTSTART:20261204T193000Z", "DTEND:20261204T223000Z"]);
});

console.log(`\n${n} tests passed`);
