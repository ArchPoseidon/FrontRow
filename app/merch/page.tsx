import { Suspense } from "react";
import { getMerchArtists, getMerchList } from "@/lib/merch/queries";
import { parseFilters } from "@/lib/merch/core";
import { FilterBar } from "@/components/merch/FilterBar";
import { ProductCard } from "@/components/merch/ProductCard";
import Link from "next/link";

async function Body({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = parseFilters(await searchParams);
  const [products, artistOptions] = await Promise.all([getMerchList(filters), getMerchArtists()]);
  return (
    <>
      <FilterBar filters={filters} artistOptions={artistOptions} count={products.length} />
      {products.length ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      ) : (
        <p className="mt-10 text-center text-muted">Nothing matches those filters.</p>
      )}
    </>
  );
}

export default function MerchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-4 pb-24 pt-6">
      <div className="mb-4 flex items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-4xl uppercase tracking-wide">Merch</h1>
          <p className="text-xs uppercase tracking-wider text-muted">Demo store</p>
        </div>
        <Link href="/cart" className="rounded-full bg-white/10 px-4 py-2 text-sm">Cart</Link>
      </div>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Body searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
