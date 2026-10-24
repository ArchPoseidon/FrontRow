import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb, schema } from "@/lib/db";

/** Pages: returns the session user or redirects to the landing page. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  return session.user;
}

/** API routes: returns { db, user } with the full DB row, or null. */
export async function requireApiUser() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const db = getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  return user && !user.disabledAt ? { db, user } : null;
}

export const unauthorized = () => Response.json({ error: "Please sign in" }, { status: 401 });
