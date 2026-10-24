import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { and, lt, or, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/lib/db";

/** Pages: returns the session user or redirects to the landing page. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  touchSeen(session.user.id);
  return session.user;
}

/** last_seen_at, at most once per 10 minutes per user. Never blocks the request. */
export function touchSeen(userId: string) {
  try {
    after(async () => {
      const cutoff = new Date(Date.now() - 10 * 60_000);
      await getDb()
        .update(schema.users)
        .set({ lastSeenAt: new Date() })
        .where(and(eq(schema.users.id, userId), or(isNull(schema.users.lastSeenAt), lt(schema.users.lastSeenAt, cutoff))))
        .catch(() => {});
    });
  } catch {
    /* after() is unavailable outside a request */
  }
}

/** API routes: returns { db, user } with the full DB row, or null. */
export async function requireApiUser() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const db = getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!user || user.disabledAt) return null;
  touchSeen(user.id);
  return { db, user };
}

export const unauthorized = () => Response.json({ error: "Please sign in" }, { status: 401 });
