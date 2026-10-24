const ALIASES: Record<string, string> = {
  bangalore: "bengaluru", bangaluru: "bengaluru",
  bombay: "mumbai", "navi mumbai": "mumbai", thane: "mumbai",
  "new delhi": "delhi", "delhi ncr": "delhi", ncr: "delhi", gurgaon: "delhi", gurugram: "delhi",
  noida: "delhi", "greater noida": "delhi", faridabad: "delhi", ghaziabad: "delhi", "delhi ncr gurugram": "delhi",
  secunderabad: "hyderabad", calcutta: "kolkata", madras: "chennai", poona: "pune", baroda: "vadodara",
  panaji: "goa", panjim: "goa", vagator: "goa", anjuna: "goa",
  mohali: "chandigarh", panchkula: "chandigarh", cochin: "kochi", ernakulam: "kochi",
};

const DISPLAY: Record<string, string> = { delhi: "Delhi NCR" };

/** Canonical lowercase key used for every city comparison. */
export function normalizeCity(c: string | null | undefined): string {
  const base = (c ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ALIASES[base] ?? base;
}

export function displayCity(c: string | null | undefined): string {
  const n = normalizeCity(c);
  return DISPLAY[n] ?? n.replace(/\b\w/g, (m) => m.toUpperCase());
}

export const citySlug = (c: string) => normalizeCity(c).replace(/\s+/g, "-");
