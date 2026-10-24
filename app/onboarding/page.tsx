import { Suspense } from "react";
import { requireUser } from "@/lib/session";

async function Body() {
  const user = await requireUser();
  return <p>Signed in as {user.email}. Onboarding arrives in Phase 1.</p>;
}

export default function Onboarding() {
  return (
    <main className="p-6">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Body />
      </Suspense>
    </main>
  );
}
