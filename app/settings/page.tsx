import { Suspense } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { SettingsForm } from "@/components/settings/SettingsForm";

async function Loaded() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const [u] = await getDb().select().from(schema.users).where(eq(schema.users.id, session.user.id));
  if (!u) redirect("/");
  return (
    <>
      <AppHeader isOwner={!!u.isOwner} name={u.name} image={u.image} />
      <main className="mx-auto w-full max-w-2xl px-4 py-6">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Settings</h1>
        <SettingsForm isOwner={!!u.isOwner} />
      </main>
    </>
  );
}

export default function Settings() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-2xl px-4 py-6"><div className="h-64 animate-pulse rounded-card bg-surface-border" /></main>}>
      <Loaded />
    </Suspense>
  );
}
