import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync } from "node:fs";

async function main() {
  const { MerchFile, joinImages } = await import("../lib/merch/schema");
  const { getDb, artists, merchProducts, merchVariants } = await import("../lib/db");
  const { normalizeName, derivedAliases } = await import("../lib/util/names");
  const { eq, and, notInArray } = await import("drizzle-orm");
  const file = process.argv[2] ?? "data/merch.json";
  const parsed = MerchFile.parse(JSON.parse(readFileSync(file, "utf8")));
  const db = getDb();

  for (const p of parsed.products) {
    for (const s of p.sizes) if (p.stock[s] === undefined) throw new Error(`${p.id}: no stock for size ${s}`);
    const norm = normalizeName(p.artist);
    let [a] = await db.select({ id: artists.id }).from(artists).where(eq(artists.normalizedName, norm)).limit(1);
    if (!a) {
      [a] = await db.insert(artists).values({ name: p.artist, normalizedName: norm, aliases: derivedAliases(p.artist), identityStatus: "unverified" }).returning({ id: artists.id });
      console.log("created stub artist", p.artist);
    }
    const row = { artistId: a.id, name: p.name, description: p.description, imageUrl: joinImages(p.image), priceInr: p.priceInr, category: p.category, isDemo: true, active: true };
    await db.insert(merchProducts).values({ id: p.id, ...row }).onConflictDoUpdate({ target: merchProducts.id, set: row });
    for (const size of p.sizes) {
      await db.insert(merchVariants).values({ productId: p.id, size, sku: `${p.id}-${size}`, stock: p.stock[size]! })
        .onConflictDoUpdate({ target: merchVariants.sku, set: { stock: p.stock[size]!, size, productId: p.id } });
    }
    // drop variants no longer listed
    await db.delete(merchVariants).where(and(eq(merchVariants.productId, p.id), notInArray(merchVariants.size, p.sizes)));
    console.log("ok", p.id);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
