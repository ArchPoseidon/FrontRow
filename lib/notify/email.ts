import { createHmac, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";

export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export function emailConfigured() {
  if (process.env.EMAIL_PROVIDER === "resend") return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

// Signed unsubscribe token: HMAC of the user id, so nobody can unsubscribe someone else.
const sign = (userId: string) => createHmac("sha256", process.env.AUTH_SECRET ?? "").update(`unsub:${userId}`).digest("hex").slice(0, 32);
export const unsubscribeUrl = (userId: string) => `${appUrl()}/api/email/unsubscribe?u=${encodeURIComponent(userId)}&t=${sign(userId)}`;
export function verifyUnsubscribe(userId: string, token: string) {
  const a = Buffer.from(sign(userId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function sendEmail(to: string, subject: string, html: string, text: string, unsubscribe: string) {
  const headers = { "List-Unsubscribe": `<${unsubscribe}>` };
  if (process.env.EMAIL_PROVIDER === "resend") {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, html, text, headers }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 160)}`);
    return;
  }
  const user = process.env.GMAIL_USER!;
  const t = nodemailer.createTransport({ service: "gmail", auth: { user, pass: process.env.GMAIL_APP_PASSWORD } });
  await t.sendMail({ from: process.env.EMAIL_FROM || `FrontRow <${user}>`, to, subject, html, text, headers });
}
