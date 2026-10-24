import { and, eq, sql } from "drizzle-orm";
import { callReminders, type Db } from "@/lib/db";
import { GO_LIVE_GRACE_MS } from "./schedule";
import { inCallWindow } from "./window";

export const MAX_ATTEMPTS = 3;
const RETRY_AFTER_FIRST_MIN = [0, 10, 30]; // attempt n+1 is placed this long after the first attempt
export type CallResult = "answered" | "no_answer" | "voicemail" | "failed";

/**
 * Apply one attempt's result. Answered => done. Otherwise retry at +10 / +30 min after the first attempt while
 * that is still inside the 09:00-21:00 IST window and within go-live + 1 h; else finish as no_answer / failed.
 */
export async function settleAttempt(
  db: Db,
  row: { id: string; attempts: number; saleOpensAt: Date | null; firstAttemptAt: string | null },
  result: CallResult,
  now = new Date(),
): Promise<"done" | "scheduled" | "no_answer" | "failed"> {
  let status: "done" | "scheduled" | "no_answer" | "failed";
  let next: Date | null = null;
  if (result === "answered") status = "done";
  else {
    const first = row.firstAttemptAt ? new Date(row.firstAttemptAt) : now;
    const at = row.attempts < MAX_ATTEMPTS ? new Date(first.getTime() + RETRY_AFTER_FIRST_MIN[row.attempts] * 60_000) : null;
    const t = at && at.getTime() > now.getTime() ? at : at ? new Date(now.getTime() + 60_000) : null;
    const tooLate = t && row.saleOpensAt && t.getTime() > row.saleOpensAt.getTime() + GO_LIVE_GRACE_MS;
    if (t && !tooLate && inCallWindow(t)) {
      status = "scheduled";
      next = t;
    } else status = result === "failed" ? "failed" : "no_answer";
  }
  await db
    .update(callReminders)
    .set({
      status,
      ...(next ? { scheduledFor: next } : {}),
      outcome: sql`coalesce(${callReminders.outcome}, '{}'::jsonb) || ${JSON.stringify({ result, at: now.toISOString() })}::jsonb`,
    })
    .where(and(eq(callReminders.id, row.id), eq(callReminders.status, "calling")));
  return status;
}
