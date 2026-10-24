import { eq } from "drizzle-orm";
import { getDb, spotifyConnections } from "@/lib/db";

export type SpotifyArtist = { id: string; name: string; image: string | null; genres: string[] };

type RawArtist = { id: string; name: string; images?: { url: string; width: number }[]; genres?: string[] };
const toArtist = (a: RawArtist): SpotifyArtist => ({
  id: a.id,
  name: a.name,
  image: a.images?.[1]?.url ?? a.images?.[0]?.url ?? null,
  genres: a.genres ?? [],
});

const basic = () =>
  Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64");

let appTok: { token: string; exp: number } | null = null;

/** Client-credentials token: search and lookup never depend on a user's connection. */
export async function appToken(): Promise<string> {
  if (appTok && appTok.exp > Date.now() + 30_000) return appTok.token;
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic()}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`spotify app token ${r.status}`);
  const j = await r.json();
  appTok = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return appTok.token;
}

async function api<T>(path: string, token: string): Promise<{ status: number; body: T | null; text?: string }> {
  const ctrl = AbortSignal.timeout(8000);
  const r = await fetch(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl });
  if (!r.ok) return { status: r.status, body: null, text: (await r.text()).slice(0, 300) };
  return { status: r.status, body: (await r.json()) as T };
}

export async function searchArtists(q: string, limit = 8): Promise<SpotifyArtist[]> {
  const t = await appToken();
  const r = await api<{ artists: { items: RawArtist[] } }>(`/search?type=artist&limit=${limit}&q=${encodeURIComponent(q)}`, t);
  return (r.body?.artists.items ?? []).map(toArtist);
}

export async function getArtist(id: string): Promise<SpotifyArtist | null> {
  const t = await appToken();
  const r = await api<RawArtist>(`/artists/${id}`, t);
  return r.body ? toArtist(r.body) : null;
}

export function spotifyIdFromLink(s: string): string | null {
  const m = s.match(/artist\/([A-Za-z0-9]{22})/) ?? s.match(/spotify:artist:([A-Za-z0-9]{22})/);
  return m?.[1] ?? null;
}

/* ---- per-user connection ---- */

export async function userToken(userId: string): Promise<string | null> {
  const db = getDb();
  const [c] = await db.select().from(spotifyConnections).where(eq(spotifyConnections.userId, userId));
  if (!c || c.broken || !c.refreshToken) return null;
  if (c.accessToken && c.expiresAt && c.expiresAt.getTime() > Date.now() + 30_000) return c.accessToken;
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic()}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: c.refreshToken }),
  });
  if (!r.ok) {
    if (r.status === 400 || r.status === 401) await db.update(spotifyConnections).set({ broken: true }).where(eq(spotifyConnections.userId, userId));
    return null;
  }
  const j = await r.json();
  await db
    .update(spotifyConnections)
    .set({ accessToken: j.access_token, expiresAt: new Date(Date.now() + j.expires_in * 1000), refreshToken: j.refresh_token ?? c.refreshToken })
    .where(eq(spotifyConnections.userId, userId));
  return j.access_token;
}

export type ImportedArtist = SpotifyArtist & { via: "spotify_followed" | "spotify_top" };

/** Followed + top (long, medium, short), merged, up to 100 distinct. */
export async function importForUser(userId: string): Promise<{ artists: ImportedArtist[]; followed: number; top: number; errors: { step: string; status: number; body?: string }[] }> {
  const token = await userToken(userId);
  const errors: { step: string; status: number; body?: string }[] = [];
  if (!token) return { artists: [], followed: 0, top: 0, errors: [{ step: "token", status: 0 }] };
  const seen = new Map<string, ImportedArtist>();
  let followed = 0;
  let after = "";
  for (let i = 0; i < 4; i++) {
    const r = await api<{ artists: { items: RawArtist[]; cursors?: { after?: string } } }>(`/me/following?type=artist&limit=50${after ? `&after=${after}` : ""}`, token);
    if (!r.body) { errors.push({ step: "following", status: r.status, body: r.text }); break; }
    for (const a of r.body.artists.items) if (!seen.has(a.id)) { seen.set(a.id, { ...toArtist(a), via: "spotify_followed" }); followed++; }
    after = r.body.artists.cursors?.after ?? "";
    if (!after) break;
  }
  let top = 0;
  const ranges = await Promise.all(
    ["long_term", "medium_term", "short_term"].map((range) => api<{ items: RawArtist[] }>(`/me/top/artists?time_range=${range}&limit=50`, token).then((r) => ({ range, r }))),
  );
  for (const { range, r } of ranges) {
    if (!r.body) { errors.push({ step: `top_${range}`, status: r.status, body: r.text }); continue; }
    for (const a of r.body.items) if (!seen.has(a.id)) { seen.set(a.id, { ...toArtist(a), via: "spotify_top" }); top++; }
  }
  return { artists: [...seen.values()].slice(0, 100), followed, top, errors };
}
