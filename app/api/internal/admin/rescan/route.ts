import { eq } from "drizzle-orm";
import { after } from "next/server";
import { adminAuthorized } from "@/lib/admin-auth";
import { startBackgroundScan } from "@/lib/brain/scan";
import { getDb, schema } from "@/lib/db";

export const maxDuration = 60;

// Called by the admin site: re-run the first scan for one user (clears first_scan_at, then scans in the background).
export async function POST(req: Request) {
  if (!adminAuthorized(req)) return new Response("Not found", { status: 404 });
  const { userId } = (await req.json().catch(() => ({}))) as { userId?: string };
  if (!userId) return Response.json({ error: "userId required" }, { status: 400 });
  const db = getDb();
  await db.update(schema.users).set({ firstScanAt: null }).where(eq(schema.users.id, userId));
  after(() => startBackgroundScan(db, userId, 50_000));
  return Response.json({ ok: true, started: true });
}
