import { Suspense } from "react";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/lib/db";
import { track } from "@/lib/activity";
import { getArtistPage } from "@/lib/artists/queries";
import { getArtistMerch } from "@/lib/artists/merch";
import { getArtistNews } from "@/lib/news/queries";
import { refreshIfStale } from "@/lib/news/lazy";
import { voiceCallsEnabled } from "@/lib/calls/flag";
import { AppHeader } from "@/components/AppHeader";
import { ArtistPhoto } from "@/components/artist/ArtistPhoto";
import { ArtistActions } from "@/components/artists/ArtistActions";
import { ArtistShows } from "@/components/artists/ArtistShows";
import { MerchRail } from "@/components/artists/MerchRail";
import { NewsList } from "@/components/artists/NewsList";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function News({ id }: { id: string }) {
  const items = await getArtistNews(id);
  return <NewsList items={items} />;
}
async function Merch({ id }: { id: string }) {
  return <MerchRail items={await getArtistMerch(id)} />;
}
const Skeleton = () => <div className="h-28 animate-pulse rounded-card bg-surface-border" />;

async function Loaded({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const db = getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, session.user.id));
  if (!user) redirect("/");
  const data = await getArtistPage(db, user, id);
  if (!data) notFound(); // unknown, deceased or disbanded
  const { artist } = data;
  after(async () => {
    await track("artist_page_viewed", user.id, { artistId: artist.id });
    await refreshIfStale(db, { id: artist.id, name: artist.name });
  });
  return (
    <>
      <AppHeader name={user.name} image={user.image} />
      <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-28 sm:pb-12">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="h-32 w-32 shrink-0 overflow-hidden rounded-card"><ArtistPhoto name={artist.name} imageUrl={artist.image} /></div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-5xl leading-[0.9] font-black break-words sm:text-6xl">{artist.name}</h1>
            <p className="mt-2 text-sm text-muted">
              {[artist.genres.slice(0, 4).join(", "), artist.origin && artist.origin !== "unknown" ? (artist.origin === "india" ? "From India" : "International") : ""].filter(Boolean).join(" · ") || "No genre info yet"}
            </p>
            <div className="mt-3">
              <ArtistActions artistId={artist.id} following={data.following} priority={data.priority} callMe={data.callMe} voiceOn={voiceCallsEnabled()} />
            </div>
          </div>
        </header>

        <section className="mt-8" aria-labelledby="shows">
          <h2 id="shows" className="font-display mb-3 text-3xl font-extrabold">Upcoming India shows</h2>
          <ArtistShows events={data.shows} returnTo={`/artists/${artist.id}`} />
          <p className="mt-3 text-sm text-muted">Last India show: {artist.lastIndiaShow ?? "none on record"}</p>
        </section>

        <section className="mt-8" aria-labelledby="news">
          <h2 id="news" className="font-display mb-3 text-3xl font-extrabold">Latest news</h2>
          <Suspense fallback={<Skeleton />}><News id={artist.id} /></Suspense>
        </section>

        <section className="mt-8" aria-labelledby="merch">
          <h2 id="merch" className="font-display mb-3 text-3xl font-extrabold">Merch</h2>
          <Suspense fallback={<Skeleton />}><Merch id={artist.id} /></Suspense>
        </section>
      </main>
    </>
  );
}

export default function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-5xl px-4 py-6"><div className="h-72 animate-pulse rounded-card bg-surface-border" /></main>}>
      <Loaded params={params} />
    </Suspense>
  );
}
