import { z } from "zod";

export const SIZES = ["S", "M", "L", "XL", "Free"] as const;
export type Size = (typeof SIZES)[number];
export const CATEGORIES = ["tee", "hoodie", "poster", "accessory"] as const;

export const MerchProductInput = z.object({
  id: z.string().min(1),
  artist: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  /** One image or a list (first is the cover). */
  image: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  priceInr: z.number().int().positive(),
  category: z.enum(CATEGORIES),
  sizes: z.array(z.enum(SIZES)).min(1),
  stock: z.partialRecord(z.enum(SIZES), z.number().int().min(0)),
});
export const MerchFile = z.object({ products: z.array(MerchProductInput) });
export type MerchProductInput = z.infer<typeof MerchProductInput>;

/** Images are stored in one text column, joined with "|". */
export const joinImages = (img: string | string[]) => (Array.isArray(img) ? img.join("|") : img);
export const splitImages = (s: string | null) => (s ? s.split("|").filter(Boolean) : []);
