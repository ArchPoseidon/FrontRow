import { Suspense } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { loadRadarPage } from "@/lib/data/page";
import { RadarView } from "@/components/radar/RadarView";
import { AppHeader } from "@/components/AppHeader";
import { ScanBanner } from "@/components/radar/ScanBanner";
import { CallMeServer } from "@/components/calls/CallMeServer";
import { RadarSkeleton } from "@/components/radar/RadarSkeleton";

const recentScan = (d: Date | null) => !!d && Date.now() - d.getTime() < 4 * 60_000;

async function Loaded() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const db = getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, session.user.id));
  if (!u) redirect("/");
  // First sign-in goes to onboarding; return visits stay here.
  if (!u.onboardedAt) redirect("/onboarding");
  const d = await loadRadarPage(db, u, { history: true });
  return (
    <>
      <AppHeader isOwner={!!u.isOwner} name={u.name} image={u.image} />
      <section>
        <div className="mx-auto w-full max-w-5xl px-4 py-8">
          <p className="text-xs font-bold tracking-widest text-muted uppercase">{u.homeCity ?? "Bengaluru"} · {d.events.length} shows on your radar</p>
          <h1 className="font-display text-6xl leading-[0.9] font-black sm:text-7xl">Your radar</h1>
        </div>
      </section>
      <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-28 sm:pb-12">
        {u.firstScanAt && recentScan(u.firstScanAt) && <ScanBanner since={u.firstScanAt.toISOString()} count={d.events.length} />}
        <RadarView {...d} p1Cities={u.p1Cities ?? []} p2Cities={u.p2Cities ?? []} homeCity={u.homeCity ?? "Bengaluru"} hasArtists={d.artists.length > 0} />
        <Suspense fallback={null}>
          <CallMeServer userId={u.id} />
        </Suspense>
      </main>
    </>
  );
}

export default function Radar() {
  return (
    <Suspense fallback={<RadarSkeleton />}>
      <Loaded />
    </Suspense>
  );
}
