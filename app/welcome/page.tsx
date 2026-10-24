import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { FirstRun } from "@/components/welcome/FirstRun";

async function Guard() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  return <FirstRun />;
}

export default function Welcome() {
  return (
    <main className="min-h-screen">
      <Suspense fallback={<div className="mx-auto h-40 w-full max-w-3xl animate-pulse px-4 py-8" />}>
        <Guard />
      </Suspense>
    </main>
  );
}
