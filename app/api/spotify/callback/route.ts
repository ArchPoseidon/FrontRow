import { after } from "next/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { schema } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { exchangeCode, getMe, SpotifyError } from "@/lib/identity/spotify";
import { importFromSpotify } from "@/lib/identity/spotify-import";
import { enrichArtists } from "@/lib/identity/artists";

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
  const back = (flag: string) => NextResponse.redirect(new URL(`${saved?.next ?? "/onboarding"}?spotify=${flag}`, base));

  if (!saved || saved.state !== url.searchParams.get("state")) return back("error");
  if (url.searchParams.get("error")) return back("denied");
  const code = url.searchParams.get("code");
  if (!code) return back("error");

  try {
    const t = await exchangeCode(code);
    // Dev-mode apps only allow allowlisted users; /me fails with 403 for anyone else.
    const me = await getMe(t.access_token);
    const values = {
      userId: ctx.user.id,
      spotifyUserId: me.id,
      refreshToken: t.refresh_token ?? null,
      accessToken: t.access_token,
      expiresAt: new Date(Date.now() + t.expires_in * 1000),
      broken: false,
    };
    await ctx.db.insert(schema.spotifyConnections).values(values).onConflictDoUpdate({ target: schema.spotifyConnections.userId, set: values });
  } catch (e) {
    return back(e instanceof SpotifyError && e.status === 403 ? "invite_only" : "error");
  }

  if (saved.next === "/setup") return back("connected");
  const r = await importFromSpotify(ctx.db, ctx.user.id);
  if (!r.ok) return back(r.reason === "forbidden" ? "invite_only" : "error");
  after(() => enrichArtists(ctx.db, r.newArtistIds));
  return back("imported");
}
