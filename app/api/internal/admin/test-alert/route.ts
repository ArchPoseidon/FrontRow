import { eq } from "drizzle-orm";
import { adminAuthorized } from "@/lib/admin-auth";
import { getDb, schema } from "@/lib/db";
import { sendTestAlert } from "@/lib/notify/test-alert";

export const maxDuration = 60;

// Called by the admin site: send a labelled test alert to one user.
export async function POST(req: Request) {
  if (!adminAuthorized(req)) return new Response("Not found", { status: 404 });
  const { userId } = (await req.json().catch(() => ({}))) as { userId?: string };
  if (!userId) return Response.json({ error: "userId required" }, { status: 400 });
  const db = getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) return Response.json({ error: "No such user" }, { status: 404 });
  const r = await sendTestAlert(db, user);
  return Response.json(r, { status: r.ok ? 200 : 422 });
}
