import { Suspense } from "react";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { loadRadarPage } from "@/lib/data/page";
import { RadarView } from "@/components/radar/RadarView";
import { RadarSkeleton } from "@/components/radar/RadarSkeleton";

export const metadata = { title: "Live demo · FrontRow", description: "A real radar, read-only." };

async function Loaded() {
  const db = getDb();
  const [owner] = await db.select().from(schema.users).where(eq(schema.users.isOwner, true));
  if (!owner) {
    return <main className="mx-auto max-w-xl px-4 py-20 text-center"><p className="text-muted">The demo radar isn&apos;t ready yet.</p></main>;
  }
  const d = await loadRadarPage(db, owner, { history: false });
  const first = (owner.name ?? "the owner").split(" ")[0];
  return (
    <>
      <div className="sticky top-0 z-20 border-b border-surface-border bg-accent text-accent-foreground">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
          <span>You&apos;re viewing {first}&apos;s radar. Sign in to build your own.</span>
          <Link href="/?signin=1" className="rounded-card bg-background px-3 py-1 font-medium text-foreground">Build your own</Link>
        </div>
      </div>
      <section>
        <div className="mx-auto w-full max-w-5xl px-4 py-8">
          <p className="text-xs font-bold tracking-widest text-muted uppercase">Live demo · {d.events.length} real shows</p>
          <h1 className="font-display text-6xl leading-[0.9] font-black sm:text-7xl">{first}&apos;s radar</h1>
        </div>
      </section>
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <RadarView {...d} homeCity={owner.homeCity ?? "Bengaluru"} readOnly hasArtists={d.artists.length > 0} />
      </main>
    </>
  );
}

export default function Demo() {
  return (
    <Suspense fallback={<RadarSkeleton />}>
      <Loaded />
    </Suspense>
  );
}
