import { after } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb, runs, spotifyConnections } from "@/lib/db";
import { track } from "@/lib/activity";
import { importForUser } from "@/lib/identity/spotify";
import { enrichMany, linkArtist, unenrichedIds, upsertSpotifyArtist } from "@/lib/identity/store";
import { verifyPayload } from "@/lib/util/sign";

export const maxDuration = 60;

async function logStep(errors: unknown[], itemsIn = 0) {
  try { await getDb().insert(runs).values({ job: "spotify-connect", itemsIn, finishedAt: new Date(), errors }); } catch {}
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (code: string) => NextResponse.redirect(new URL(`/onboarding?spotify=${code}`, url.origin));
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(new URL("/", url.origin));
  const userId = session.user.id;

  if (url.searchParams.get("error")) {
    await logStep([{ step: "authorize", status: 0, body: url.searchParams.get("error") }]);
    return back("denied");
  }
  const state = url.searchParams.get("state") ?? "";
  const payload = verifyPayload(state);
  const [pid, exp] = (payload ?? "").split(".");
  if (!payload || pid !== userId || Number(exp) < Date.now()) return back("expired");
  const code = url.searchParams.get("code");
  if (!code) return back("expired");

  const basic = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
  let tok: Response;
  try {
    tok = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: process.env.SPOTIFY_REDIRECT_URI! }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    await logStep([{ step: "token", status: 0, body: "timeout" }]);
    return back("slow");
  }
  if (!tok.ok) {
    await logStep([{ step: "token", status: tok.status, body: (await tok.text()).slice(0, 300) }]);
    return back(tok.status >= 500 ? "slow" : "error");
  }
  const t = await tok.json();
  const me = await fetch("https://api.spotify.com/v1/me", { headers: { Authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!me || !me.ok) {
    const status = me?.status ?? 0;
    await logStep([{ step: "me", status, body: me ? (await me.text()).slice(0, 300) : "timeout" }]);
    after(() => track("spotify_connect_fail", userId, { status }));
    return back(status === 403 ? "forbidden" : status >= 500 || !status ? "slow" : "error");
  }
  const profile = await me.json();
  const values = {
    userId,
    spotifyUserId: profile.id as string,
    displayName: (profile.display_name ?? profile.id) as string,
    refreshToken: t.refresh_token as string,
    accessToken: t.access_token as string,
    expiresAt: new Date(Date.now() + t.expires_in * 1000),
    broken: false,
  };
  await getDb().insert(spotifyConnections).values(values).onConflictDoUpdate({ target: spotifyConnections.userId, set: values });

  const imp = await importForUser(userId);
  if (imp.errors.length) await logStep(imp.errors);
  const ids: string[] = [];
  for (const a of imp.artists) {
    const id = await upsertSpotifyArtist(a);
    await linkArtist(userId, id, a.via);
    ids.push(id);
  }
  await logStep([], imp.artists.length);
  // Deceased/disbanded artists are hidden by every query; MusicBrainz checks finish in the background.
  after(async () => {
    await enrichMany(await unenrichedIds(ids), 40_000);
    await track("spotify_connect_ok", userId, { artists: imp.artists.length });
  });
  return NextResponse.redirect(new URL(`/onboarding?spotify=ok&n=${imp.artists.length}&f=${imp.followed}&t=${imp.top}`, url.origin));
}
