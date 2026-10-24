import { eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/lib/db";
import { requireApiUser, unauthorized } from "@/lib/session";
import { emailConfigured } from "@/lib/notify/email";

import { MAJOR_CITIES } from "@/lib/util/cities";
import { after } from "next/server";
import { track } from "@/lib/activity";

const shape = (u: typeof schema.users.$inferSelect) => ({
  name: u.name,
  email: u.email,
  image: u.image,
  homeCity: u.homeCity ?? "Bengaluru",
  p1Cities: u.p1Cities ?? [],
  p2Cities: u.p2Cities ?? [],
  watchAllIndia: u.watchAllIndia !== false,
  emailEnabled: u.emailEnabled !== false,
  telegramEnabled: u.telegramEnabled !== false,
  telegramLinked: !!u.telegramChatId,
  emailAvailable: emailConfigured(),
  cities: [...MAJOR_CITIES],
});

export async function GET() {
  const ctx = await requireApiUser();
  if (!ctx) return unauthorized();
  return Response.json(shape(ctx.user));
}

const Body = z.object({
  homeCity: z.string().min(2).max(40).optional(),
  p1Cities: z.array(z.string()).max(3).optional(),
  p2Cities: z.array(z.string()).max(5).optional(),
  watchAllIndia: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  telegramEnabled: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const ctx = await requireApiUser();
  if (!ctx) return unauthorized();
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const b = body.data;
  const ok = new Set<string>(MAJOR_CITIES);
  const p1 = b.p1Cities ? [...new Set(b.p1Cities.filter((c) => ok.has(c)))].slice(0, 3) : undefined;
  const p2 = b.p2Cities ? [...new Set(b.p2Cities.filter((c) => ok.has(c) && !(p1 ?? ctx.user.p1Cities ?? []).includes(c)))].slice(0, 5) : undefined;
  await ctx.db
    .update(schema.users)
    .set({
      ...(b.homeCity && !p1 ? { homeCity: b.homeCity } : {}),
      ...(p1 ? { p1Cities: p1, homeCity: p1[0] ?? ctx.user.homeCity } : {}),
      ...(p2 ? { p2Cities: p2 } : {}),
      ...(b.watchAllIndia !== undefined ? { watchAllIndia: b.watchAllIndia } : {}),
      ...(b.emailEnabled !== undefined ? { emailEnabled: b.emailEnabled } : {}),
      ...(b.telegramEnabled !== undefined ? { telegramEnabled: b.telegramEnabled } : {}),
    })
    .where(eq(schema.users.id, ctx.user.id));
  const [u] = await ctx.db.select().from(schema.users).where(eq(schema.users.id, ctx.user.id));
  after(() => track("cities_changed", ctx.user.id));
  return Response.json(shape(u));
}
