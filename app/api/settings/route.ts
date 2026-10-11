import { eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/session";
import { emailConfigured } from "@/lib/notify/email";

export const INDIAN_CITIES = ["Bengaluru", "Mumbai", "Delhi", "Hyderabad", "Chennai", "Pune", "Kolkata", "Ahmedabad", "Goa", "Jaipur", "Chandigarh", "Kochi", "Gurugram", "Lucknow", "Indore"];

const shape = (u: typeof schema.users.$inferSelect) => ({
  name: u.name,
  email: u.email,
  image: u.image,
  homeCity: u.homeCity ?? "Bengaluru",
  watchCities: u.watchCities ?? ["ALL_INDIA"],
  emailEnabled: u.emailEnabled !== false,
  telegramEnabled: u.telegramEnabled !== false,
  telegramLinked: !!u.telegramChatId,
  emailAvailable: emailConfigured(),
  cities: INDIAN_CITIES,
});

export async function GET() {
  const ctx = await requireUser();
  if (!ctx) return unauthorized();
  return Response.json(shape(ctx.user));
}

const Body = z.object({
  homeCity: z.string().min(2).max(40).optional(),
  watchCities: z.array(z.string().min(2).max(40)).max(30).optional(),
  emailEnabled: z.boolean().optional(),
  telegramEnabled: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const ctx = await requireUser();
  if (!ctx) return unauthorized();
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const b = body.data;
  await ctx.db
    .update(schema.users)
    .set({
      ...(b.homeCity ? { homeCity: b.homeCity } : {}),
      ...(b.watchCities ? { watchCities: b.watchCities.length ? b.watchCities : ["ALL_INDIA"] } : {}),
      ...(b.emailEnabled !== undefined ? { emailEnabled: b.emailEnabled } : {}),
      ...(b.telegramEnabled !== undefined ? { telegramEnabled: b.telegramEnabled } : {}),
    })
    .where(eq(schema.users.id, ctx.user.id));
  const [u] = await ctx.db.select().from(schema.users).where(eq(schema.users.id, ctx.user.id));
  return Response.json(shape(u));
}
