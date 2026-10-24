import { config } from "dotenv";
config({ path: ".env.local" });
import { randomUUID } from "node:crypto";

async function main() {
  const { getDb, users, sessions } = await import("../lib/db");
  const db = getDb();
  const email = process.argv[2] ?? "tester1@frontrow.test";
  const [u] = await db.insert(users).values({ name: "Test User", email }).onConflictDoUpdate({ target: users.email, set: { name: "Test User" } }).returning({ id: users.id });
  const token = randomUUID();
  await db.insert(sessions).values({ sessionToken: token, userId: u.id, expires: new Date(Date.now() + 86400_000) });
  console.log(token);
}
main().then(() => process.exit(0));
