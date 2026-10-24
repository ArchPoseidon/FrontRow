export const MAJOR_CITIES = [
  "Bengaluru", "Mumbai", "Delhi NCR", "Hyderabad", "Chennai", "Kolkata", "Pune", "Ahmedabad",
  "Goa", "Jaipur", "Chandigarh", "Kochi", "Lucknow", "Indore", "Guwahati",
] as const;

const ALIASES: Record<string, string> = {
  bangalore: "Bengaluru", bengaluru: "Bengaluru", bangaluru: "Bengaluru",
  bombay: "Mumbai", mumbai: "Mumbai", "navi mumbai": "Mumbai", thane: "Mumbai",
  delhi: "Delhi NCR", "new delhi": "Delhi NCR", ncr: "Delhi NCR", "delhi ncr": "Delhi NCR",
  gurgaon: "Delhi NCR", gurugram: "Delhi NCR", noida: "Delhi NCR", "greater noida": "Delhi NCR", faridabad: "Delhi NCR", ghaziabad: "Delhi NCR",
  hyderabad: "Hyderabad", secunderabad: "Hyderabad",
  madras: "Chennai", chennai: "Chennai",
  calcutta: "Kolkata", kolkata: "Kolkata",
  pune: "Pune", poona: "Pune",
  ahmedabad: "Ahmedabad", goa: "Goa", panaji: "Goa", panjim: "Goa", vagator: "Goa", anjuna: "Goa",
  jaipur: "Jaipur", chandigarh: "Chandigarh", mohali: "Chandigarh", panchkula: "Chandigarh",
  kochi: "Kochi", cochin: "Kochi", ernakulam: "Kochi",
  lucknow: "Lucknow", indore: "Indore", guwahati: "Guwahati",
};

export function normalizeCity(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const k = raw.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!k) return null;
  if (ALIASES[k]) return ALIASES[k];
  const first = k.split(" ")[0];
  if (ALIASES[first]) return ALIASES[first];
  return raw.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

export const displayCity = (c: string | null | undefined) => normalizeCity(c) ?? "";
export const citySlug = (c: string) => c.toLowerCase().replace(/\s+/g, "-");
