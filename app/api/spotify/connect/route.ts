import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { signPayload } from "@/lib/util/sign";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(new URL("/", req.url));
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI!;
  // Signed state (user id + expiry) also goes in the URL, so it works without the cookie.
  const state = signPayload(`${session.user.id}.${Date.now() + 10 * 60_000}`);
  const next = new URL(req.url).searchParams.get("next");
  if (next && ["connections", "setup", "onboarding"].includes(next)) (await cookies()).set("sp_next", next, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  (await cookies()).set("sp_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  const url = new URL("https://accounts.spotify.com/authorize");
  url.search = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "user-follow-read user-top-read",
    state,
    show_dialog: "true",
  }).toString();
  return NextResponse.redirect(url);
}
