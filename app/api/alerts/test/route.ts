import { requireApiUser, unauthorized } from "@/lib/session";
import { sendTestAlert } from "@/lib/notify/test-alert";

export const maxDuration = 60;

export async function POST() {
  const ctx = await requireApiUser();
  if (!ctx) return unauthorized();
  const r = await sendTestAlert(ctx.db, ctx.user);
  return Response.json(r, { status: r.status ?? (r.ok ? 200 : 500) });
}
