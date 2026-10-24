import { after } from "next/server";
import { requireApiUser, unauthorized } from "@/lib/session";
import { track } from "@/lib/activity";

// Client-side activity events. Session required; only these types, only these meta keys, short plain values (no PII).
const TYPES = new Set(["search_used", "city_filter_used", "calendar_add"]);
const META_KEYS = new Set(["page", "city", "via", "chip"]);
const SAFE = /^[a-z0-9_ -]{1,40}$/i;

export async function POST(req: Request) {
  const u = await requireApiUser();
  if (!u) return unauthorized();
  const b = (await req.json().catch(() => null)) as { type?: unknown; meta?: unknown } | null;
  if (!b || typeof b.type !== "string" || !TYPES.has(b.type)) return Response.json({ error: "Unknown event" }, { status: 400 });
  const meta: Record<string, string> = {};
  if (b.meta && typeof b.meta === "object") {
    for (const [k, v] of Object.entries(b.meta as Record<string, unknown>)) if (META_KEYS.has(k) && typeof v === "string" && SAFE.test(v)) meta[k] = v;
  }
  const type = b.type;
  after(() => track(type, u.user.id, meta));
  return Response.json({ ok: true });
}
