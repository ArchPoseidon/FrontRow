import { getDb } from "@/lib/db";
import { voiceCallsEnabled } from "@/lib/calls/flag";
import { applyWebhook, signatureValid, type WebhookBody } from "@/lib/calls/webhook";

export const maxDuration = 30;

// Provider call-status webhook. 404 while voice calls are off; signed with CALLS_WEBHOOK_SECRET.
export async function POST(req: Request) {
  if (!voiceCallsEnabled()) return new Response("Not found", { status: 404 });
  const raw = await req.text();
  if (!signatureValid(raw, req.headers.get("x-signature"))) return Response.json({ error: "Bad signature" }, { status: 401 });
  let body: WebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }
  try {
    return Response.json(await applyWebhook(getDb(), body));
  } catch {
    return Response.json({ ok: false }, { status: 500 }); // provider retries; dedupe makes that safe
  }
}
