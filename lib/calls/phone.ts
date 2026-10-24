import { z } from "zod";

/** Digits-only cleanup, then E.164. Bare 10-digit Indian numbers get +91. Returns null when invalid. */
export function normalizePhone(input: string, defaultCountry = "+91"): string | null {
  const raw = input.trim().replace(/[\s\-().]/g, "");
  let s: string;
  if (raw.startsWith("+")) s = raw;
  else if (raw.startsWith("00")) s = `+${raw.slice(2)}`;
  else if (/^91\d{10}$/.test(raw)) s = `+${raw}`;
  else if (/^0\d{10}$/.test(raw)) s = `${defaultCountry}${raw.slice(1)}`;
  else s = `${defaultCountry}${raw}`;
  const r = E164.safeParse(s);
  return r.success ? r.data : null;
}

export const E164 = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, "Enter a valid phone number")
  .refine((v) => !v.startsWith("+91") || /^\+91[6-9]\d{9}$/.test(v), "Indian mobile numbers have 10 digits and start with 6-9");

/** +91 ••••• ••210: country code and last three digits only. */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const cc = e164.startsWith("+91") ? "+91" : e164.slice(0, 3);
  const rest = e164.slice(cc.length);
  return `${cc} ${"•".repeat(Math.max(0, rest.length - 3))}${rest.slice(-3)}`;
}
