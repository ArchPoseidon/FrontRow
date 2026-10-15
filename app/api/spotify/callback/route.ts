import { after } from "next/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { schema } from "@/lib/db";
import { finishRun, startRun } from "@/lib/collectors/shared";
import { requireUser } from "@/lib/session";
import { exchangeCode, getMe, SpotifyError } from "@/lib/identity/spotify";
import { importFromSpotify } from "@/lib/identity/spotify-import";
import { enrichArtists } from "@/lib/identity/artists";
import { startBackgroundScan } from "@/lib/brain/scan";

export const maxDuration = 60;

export async function GET(req: Request) {
  const base = process.env.APP_URL ?? new URL(req.url).origin;
  const ctx = await requireUser();
  if (!ctx) return NextResponse.redirect(new URL("/", base));

  const jar = await cookies();
  const saved = (() => {
    try {
      return JSON.parse(jar.get("sp_state")?.value ?? "") as { state: string; next: "/setup" | "/onboarding" };
    } catch {
      return null;
    }
  })();
  jar.delete("sp_state");
  const url = new URL(req.url);
  const back = (flag: string, extra = "") => NextResponse.redirect(new URL(`${saved?.next ?? "/onboarding"}?spotify=${flag}${extra}`, base));

  if (!saved || saved.state !== url.searchParams.get("state")) return back("error");
  if (url.searchParams.get("error")) return back("denied");
  const code = url.searchParams.get("code");
  if (!code) return back("error");

  let mySpotifyId = "";
  let myName = "";
  try {
    const t = await exchangeCode(code);
    // Dev-mode apps only allow allowlisted users; /me fails with 403 for anyone else.
    const me = await getMe(t.access_token);
    mySpotifyId = me.id;
    myName = me.display_name ?? me.id;
    const values = {
      userId: ctx.user.id,
      spotifyUserId: me.id,
      displayName: me.display_name ?? me.id,
      refreshToken: t.refresh_token ?? null,
      accessToken: t.access_token,
      expiresAt: new Date(Date.now() + t.expires_in * 1000),
      broken: false,
    };
    await ctx.db.insert(schema.spotifyConnections).values(values).onConflictDoUpdate({ target: schema.spotifyConnections.userId, set: values });
  } catch (e) {
    // Keep a trace: a refused connection (usually an account that is not on the Spotify app's user list) shows in the daily heartbeat.
    const status = e instanceof SpotifyError ? e.status : 0;
    const run = await startRun(ctx.db, "spotify-connect").catch(() => null);
    if (run) await finishRun(ctx.db, run, { errors: [`Spotify refused the connection (${status}) for ${ctx.user.email}`] }).catch(() => {});
    return back(e instanceof SpotifyError && e.status === 403 ? "invite_only" : "error");
  }

  if (saved.next === "/setup") return back("connected");
  const r = await importFromSpotify(ctx.db, ctx.user.id);
  if (!r.ok) return back(r.reason === "forbidden" ? "invite_only" : "error");
  // Import done: start the first scan now, so shows and Telegram alerts are already arriving as onboarding continues.
  after(async () => {
    await startBackgroundScan(ctx.db, ctx.user.id).catch((e) => console.error("background scan", e));
    await enrichArtists(ctx.db, r.newArtistIds);
  });
  // Say so when this Spotify account already belongs to another FrontRow account (the usual sign of a shared browser).
  const [other] = await ctx.db.select({ u: schema.spotifyConnections.userId }).from(schema.spotifyConnections).where(and(eq(schema.spotifyConnections.spotifyUserId, mySpotifyId), ne(schema.spotifyConnections.userId, ctx.user.id))).limit(1);
  return back("imported", `&f=${r.followed}&t=${r.top}&as=${encodeURIComponent(myName)}${other ? "&shared=1" : ""}`);
}
