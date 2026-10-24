// Backfill: check every artist in the DB against MusicBrainz (1 request/second). Usage: tsx scripts/check-deceased.ts
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { recheckDeceased } = await import("../lib/identity/deceased");
  const r = await recheckDeceased(55 * 60_000, { all: true });
  console.log("checked", r.checked, "hidden", r.hidden);
}
main().then(() => process.exit(0));
