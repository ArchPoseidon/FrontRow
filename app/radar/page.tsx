import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth, signOut } from "@/auth";
import { getDb, schema } from "@/lib/db";

async function Greeting() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const [u] = await getDb().select().from(schema.users).where(eq(schema.users.id, session.user.id));
  // First sign-in goes to onboarding; return visits stay here.
  if (u && !u.onboardedAt && !u.onboardingStep) redirect("/onboarding");
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Signed in as {session.user.name ?? session.user.email}</h1>
      <p className="text-muted">Your radar is coming in a later phase.</p>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/onboarding" className="rounded-card bg-accent px-4 py-2 font-medium text-accent-foreground">Manage artists</Link>
        {u?.isOwner && (
          <Link href="/setup" className="rounded-card border border-surface-border px-4 py-2">Owner setup</Link>
        )}
      </div>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button className="rounded-card border border-surface-border px-4 py-2 text-sm">Sign out</button>
      </form>
    </>
  );
}

export default function Radar() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-6 px-4 py-16">
      <Suspense fallback={<div className="h-10 w-72 animate-pulse rounded-card bg-surface-border" />}>
        <Greeting />
      </Suspense>
    </main>
  );
}
