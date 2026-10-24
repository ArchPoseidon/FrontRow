import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { auth } from "@/auth";
import { track } from "@/lib/activity";
import { getMerchProduct } from "@/lib/merch/queries";
import { AddToCart } from "@/components/merch/AddToCart";
import { Gallery } from "@/components/merch/Gallery";
import { inr } from "@/components/merch/ProductCard";

async function Body({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [p, session] = await Promise.all([getMerchProduct(id), auth()]);
  if (!p) notFound();
  const userId = session?.user?.id ?? null;
  after(() => track("merch_viewed", userId, { productId: p.id }));
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Gallery images={p.images} name={p.name} />
      <div>
        <Link href={`/artists/${p.artistId}`} className="text-sm text-[var(--wordmark-soft)] underline">{p.artistName}</Link>
        <h1 className="mt-1 font-display text-4xl uppercase leading-none tracking-wide">{p.name}</h1>
        <p className="mt-2 font-display text-3xl">{inr(p.priceInr)}</p>
        <p className="mt-1 text-xs uppercase tracking-wider text-muted">{p.isDemo ? "Demo store · placeholder product" : "Official merch"}</p>
        {p.description && <p className="mt-4 text-sm text-muted">{p.description}</p>}
        <div className="mt-6">
          <AddToCart
            variants={p.variants}
            signedIn={!!userId}
            product={{ id: p.id, name: p.name, priceInr: p.priceInr, image: p.images[0] ?? null, artistName: p.artistName }}
          />
        </div>
      </div>
    </div>
  );
}

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto min-h-dvh max-w-4xl px-4 pb-24 pt-6">
      <Link href="/merch" className="mb-4 inline-block text-sm text-muted">← Merch</Link>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Body params={params} />
      </Suspense>
    </main>
  );
}
