import { config } from "dotenv";
config({ path: ".env.local" });
async function main() {
  const { getDb, users } = await import("../lib/db");
  const { like } = await import("drizzle-orm");
  const r = await getDb().delete(users).where(like(users.email, "%@frontrow.test")).returning({ id: users.id });
  console.log("deleted", r.length);
}
main().then(() => process.exit(0));
