import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";
import { loadEventCard } from "@/lib/notify/content";
import { appUrl } from "@/lib/notify/email";
import { finishRun, startRun } from "@/lib/collectors/shared";
import { googleApiTimes, showDetails, showSummary } from "@/lib/data/calendar-links";

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/** One Google call, as stored in runs.errors. Never contains a token. */
export type GcalStep = { step: string; status: number | string; body: string };
export type GcalReason = "not_connected" | "token_expired" | "google_error";

// Strip anything that looks like a Google access / refresh token before it reaches the database.
const scrub = (s: string) => s.replace(/ya29\.[\w.-]+/g, "[token]").replace(/1\/\/[\w.-]+/g, "[token]").replace(/Bearer\s+\S+/gi, "Bearer [token]").slice(0, 600);
const step = (steps: GcalStep[], name: string, status: number | string, body = "") => void steps.push({ step: name, status, body: scrub(body) });

/** Record one add/remove attempt in `runs` (job 'gcal'): every call with its status and Google's error body. Never throws. */
export async function logGcalRun(db: Db, steps: GcalStep[]) {
  try {
    if (!steps.length) return;
    const id = await startRun(db, "gcal");
    await finishRun(db, id, { itemsIn: steps.length, errors: steps });
  } catch (e) {
    console.error("gcal run log failed", e);
  }
}

const hasCalendarScope = (scope: string | null | undefined) => (scope ?? "").split(/[\s,]+/).some((s) => /\/auth\/calendar(\.events)?$/.test(s));

export type CalendarAccess = { ok: true; token: string } | { ok: false; reason: GcalReason; detail?: string };

// An access token for the user's Google Calendar, or the specific reason there is none:
//   not_connected: no Google account row, or the calendar permission was never granted / was unticked
//   token_expired: the refresh token is gone or revoked (invalid_grant, e.g. the 7-day limit in Testing mode): reconnect
//   google_error: Google or the network failed while refreshing: retry
// Refreshes with the stored refresh token when the access token is about to expire and saves the new one.
export async function calendarAccess(db: Db, userId: string, steps: GcalStep[] = []): Promise<CalendarAccess> {
  const [a] = await db.select().from(schema.accounts).where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.provider, "google")));
  if (!a || !hasCalendarScope(a.scope)) return { ok: false, reason: "not_connected" };
  const now = Math.floor(Date.now() / 1000);
  if (a.access_token && a.expires_at && a.expires_at - now > 120) return { ok: true, token: a.access_token };
  if (!a.refresh_token) return a.access_token ? { ok: false, reason: "token_expired", detail: "no refresh token" } : { ok: false, reason: "not_connected" };
  let r: Response;
  try {
    r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: process.env.AUTH_GOOGLE_ID ?? "", client_secret: process.env.AUTH_GOOGLE_SECRET ?? "", grant_type: "refresh_token", refresh_token: a.refresh_token }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    step(steps, "token_refresh", "network", e instanceof Error ? e.message : "fetch failed");
    return { ok: false, reason: "google_error", detail: "network" };
  }
  const text = await r.text().catch(() => "");
  let j: { access_token?: string; expires_in?: number; scope?: string; refresh_token?: string; error?: string } = {};
  try {
    j = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (!r.ok || !j.access_token) {
    step(steps, "token_refresh", r.status, text);
    // invalid_grant / invalid_client: the grant is dead, the user has to consent again. Anything else (5xx, 429) is worth a retry.
    return j.error === "invalid_grant" || j.error === "unauthorized_client" || j.error === "invalid_client" ? { ok: false, reason: "token_expired", detail: j.error } : { ok: false, reason: "google_error", detail: `${r.status}` };
  }
  step(steps, "token_refresh", r.status);
  await db
    .update(schema.accounts)
    .set({ access_token: j.access_token, expires_at: now + (j.expires_in ?? 3600), ...(j.refresh_token ? { refresh_token: j.refresh_token } : {}), ...(j.scope && hasCalendarScope(j.scope) ? { scope: j.scope } : {}) })
    .where(and(eq(schema.accounts.provider, "google"), eq(schema.accounts.providerAccountId, a.providerAccountId)));
  return { ok: true, token: j.access_token };
}

// Compatibility: a token or null.
export async function calendarToken(db: Db, userId: string): Promise<string | null> {
  const c = await calendarAccess(db, userId);
  return c.ok ? c.token : null;
}

/**
 * For auth.ts `events.signIn` (Auth.js does not touch an existing accounts row when Google re-consents):
 * pass the `account` object it receives so fresh tokens and the granted scope land on the row.
 */
export async function persistGoogleTokens(db: Db, userId: string, account: { provider?: string; providerAccountId?: string; access_token?: string | null; refresh_token?: string | null; expires_at?: number | null; scope?: string | null }) {
  if (account.provider !== "google" || !account.providerAccountId) return;
  await db
    .update(schema.accounts)
    .set({
      ...(account.access_token ? { access_token: account.access_token } : {}),
      ...(account.refresh_token ? { refresh_token: account.refresh_token } : {}),
      ...(account.expires_at ? { expires_at: account.expires_at } : {}),
      ...(account.scope ? { scope: account.scope } : {}),
    })
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.provider, "google"), eq(schema.accounts.providerAccountId, account.providerAccountId)));
}

// Same user + same show always gives the same Google event id, so adding twice never duplicates.
export const gid = (userId: string, eventId: string) => `fr${createHash("sha256").update(`${userId}:${eventId}`).digest("hex").slice(0, 40)}`;

export type GcalResult = { ok: true; googleEventId: string } | { ok: false; reason: "no_date" | GcalReason; detail?: string };

// Map a failed Calendar API response to what the user should do about it.
function apiFailure(status: number, body: string): { reason: GcalReason; detail: string } {
  if (status === 401) return { reason: "token_expired", detail: "401" };
  if (status === 403 && /insufficient|SCOPE_INSUFFICIENT|forbidden/i.test(body) && !/rateLimit|quota|accessNotConfigured|has not been used/i.test(body)) return { reason: "not_connected", detail: "403 scope" };
  return { reason: "google_error", detail: `${status}` };
}

async function call(steps: GcalStep[], name: string, url: string, init: RequestInit): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000) });
    const body = await r.text().catch(() => "");
    step(steps, name, r.status, r.ok ? "" : body);
    return { ok: r.ok, status: r.status, body };
  } catch (e) {
    step(steps, name, "network", e instanceof Error ? e.message : "fetch failed");
    return { ok: false, status: 0, body: "" };
  }
}

export async function addToGoogleCalendar(db: Db, userId: string, eventId: string): Promise<GcalResult> {
  const steps: GcalStep[] = [];
  try {
    const ev = await loadEventCard(db, eventId);
    if (!ev || !ev.date) return { ok: false, reason: "no_date" };
    const access = await calendarAccess(db, userId, steps);
    if (!access.ok) return access;
    const eid = gid(userId, eventId);
    const headers = { Authorization: `Bearer ${access.token}`, "Content-Type": "application/json" };
    const base = {
      summary: showSummary(ev),
      location: [ev.venue, ev.city].filter(Boolean).join(", "),
      description: showDetails(ev, appUrl()),
      ...googleApiTimes(ev.date, ev.time),
      source: { title: "FrontRow", url: `${appUrl()}/event/${ev.id}` },
    };
    const ins = await call(steps, "events.insert", CAL, { method: "POST", headers, body: JSON.stringify({ id: eid, ...base }) });
    if (ins.ok) return { ok: true, googleEventId: eid };
    if (ins.status === 409) {
      // The id exists: either it is already there, or it was deleted earlier (Google keeps the cancelled stub). Revive and refresh it.
      const upd = await call(steps, "events.patch", `${CAL}/${eid}`, { method: "PATCH", headers, body: JSON.stringify({ ...base, status: "confirmed" }) });
      if (upd.ok) return { ok: true, googleEventId: eid };
      return { ok: false, ...apiFailure(upd.status, upd.body) };
    }
    return { ok: false, ...apiFailure(ins.status, ins.body) };
  } catch (e) {
    step(steps, "unexpected", "error", e instanceof Error ? e.message : String(e));
    return { ok: false, reason: "google_error", detail: "unexpected" };
  } finally {
    await logGcalRun(db, steps);
  }
}

export type GcalRemoveResult = { ok: true } | { ok: false; reason: GcalReason };

export async function removeFromGoogleCalendar(db: Db, userId: string, googleEventId: string): Promise<GcalRemoveResult> {
  const steps: GcalStep[] = [];
  try {
    const access = await calendarAccess(db, userId, steps);
    if (!access.ok) return { ok: false, reason: access.reason === "google_error" ? "google_error" : access.reason };
    const r = await call(steps, "events.delete", `${CAL}/${googleEventId}`, { method: "DELETE", headers: { Authorization: `Bearer ${access.token}` } });
    if (r.ok || r.status === 404 || r.status === 410) return { ok: true }; // already gone is fine
    return { ok: false, reason: apiFailure(r.status, r.body).reason };
  } catch (e) {
    step(steps, "unexpected", "error", e instanceof Error ? e.message : String(e));
    return { ok: false, reason: "google_error" };
  } finally {
    await logGcalRun(db, steps);
  }
}
