import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

function Hero({ action }: { action: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-8 px-4 py-16">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium tracking-widest text-accent uppercase">FrontRow</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Be the first to know about a show.
        </h1>
        <p className="text-lg text-muted">
          Tell us the artists you love. We watch the Indian concert and festival calendar and alert
          you the moment one of them announces a show.
        </p>
      </div>
      {action}
    </main>
  );
}

async function SignInAction() {
  const session = await auth();
  if (session?.user) redirect("/radar");
  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: "/radar" });
      }}
    >
      <button
        type="submit"
        className="rounded-card bg-accent px-6 py-3 font-medium text-accent-foreground transition hover:opacity-90"
      >
        Continue with Google
      </button>
    </form>
  );
}

export default function Landing() {
  return (
    <Hero
      action={
        <Suspense
          fallback={<div className="h-12 w-56 animate-pulse rounded-card bg-surface-border" />}
        >
          <SignInAction />
        </Suspense>
      }
    />
  );
}
