import { timingSafeEqual } from "node:crypto";

/** Bearer ADMIN_API_SECRET check for the owner-only internal routes (not linked anywhere). */
export function adminAuthorized(req: Request): boolean {
  const secret = process.env.ADMIN_API_SECRET;
  if (!secret) return false;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
