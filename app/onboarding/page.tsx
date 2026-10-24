import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { getDb, spotifyConnections, users } from "@/lib/db";
import { getSuggestions } from "@/lib/identity/suggestions";
import { requireUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { getMyArtists, openCandidates } from "./actions";
import { OnboardingFlow } from "./flow";

const NOTICES: Record<string, string> = {
  denied: "Spotify connection cancelled. You can skip and paste artists instead.",
  expired: "Link expired, try again.",
  slow: "Spotify is slow, try again.",
  forbidden: "This Spotify account isn't on our test list yet. Send us the email on that account, or skip and paste artists instead.",
  error: "Spotify didn't connect. Skip and paste artists instead.",
};

export const maxDuration = 60;

async function Body({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.id, user.id));
  if (u?.onboardedAt) redirect("/radar");
  const [mine, suggestions, candidates, [conn]] = await Promise.all([
    getMyArtists(user.id),
    getSuggestions(),
    openCandidates(),
    db.select({ name: spotifyConnections.displayName }).from(spotifyConnections).where(eq(spotifyConnections.userId, user.id)),
  ]);
  const notice =
    sp.spotify === "ok" ? `Spotify connected: ${sp.n} artists (${sp.f} followed, ${sp.t} top).` : sp.spotify ? NOTICES[sp.spotify] ?? null : null;
  return (
    <OnboardingFlow
      firstName={(user.name ?? "").split(" ")[0]}
      initialMine={mine}
      suggestions={suggestions}
      spotify={{ connected: !!conn, name: conn?.name ?? null }}
      cities={{ p1: u?.p1Cities ?? [], p2: u?.p2Cities ?? [], allIndia: u?.watchAllIndia ?? true }}
      notice={notice}
      candidates={candidates.map((c) => ({ id: c.id, input: c.inputText, options: c.candidates as never }))}
    />
  );
}

export default function Onboarding({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-4 pb-24">
      <Suspense fallback={<p className="pt-10 text-muted">Loading…</p>}>
        <Body searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
