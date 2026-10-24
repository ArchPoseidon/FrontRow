import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { getMyArtists } from "@/app/onboarding/actions";

async function Body() {
  const user = await requireUser();
  const mine = await getMyArtists(user.id);
  return (
    <>
      <p className="rounded-xl bg-white/10 p-3 text-sm">Finding your shows… we&apos;ll message you the moment one lands.</p>
      <h2 className="mt-6 font-display text-2xl uppercase">Your artists · {mine.length}</h2>
      <p className="mt-2 text-muted">{mine.map((a) => a.name).join(", ")}</p>
    </>
  );
}

export default function Radar() {
  return (
    <main className="mx-auto max-w-3xl p-4">
      <h1 className="font-display text-4xl uppercase">Radar</h1>
      <Suspense fallback={<p className="mt-4 text-muted">Loading…</p>}>
        <Body />
      </Suspense>
    </main>
  );
}
