import { and, asc, desc, eq, exists, gt, gte, inArray, lte, sql } from "drizzle-orm";
import { artists, cartItems, getDb, merchProducts, merchVariants } from "@/lib/db";
import { visibleArtist } from "@/lib/identity/store";
import { splitImages } from "./schema";

export type Filters = { artists: string[]; min: number | null; max: number | null; sizes: string[]; sort: "newest" | "price_asc" | "price_desc" };
export type ProductCard = { id: string; name: string; priceInr: number; image: string | null; artistId: string; artistName: string; inStock: boolean; category: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIZE_SET = new Set(["S", "M", "L", "XL", "Free"]);

/** Parse URL search params into safe filters. */
export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]);
  const num = (k: string) => {
    const v = one(k);
    if (v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  };
  const list = (k: string) => (one(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const sort = one("sort");
  return {
    artists: list("artist").filter((s) => UUID.test(s)).slice(0, 50),
    min: num("min"),
    max: num("max"),
    sizes: list("size").filter((s) => SIZE_SET.has(s)),
    sort: sort === "price_asc" || sort === "price_desc" ? sort : "newest",
  };
}

export async function listProducts(f: Filters): Promise<ProductCard[]> {
  const db = getDb();
  const conds = [eq(merchProducts.active, true), visibleArtist];
  if (f.artists.length) conds.push(inArray(merchProducts.artistId, f.artists));
  if (f.min !== null) conds.push(gte(merchProducts.priceInr, f.min));
  if (f.max !== null) conds.push(lte(merchProducts.priceInr, f.max));
  if (f.sizes.length) {
    conds.push(
      exists(
        db.select({ one: sql`1` }).from(merchVariants).where(
          and(eq(merchVariants.productId, merchProducts.id), inArray(merchVariants.size, f.sizes), gt(merchVariants.stock, 0)),
        ),
      ),
    );
  }
  const order = f.sort === "price_asc" ? asc(merchProducts.priceInr) : f.sort === "price_desc" ? desc(merchProducts.priceInr) : desc(merchProducts.createdAt);
  const rows = await db
    .select({
      id: merchProducts.id, name: merchProducts.name, priceInr: merchProducts.priceInr, image: merchProducts.imageUrl,
      category: merchProducts.category, artistId: artists.id, artistName: artists.name,
      stock: sql<number>`coalesce((select sum(${merchVariants.stock}) from ${merchVariants} where ${merchVariants.productId} = ${merchProducts.id}), 0)`,
    })
    .from(merchProducts)
    .innerJoin(artists, eq(artists.id, merchProducts.artistId))
    .where(and(...conds))
    .orderBy(order, asc(merchProducts.id));
  return rows.map((r) => ({
    id: r.id, name: r.name, priceInr: r.priceInr, image: splitImages(r.image)[0] ?? null,
    artistId: r.artistId, artistName: r.artistName, inStock: Number(r.stock) > 0, category: r.category,
  }));
}

export async function artistOptions(): Promise<{ id: string; name: string }[]> {
  return getDb()
    .selectDistinct({ id: artists.id, name: artists.name })
    .from(merchProducts)
    .innerJoin(artists, eq(artists.id, merchProducts.artistId))
    .where(and(eq(merchProducts.active, true), visibleArtist))
    .orderBy(asc(artists.name));
}

export type ProductDetail = {
  id: string; name: string; description: string; priceInr: number; images: string[]; isDemo: boolean;
  artistId: string; artistName: string;
  variants: { id: string; size: string | null; stock: number }[];
};

export async function getProductDetail(id: string): Promise<ProductDetail | null> {
  const db = getDb();
  const [p] = await db
    .select({
      id: merchProducts.id, name: merchProducts.name, description: merchProducts.description, priceInr: merchProducts.priceInr,
      image: merchProducts.imageUrl, isDemo: merchProducts.isDemo, artistId: artists.id, artistName: artists.name,
    })
    .from(merchProducts)
    .innerJoin(artists, eq(artists.id, merchProducts.artistId))
    .where(and(eq(merchProducts.id, id), eq(merchProducts.active, true), visibleArtist));
  if (!p) return null;
  const variants = await db
    .select({ id: merchVariants.id, size: merchVariants.size, stock: merchVariants.stock })
    .from(merchVariants).where(eq(merchVariants.productId, id));
  const order = ["S", "M", "L", "XL", "Free"];
  variants.sort((a, b) => order.indexOf(a.size ?? "") - order.indexOf(b.size ?? ""));
  return { ...p, description: p.description ?? "", images: splitImages(p.image), variants };
}

/* ---------- cart ---------- */

export type CartLine = { variantId: string; qty: number; stock: number; size: string | null; productId: string; name: string; priceInr: number; image: string | null; artistName: string };

export async function getCartLines(userId: string): Promise<CartLine[]> {
  const rows = await getDb()
    .select({
      variantId: cartItems.variantId, qty: cartItems.qty, stock: merchVariants.stock, size: merchVariants.size,
      productId: merchProducts.id, name: merchProducts.name, priceInr: merchProducts.priceInr, image: merchProducts.imageUrl,
      artistName: artists.name,
    })
    .from(cartItems)
    .innerJoin(merchVariants, eq(merchVariants.id, cartItems.variantId))
    .innerJoin(merchProducts, eq(merchProducts.id, merchVariants.productId))
    .innerJoin(artists, eq(artists.id, merchProducts.artistId))
    .where(and(eq(cartItems.userId, userId), eq(merchProducts.active, true), visibleArtist))
    .orderBy(asc(merchProducts.name));
  return rows.map((r) => ({ ...r, image: splitImages(r.image)[0] ?? null }));
}

/** Adds qty (capped by stock). Returns false if the variant is unknown or out of stock. */
export async function addToCart(userId: string, variantId: string, qty = 1): Promise<boolean> {
  const db = getDb();
  const [v] = await db.select({ stock: merchVariants.stock }).from(merchVariants).where(eq(merchVariants.id, variantId));
  if (!v || v.stock <= 0) return false;
  const [cur] = await db.select({ qty: cartItems.qty }).from(cartItems).where(and(eq(cartItems.userId, userId), eq(cartItems.variantId, variantId)));
  const next = Math.min(Math.max(1, (cur?.qty ?? 0) + qty), v.stock, 10);
  await db.insert(cartItems).values({ userId, variantId, qty: next })
    .onConflictDoUpdate({ target: [cartItems.userId, cartItems.variantId], set: { qty: next } });
  return true;
}

export async function setCartQty(userId: string, variantId: string, qty: number): Promise<void> {
  if (qty <= 0) return removeFromCart(userId, variantId);
  const db = getDb();
  const [v] = await db.select({ stock: merchVariants.stock }).from(merchVariants).where(eq(merchVariants.id, variantId));
  if (!v) return;
  const next = Math.min(qty, Math.max(v.stock, 1), 10);
  await db.update(cartItems).set({ qty: next }).where(and(eq(cartItems.userId, userId), eq(cartItems.variantId, variantId)));
}

export async function removeFromCart(userId: string, variantId: string): Promise<void> {
  await getDb().delete(cartItems).where(and(eq(cartItems.userId, userId), eq(cartItems.variantId, variantId)));
}

export async function clearCart(userId: string): Promise<void> {
  await getDb().delete(cartItems).where(eq(cartItems.userId, userId));
}
