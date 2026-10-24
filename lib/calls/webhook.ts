import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { callReminders, schema, type Db } from "@/lib/db";
import { track } from "@/lib/activity";
import { optOut } from "./store";
import { settleAttempt, type CallResult } from "./outcome";

// TODO(owner): signature scheme and payload shape are OUR contract until the provider API is confirmed.
// Signature: hex HMAC-SHA256 of the raw body with CALLS_WEBHOOK_SECRET, in `x-signature` (optionally `sha256=` prefixed).
export function signatureValid(raw: string, header: string | null, secret = process.env.CALLS_WEBHOOK_SECRET): boolean {
  if (!secret || !header) return false;
  const got = header.replace(/^sha256=/, "").trim();
  const want = createHmac("sha256", secret).update(raw).digest("hex");
  return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export type WebhookBody = { provider_call_id?: string; status?: string; dtmf?: string; optout?: "artist" | "all" };
const RESULTS = new Set<string>(["answered", "no_answer", "voicemail", "failed"]);

export async function applyWebhook(db: Db, body: WebhookBody, now = new Date()): Promise<{ ok: true; duplicate?: boolean; ignored?: boolean }> {
  const callId = body.provider_call_id;
  const optOutAsked = body.dtmf === "9" || !!body.optout;
  const result = body.status && RESULTS.has(body.status) ? (body.status as CallResult) : null;
  if (!callId || (!result && !optOutAsked)) return { ok: true, ignored: true };
  // Idempotency: record (provider_call_id, status) in outcome.seen; a repeat updates nothing.
  const key = `${callId}:${result ?? "optout"}`;
  const claimed = await db.execute(sql`
    update call_reminders set outcome = jsonb_set(coalesce(outcome, '{}'::jsonb), '{seen}', coalesce(outcome->'seen', '[]'::jsonb) || to_jsonb(${key}::text))
    where provider_call_id = ${callId} and not (coalesce(outcome->'seen', '[]'::jsonb) @> to_jsonb(${key}::text))
    returning id, user_id, artist_id, status, attempts, outcome->>'firstAttemptAt' as first_attempt_at`);
  const row = claimed.rows[0] as { id: string; user_id: string; artist_id: string; status: string; attempts: number; first_attempt_at: string | null } | undefined;
  if (!row) return { ok: true, duplicate: true };
  if (optOutAsked) {
    // "Press 9" stops every call-me by default; the agent may narrow it to this artist.
    await optOut(row.user_id, body.optout === "artist" ? row.artist_id : null, db);
    await db.update(callReminders).set({ status: "done", outcome: sql`coalesce(${callReminders.outcome}, '{}'::jsonb) || '{"optedOut":true}'::jsonb` }).where(eq(callReminders.id, row.id));
    await track("call_outcome", row.user_id, { result: "opt_out", scope: body.optout === "artist" ? "artist" : "all" });
    return { ok: true };
  }
  if (result && row.status === "calling") {
    const [ev] = await db
      .select({ saleOpensAt: schema.events.saleOpensAt })
      .from(callReminders)
      .innerJoin(schema.events, eq(schema.events.id, callReminders.eventId))
      .where(eq(callReminders.id, row.id));
    await settleAttempt(db, { id: row.id, attempts: row.attempts, firstAttemptAt: row.first_attempt_at, saleOpensAt: ev?.saleOpensAt ?? null }, result, now);
  }
  if (result) await track("call_outcome", row.user_id, { result, attempt: row.attempts });
  return { ok: true };
}
