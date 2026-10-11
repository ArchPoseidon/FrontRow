import { Suspense } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { loadRadarPage } from "@/lib/data/page";
import { RadarView } from "@/components/radar/RadarView";
import { AppHeader } from "@/components/AppHeader";
import { RadarSkeleton } from "@/components/radar/RadarSkeleton";

async function Loaded() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const db = getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, session.user.id));
  if (!u) redirect("/");
  // First sign-in goes to onboarding; return visits stay here.
  if (!u.onboardedAt && !u.onboardingStep) redirect("/onboarding");
  const d = await loadRadarPage(db, u, { history: true });
  return (
    <>
      <AppHeader isOwner={!!u.isOwner} name={u.name} image={u.image} />
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Your radar</h1>
        <RadarView {...d} homeCity={u.homeCity ?? "Bengaluru"} />
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
