import { activityEvents, getDb } from "@/lib/db";

/** Never throws, never blocks. Call inside `after()`. No secrets, phones or emails in meta. */
export async function track(type: string, userId: string | null, meta: Record<string, unknown> = {}) {
  try {
    await getDb().insert(activityEvents).values({ type, userId, meta });
  } catch {
    /* tracking must never break a request */
  }
}
