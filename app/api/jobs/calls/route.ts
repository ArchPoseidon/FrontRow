import { getDb } from "@/lib/db";
import { cronAuthorized, forbidden } from "@/lib/jobs";
import { runCallsJob } from "@/lib/calls/job";
import { startRun, finishRun } from "@/lib/collectors/shared";
import { voiceCallsEnabled } from "@/lib/calls/flag";
import { syncReminders } from "@/lib/calls/schedule";

export const maxDuration = 60;

// Every 5 min. Flag off: returns at once and touches nothing. Flag on: reconcile reminders, then place due calls.
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return forbidden();
  if (!voiceCallsEnabled()) return Response.json({ ok: true, skipped: "disabled" });
  const db = getDb();
  const run = await startRun(db, "calls");
  try {
    const sync = await syncReminders(db, {}); // catches show changes made by the pipeline (sale time moved, show cancelled)
    const r = await runCallsJob(db);
    await finishRun(db, run, { itemsIn: sync.scheduled, alertsSent: r.placed ?? 0, errors: r.errors ?? [] });
    return Response.json({ ...r, synced: sync });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    await finishRun(db, run, { errors: [msg] });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
