import { after } from "next/server";
import { track } from "@/lib/activity";
import { reportWrongLink } from "@/lib/links/report";
import { requireApiUser, unauthorized } from "@/lib/session";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiUser();
  if (!ctx) return unauthorized();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Bad id" }, { status: 400 });
  const ok = await reportWrongLink(ctx.db, id);
  after(() => track("alert_action", ctx.user.id, { action: "wrong_link" }));
  return Response.json({ ok });
}
