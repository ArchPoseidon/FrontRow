import { signIn } from "@/auth";

export default function Landing() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4">
      <h1 className="font-display text-6xl font-extrabold uppercase tracking-tight text-[var(--wordmark)]">
        Front<span className="text-[var(--wordmark-soft)]">Row</span>
      </h1>
      <p className="text-lg text-muted">Be the first to know about a show.</p>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/onboarding" });
        }}
      >
        <button className="w-full rounded-[var(--radius)] bg-[var(--magenta)] px-4 py-3 font-semibold text-white">
          Continue with Google
        </button>
      </form>
    </main>
  );
}
