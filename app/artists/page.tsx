import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { getFollowedArtists } from "@/lib/artists/queries";
import { AppHeader } from "@/components/AppHeader";
import { ArtistsGrid } from "@/components/artists/ArtistsGrid";

async function Loaded() {
  const user = await requireUser();
  const artists = await getFollowedArtists(getDb(), user.id!);
  return (
    <>
      <AppHeader name={user.name ?? null} image={user.image ?? null} />
      <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-28 sm:pb-12">
        <h1 className="font-display mb-5 text-6xl leading-[0.9] font-black">Your artists</h1>
        <ArtistsGrid artists={artists} />
      </main>
    </>
  );
}

export default function Artists() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-5xl px-4 py-6"><div className="h-72 animate-pulse rounded-card bg-surface-border" /></main>}>
      <Loaded />
    </Suspense>
  );
}
