import { cacheLife, cacheTag } from "next/cache";
import { artistOptions, getProductDetail, listProducts, type Filters } from "./core";

/** Shared catalogue reads: same for every visitor, so cached and tagged "merch". */
export async function getMerchList(f: Filters) {
  "use cache";
  cacheLife("minutes");
  cacheTag("merch");
  return listProducts(f);
}

export async function getMerchArtists() {
  "use cache";
  cacheLife("minutes");
  cacheTag("merch");
  return artistOptions();
}

export async function getMerchProduct(id: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("merch");
  return getProductDetail(id);
}
