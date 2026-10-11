import { Suspense } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth, signOut } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { getAlertHistory, getArtistViews } from "@/lib/data/radar";
import { AppHeader } from "@/components/AppHeader";
import { ProfileArtists } from "@/components/profile/ProfileArtists";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { ConnectSpotifyButton } from "@/components/spotify/ConnectSpotify";
import { SpotifyMark } from "@/components/spotify/SpotifyMark";
import Link from "next/link";

const ago = (d: Date | null) => {
  if (!d) return "";
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  return m < 60 ? `${Math.max(m, 1)} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

async function Loaded() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const db = getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, session.user.id));
  if (!u) redirect("/");
  const [artists, history, [sp], [acct]] = await Promise.all([
    getArtistViews(db, u.id),
    getAlertHistory(db, u.id, 10),
    db.select({ broken: schema.spotifyConnections.broken }).from(schema.spotifyConnections).where(eq(schema.spotifyConnections.userId, u.id)),
    db.select({ scope: schema.accounts.scope }).from(schema.accounts).where(eq(schema.accounts.userId, u.id)),
  ]);
  const gcal = !!acct?.scope?.includes("calendar");
  const card = "space-y-3 rounded-card border border-surface-border bg-surface p-4";
  return (
    <>
      <AppHeader isOwner={!!u.isOwner} name={u.name} image={u.image} />
      <section className="concert-bg" style={{ ["--concert-img" as string]: "url(/concert/hero.jpg)" }}>
        <div className="mx-auto flex w-full max-w-3xl items-center gap-4 px-4 py-8">
          {u.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={u.image} alt="" width={72} height={72} className="rounded-full border-2 border-accent" referrerPolicy="no-referrer" />
          ) : (
            <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-accent font-display text-3xl font-black text-accent-foreground">{(u.name ?? "?")[0]}</span>
          )}
          <div className="min-w-0">
            <h1 className="font-display truncate text-5xl leading-none font-black">{u.name}</h1>
            <p className="truncate text-sm text-muted">{u.email} · {artists.length} artists · {u.homeCity ?? "Bengaluru"}</p>
          </div>
        </div>
      </section>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-6 pb-28 sm:pb-12">
        <section className={card} aria-labelledby="my-artists">
          <h2 id="my-artists" className="font-display text-3xl font-extrabold">Your artists</h2>
          <ProfileArtists artists={artists} />
        </section>

        <section className={card} aria-labelledby="spotify">
          <h2 id="spotify" className="font-display text-3xl font-extrabold">Spotify</h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <SpotifyMark size={32} />
              <div>
                <p className="font-medium">{sp ? (sp.broken ? "Connection needs refreshing" : "Connected") : "Not connected"}</p>
                <p className="text-sm text-muted">Import who you follow and listen to.</p>
              </div>
            </div>
            <ConnectSpotifyButton className="rounded-card border border-surface-border px-4 py-2 text-sm font-bold">{sp ? "Re-import" : "Connect Spotify"}</ConnectSpotifyButton>
          </div>
        </section>

        <section className={card} aria-labelledby="gcal">
          <h2 id="gcal" className="font-display text-3xl font-extrabold">Google Calendar</h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{gcal ? "Connected" : "Not connected"}</p>
              <p className="text-sm text-muted">{gcal ? "Tap Add to calendar on any show and it lands in your Google Calendar." : "Connect once and Add to calendar puts shows straight into Google Calendar. We can only add events, nothing else."}</p>
            </div>
            <a href="/api/gcal/connect?return=/profile" className="rounded-card border border-surface-border px-4 py-2 text-sm font-bold">{gcal ? "Reconnect" : "Connect Google Calendar"}</a>
          </div>
        </section>

        <SettingsForm isOwner={!!u.isOwner} embedded />

        <section className={card} aria-labelledby="history">
          <h2 id="history" className="font-display text-3xl font-extrabold">Alert history</h2>
          {history.length === 0 ? (
            <p className="text-sm text-muted">No alerts sent yet. They&apos;ll show up here with the channel, time and what you did.</p>
          ) : (
            <ul className="divide-y divide-surface-border text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <span className="font-bold">{h.artistName}</span>
                  <span className="text-muted">{h.city ?? ""}</span>
                  <span className="rounded-full border border-surface-border px-2 text-xs capitalize">{h.channel}{h.kind === "test" ? " · test" : ""}</span>
                  <span className="ml-auto text-xs text-muted">{h.action === "bought" || h.action === "going" ? "Going · " : h.action === "dismissed" ? "Not for me · " : ""}{ago(h.sentAt ? new Date(h.sentAt) : null)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {u.isOwner && <Link href="/setup" className="text-sm text-muted underline underline-offset-2">Owner setup</Link>}

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button className="w-full rounded-card border border-urgency-red/60 py-3 font-bold text-urgency-red">Log out</button>
        </form>
      </main>
    </>
  );
}

export default function Profile() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-3xl px-4 py-6"><div className="h-72 animate-pulse rounded-card bg-surface-border" /></main>}>
      <Loaded />
    </Suspense>
  );
}
