import { eq } from "drizzle-orm";
import { artistCandidates, getDb } from "@/lib/db";
import { normalizeName } from "@/lib/util/names";
import { enrichArtist, linkArtist, upsertNameOnlyArtist, upsertSpotifyArtist } from "./store";
import { getArtist, searchArtists, spotifyIdFromLink, type SpotifyArtist } from "./spotify";

export type AddResult =
  | { kind: "added"; artistId: string; name: string }
  | { kind: "inactive"; name: string }
  | { kind: "choose"; candidateId: string; input: string; options: SpotifyArtist[] }
  | { kind: "name_only"; artistId: string; name: string };

/** Add one resolved Spotify artist for a user, enriching first so deceased artists never get linked. */
export async function addSpotifyArtist(userId: string, a: SpotifyArtist, via: string, priority = "follow"): Promise<AddResult> {
  const id = await upsertSpotifyArtist(a);
  const { hidden } = await enrichArtist(id);
  if (hidden) return { kind: "inactive", name: a.name };
  await linkArtist(userId, id, via, priority);
  return { kind: "added", artistId: id, name: a.name };
}

/** Resolve free text: exactly one exact match is auto-accepted; otherwise ask; nothing found => name only. */
export async function resolveText(userId: string, text: string, via: string): Promise<AddResult> {
  const input = text.trim();
  const linkId = spotifyIdFromLink(input);
  if (linkId) {
    const a = await getArtist(linkId);
    if (a) return addSpotifyArtist(userId, a, "spotify_link");
  }
  const norm = normalizeName(input);
  const results = await searchArtists(input, 10);
  const exact = results.filter((r) => normalizeName(r.name) === norm);
  if (exact.length === 1) return addSpotifyArtist(userId, exact[0], via);
  if (exact.length > 1 || results.length > 0) {
    const options = (exact.length > 1 ? exact : results).slice(0, 5);
    const [row] = await getDb()
      .insert(artistCandidates)
      .values({ userId, inputText: input, candidates: options })
      .returning({ id: artistCandidates.id });
    return { kind: "choose", candidateId: row.id, input, options };
  }
  const id = await upsertNameOnlyArtist(input);
  await linkArtist(userId, id, via);
  return { kind: "name_only", artistId: id, name: input };
}

export async function closeCandidate(candidateId: string, status: "resolved" | "removed") {
  await getDb().update(artistCandidates).set({ status }).where(eq(artistCandidates.id, candidateId));
}
