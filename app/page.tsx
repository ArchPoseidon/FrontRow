import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { and, asc, desc, eq, gte, ne } from "drizzle-orm";
import { auth, signIn } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { getPublicCounters } from "@/lib/data/radar";
import { todayIST } from "@/lib/util/ist";

const STEPS = [
  { n: "1", t: "Tell us who you love", d: "Connect Spotify, search, or paste a list of artists. Every artist is matched to the right person, with a photo." },
  { n: "2", t: "We watch the calendar", d: "News, ticketing pages and web search, checked all day for shows in India." },
  { n: "3", t: "You hear first", d: "A Telegram alert the moment a show is announced, with the venue, date, tickets and whether early-bird is open." },
];

async function GoogleButton({ searchParams }: { searchParams: Promise<{ signin?: string }> }) {
  const [session, sp] = await Promise.all([auth(), searchParams]);
  if (session?.user) redirect("/radar");
  return (
    <div className="flex flex-col gap-3">
      {sp.signin && <p role="status" className="rounded-card border border-surface-border px-4 py-2 text-sm text-muted">Sign in to continue.</p>}
      <div className="flex flex-wrap gap-3">
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/radar" });
          }}
        >
          <button type="submit" className="rounded-card bg-accent px-6 py-3 font-medium text-accent-foreground transition hover:opacity-90">Continue with Google</button>
        </form>
        <Link href="/demo" className="rounded-card border border-surface-border px-6 py-3 font-medium transition hover:bg-surface">See a live demo</Link>
      </div>
    </div>
  );
}

async function Counters() {
  await connection(); // live numbers: render per request
  const c = await getPublicCounters(getDb()).catch(() => null);
  if (!c) return <p className="text-sm text-muted">Live numbers are loading…</p>;
  const items = [
    { v: c.artistsWatched, l: "artists watched" },
    { v: c.showsThisMonth, l: "shows found this month" },
    { v: c.alertsSent, l: "alerts sent" },
  ];
  return (
    <dl className="grid grid-cols-3 gap-3">
      {items.map((i) => (
        <div key={i.l} className="rounded-card border border-surface-border bg-surface p-3 sm:p-4">
          <dd className="text-2xl font-bold tabular-nums sm:text-3xl">{i.v.toLocaleString("en-IN")}</dd>
          <dt className="text-xs text-muted sm:text-sm">{i.l}</dt>
        </div>
      ))}
    </dl>
  );
}

// A real, sourced event rendered with the same poster the alerts use. Nothing is made up.
async function ExampleAlert() {
  await connection();
  const db = getDb();
  const [r] = await db
    .select({ id: schema.events.id, artist: schema.artists.name, city: schema.events.city })
    .from(schema.events)
    .innerJoin(schema.artists, eq(schema.artists.id, schema.events.artistId))
    .where(and(eq(schema.events.isSample, false), ne(schema.events.status, "cancelled"), gte(schema.events.eventDate, todayIST()), gte(schema.events.confidence, 0.9)))
    .orderBy(desc(schema.events.firstSeenAt), asc(schema.events.eventDate))
    .limit(1)
    .catch(() => []);
  if (!r) return null;
  return (
    <figure className="space-y-2">
      <Link href={`/event/${r.id}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/og/event/${r.id}?u=amber`} alt={`Example alert: ${r.artist}${r.city ? ` in ${r.city}` : ""}`} width={1200} height={630} className="w-full rounded-card border border-surface-border" />
      </Link>
      <figcaption className="text-xs text-muted">A real alert card from the system, not a mock-up.</figcaption>
    </figure>
  );
}

export default function Landing({ searchParams }: { searchParams: Promise<{ signin?: string }> }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-4 py-12 sm:py-20">
      <section className="flex flex-col gap-5">
        <p className="text-sm font-medium tracking-widest text-accent uppercase">FrontRow</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Be the first to know about a show.</h1>
        <p className="text-lg text-muted">Tell us the artists you love. FrontRow watches the Indian concert and festival calendar and messages you the moment one of them announces a show in India.</p>
        <Suspense fallback={<div className="h-12 w-72 animate-pulse rounded-card bg-surface-border" />}>
          <GoogleButton searchParams={searchParams} />
        </Suspense>
      </section>

      <Suspense fallback={<div className="grid grid-cols-3 gap-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-card bg-surface-border" />)}</div>}>
        <Counters />
      </Suspense>

      <section aria-labelledby="how" className="space-y-4">
        <h2 id="how" className="text-xl font-semibold">How it works</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-card border border-surface-border bg-surface p-4">
              <span className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">{s.n}</span>
              <h3 className="font-medium">{s.t}</h3>
              <p className="mt-1 text-sm text-muted">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <Suspense fallback={<div className="aspect-[1200/630] animate-pulse rounded-card bg-surface-border" />}>
        <ExampleAlert />
      </Suspense>

      <footer className="border-t border-surface-border pt-6 text-xs text-muted">FrontRow alerts you. You buy your own tickets. Personal, non-commercial project.</footer>
    </main>
  );
}
