import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import { and, asc, desc, eq, gte, ne } from "drizzle-orm";
import { auth, signIn } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { getEventView, getPublicCounters } from "@/lib/data/radar";
import { todayIST } from "@/lib/util/ist";
import { EventCard } from "@/components/event-card/EventCard";
import { Landing } from "@/components/landing/Landing";

// Shared by every visitor: cached for a few minutes so the landing page ships as a static shell.
async function loadCounters() {
  "use cache";
  cacheLife("minutes");
  cacheTag("landing");
  return getPublicCounters(getDb()).catch(() => null);
}

// A real, sourced show as the same flipping ticket the app uses. Nothing is made up.
async function loadExample() {
  "use cache";
  cacheLife("minutes");
  cacheTag("landing");
  const db = getDb();
  const [r] = await db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(and(eq(schema.events.isSample, false), ne(schema.events.status, "cancelled"), gte(schema.events.eventDate, todayIST()), gte(schema.events.confidence, 0.9)))
    .orderBy(desc(schema.events.ticketStatus), desc(schema.events.firstSeenAt), asc(schema.events.eventDate))
    .limit(1)
    .catch(() => []);
  return r ? await getEventView(db, r.id).catch(() => null) : null;
}

async function Example() {
  const d = await loadExample();
  if (!d) return null;
  return (
    <figure className="mx-auto w-full max-w-md space-y-2">
      <EventCard ev={d.view} readOnly auto />
      <figcaption className="text-center text-xs text-dim">A real show from the system. The card flips between the show, the artist and the tickets.</figcaption>
    </figure>
  );
}

async function signInWithGoogle() {
  "use server";
  await signIn("google", { redirectTo: "/radar" });
}

async function RedirectIfSignedIn() {
  const session = await auth();
  if (session?.user) redirect("/radar");
  return null;
}

async function Stats() {
  const stats = await loadCounters();
  return (
    <Landing stats={stats} signIn={signInWithGoogle}>
      <Suspense fallback={null}>
        <Example />
      </Suspense>
    </Landing>
  );
}

export default function Page() {
  return (
    <>
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <Suspense fallback={<main className="grid min-h-svh place-items-center"><span className="display text-6xl text-white">Front<span className="text-lilac">Row</span></span></main>}>
        <Stats />
      </Suspense>
    </>
  );
}
