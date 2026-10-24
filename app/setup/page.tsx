import { Suspense } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { count, desc } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb, schema } from "@/lib/db";

const MESSAGES: Record<string, string> = {
  connected: "Spotify connected.",
  invite_only: "Spotify refused the connection. Check that this Spotify account's email is under User management in the Spotify dashboard, and that the app owner has Premium.",
  denied: "Spotify connection was cancelled.",
  error: "Couldn't connect to Spotify. Check the redirect URI in the Spotify dashboard matches exactly, then try again.",
};

async function Loaded({ searchParams }: { searchParams: Promise<{ spotify?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const db = getDb();
  const [u] = await db.select({ isOwner: schema.users.isOwner }).from(schema.users).where(eq(schema.users.id, session.user.id));
  if (!u?.isOwner) redirect("/radar");
  const { spotify } = await searchParams;
  const [c] = await db.select().from(schema.spotifyConnections).where(eq(schema.spotifyConnections.userId, session.user.id));
  const host = (await headers()).get("host") ?? "";
  const configured = process.env.SPOTIFY_REDIRECT_URI ?? "(not set)";
  const redirectOk = !!host && configured.includes(host);
  const [[conns], refusedRuns] = await Promise.all([
    db.select({ n: count() }).from(schema.spotifyConnections),
    db.select({ at: schema.runs.startedAt, errors: schema.runs.errors }).from(schema.runs).where(eq(schema.runs.job, "spotify-connect")).orderBy(desc(schema.runs.startedAt)).limit(40),
  ]);
  const refused = refusedRuns.filter((r) => Array.isArray(r.errors) && r.errors.length > 0).slice(0, 10);
  const state = !c ? "Not connected" : c.broken ? "Broken: reconnect needed" : "Connected";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Owner setup</h1>
      {spotify && MESSAGES[spotify] && <p role="status" className="rounded-card border border-surface-border px-4 py-3 text-sm">{MESSAGES[spotify]}</p>}
      <section className="flex flex-col gap-3 rounded-card border border-surface-border bg-surface p-4">
        <h2 className="font-semibold">Spotify</h2>
        <p className="text-sm text-muted">Status: <span className={c?.broken ? "text-urgency-red" : "text-foreground"}>{state}</span>{c?.spotifyUserId ? ` · ${c.spotifyUserId}` : ""}</p>
        <a href="/api/spotify/connect?next=setup" className="self-start rounded-card bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">{c ? "Reconnect Spotify" : "Connect Spotify"}</a>
        <p className="text-xs text-muted">Permissions requested: view followed artists and top artists. Tokens stay on the server.</p>
      </section>
      <section className="flex flex-col gap-3 rounded-card border border-surface-border bg-surface p-4">
        <h2 className="font-semibold">Spotify diagnostics</h2>
        <p className="text-sm text-muted">Redirect URI configured: <code className="break-all">{configured}</code></p>
        <p className="text-sm text-muted">Current host: <code>{host}</code> {redirectOk ? <span className="text-emerald-500">✓ matches</span> : <span className="text-urgency-red">✗ does not match: add the right URI in the Spotify dashboard and update SPOTIFY_REDIRECT_URI</span>}</p>
        <p className="text-sm text-muted">Connections stored: {conns.n}. Spotify dev mode allows 25 users and each must be added by the exact email of their Spotify account.</p>
        <h3 className="text-sm font-semibold">Last {refused.length} refused attempts</h3>
        {refused.length === 0 ? <p className="text-sm text-muted">None.</p> : (
          <ul className="space-y-1 text-xs text-muted">
            {refused.map((r, i) => <li key={i}>{r.at?.toISOString().slice(0, 16).replace("T", " ")} · {JSON.stringify((r.errors as unknown[])[0]).slice(0, 220)}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function Setup({ searchParams }: { searchParams: Promise<{ spotify?: string }> }) {
  return (
    <main className="min-h-screen">
      <Suspense fallback={<div className="mx-auto h-40 w-full max-w-xl animate-pulse px-4 py-12" />}>
        <Loaded searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
