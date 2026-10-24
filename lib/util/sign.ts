import { createHmac, timingSafeEqual } from "node:crypto";

const secret = () => process.env.AUTH_SECRET ?? "";

export function signPayload(payload: string): string {
  const mac = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${mac}`;
}

export function verifyPayload(token: string): string | null {
  const [b64, mac] = token.split(".");
  if (!b64 || !mac) return null;
  const payload = Buffer.from(b64, "base64url").toString();
  const expect = createHmac("sha256", secret()).update(payload).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expect);
  return a.length === b.length && timingSafeEqual(a, b) ? payload : null;
}
