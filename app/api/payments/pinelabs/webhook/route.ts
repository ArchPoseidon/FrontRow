import { NextResponse, type NextRequest } from "next/server";
import { paymentsEnabled } from "@/lib/payments/flag";
import { applyEvent, verifySignature } from "@/lib/payments/webhook";

export async function POST(req: NextRequest) {
  const secret = process.env.PINELABS_WEBHOOK_SECRET;
  if (!paymentsEnabled() || !secret) return NextResponse.json({ error: "disabled" }, { status: 404 });
  const body = await req.text(); // raw, unparsed
  const id = req.headers.get("webhook-id") ?? "";
  const timestamp = req.headers.get("webhook-timestamp") ?? "";
  const signature = req.headers.get("webhook-signature") ?? "";
  if (!id || !verifySignature({ id, timestamp, body, signature, secret })) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  try {
    const fresh = await applyEvent(id, payload);
    return NextResponse.json({ ok: true, duplicate: !fresh });
  } catch {
    return NextResponse.json({ error: "retry" }, { status: 500 });
  }
}
