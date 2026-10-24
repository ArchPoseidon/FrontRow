import { computeUrgency, type UrgencyEvent, type UrgencyUser } from "../lib/brain/urgency";
import { normalizeCity, displayCity } from "../lib/util/city";
import { matchesEvent, jsonLdEvents } from "../lib/links/check";
import { ticketLinkOf } from "../lib/links/display";

let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};

const live = (city: string, extra: Partial<UrgencyEvent> = {}): UrgencyEvent => ({
  city, status: "on_sale", confidence: 0.95, isFestival: false, ticketUrl: "https://in.bookmyshow.com/x", saleOpensAt: null, sourceCount: 2,
  tiers: [{ status: "open", closesAt: null }], ...extra,
});
const user = (o: Partial<UrgencyUser> = {}): UrgencyUser => ({ p1Cities: ["Mumbai"], p2Cities: [], watchAllIndia: false, homeCity: "Mumbai", priority: "follow", ...o });

// Item 3
eq("P1 Mumbai live show => red", computeUrgency(live("Mumbai"), user()), "red");
eq("P1 live but no verified link and 1 source => amber", computeUrgency(live("Mumbai", { ticketUrl: null, sourceCount: 1 }), user()), "amber");
eq("Chennai, All India off => never alert", computeUrgency(live("Chennai"), user()), null);
eq("Chennai, All India on => digest only (info)", computeUrgency(live("Chennai"), user({ watchAllIndia: true })), "info");
eq("Chennai, All India on, must-see => amber", computeUrgency(live("Chennai"), user({ watchAllIndia: true, priority: "must_see" })), "amber");
eq("P2 city, tickets open => amber", computeUrgency(live("Pune"), user({ p2Cities: ["Pune"] })), "amber");
eq("P2 city, not open, follow => info", computeUrgency(live("Pune", { status: "announced", tiers: [] }), user({ p2Cities: ["Pune"] })), "info");
eq("P2 city, not open, must-see => amber", computeUrgency(live("Pune", { status: "announced", tiers: [] }), user({ p2Cities: ["Pune"], priority: "must_see" })), "amber");
eq("Rumour in P1 => info", computeUrgency(live("Mumbai", { status: "rumored" }), user()), "info");
eq("Gurugram counts as Delhi NCR P1", computeUrgency(live("Gurugram"), user({ p1Cities: ["Delhi NCR"] })), "red");
eq("Thane counts as Mumbai", computeUrgency(live("Thane"), user()), "red");

// Item 6
eq("normalize Gurgaon", normalizeCity("Gurgaon"), "delhi");
eq("display Noida", displayCity("Noida"), "Delhi NCR");
eq("display bangalore", displayCity("bangalore"), "Bengaluru");

// Item 1
const ev = { city: "Mumbai", date: "2026-12-12" };
eq("matches: date + city in text", matchesEvent("https://x.in/e/1", "Prateek Kuhad Live", "Prateek Kuhad Mumbai 12 Dec 2026", ev), true);
eq("another date, same city, page shows dates => mismatch", matchesEvent("https://x.in/mumbai-e/1", "Prateek Kuhad Mumbai", "Prateek Kuhad Mumbai 20 Dec 2026", ev), false);
eq("other city => mismatch", matchesEvent("https://x.in/delhi", "Prateek Kuhad Delhi", "Delhi 12 Dec 2026", ev), false);
const ld = jsonLdEvents('<script type="application/ld+json">{"@type":"MusicEvent","startDate":"2026-12-12T19:00:00+05:30","location":{"address":{"addressLocality":"Mumbai"}}}</script>');
eq("json-ld parsed", ld, [{ startDate: "2026-12-12T19:00:00+05:30", city: "Mumbai" }]);
eq("json-ld date+city match", matchesEvent("https://x", null, "", ev, ld), true);
eq("json-ld wrong date => mismatch", matchesEvent("https://x", null, "", { city: "Mumbai", date: "2026-12-13" }, ld), false);
eq("ok (name not found) is never a ticket button", ticketLinkOf({ ticketUrl: "https://x", ticketStatus: "ok" }), null);
eq("exact is a ticket button", ticketLinkOf({ ticketUrl: "https://x", ticketStatus: "exact" }), "https://x");

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
