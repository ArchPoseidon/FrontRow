import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";

async function Greeting() {
  const session = await auth();
  if (!session?.user) redirect("/");
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">
        Signed in as {session.user.name ?? session.user.email}
      </h1>
      <p className="text-muted">Your radar is coming in a later phase.</p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button className="rounded-card border border-surface-border px-4 py-2 text-sm">
          Sign out
        </button>
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
