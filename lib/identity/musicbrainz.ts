import { normalizeName } from "@/lib/util/names";

export type MbInfo = {
  mbid: string;
  aliases: string[];
  origin: "india" | "international" | "unknown";
  deceased: boolean;
  inactiveReason: "deceased" | "disbanded" | null;
};

let last = 0;
let chain: Promise<unknown> = Promise.resolve();
/** MusicBrainz allows 1 request per second. */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = Math.max(0, last + 1100 - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try { return await fn(); } finally { last = Date.now(); }
  });
  chain = run.catch(() => undefined);
  return run as Promise<T>;
}

type MbArtist = {
  id: string; name: string; score: number; type?: string; country?: string;
  aliases?: { name: string }[];
  "life-span"?: { ended?: boolean | null };
};

/** Accept only a single perfect-score exact-name hit; otherwise null (stays name-only). */
export async function lookupArtist(name: string): Promise<MbInfo | null> {
  const ua = process.env.MUSICBRAINZ_USER_AGENT;
  if (!ua) return null;
  const j = await throttled(async () => {
    const r = await fetch(`https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(`artist:"${name.replace(/"/g, "")}"`)}&fmt=json&limit=5`, {
      headers: { "User-Agent": ua },
      signal: AbortSignal.timeout(8000),
    });
    return r.ok ? ((await r.json()) as { artists?: MbArtist[] }) : null;
  }).catch(() => null);
  if (!j?.artists) return null;
  const n = normalizeName(name);
  const exact = j.artists.filter((a) => a.score === 100 && normalizeName(a.name) === n);
  if (exact.length !== 1) return null;
  const a = exact[0];
  const ended = a["life-span"]?.ended === true;
  const inactiveReason = ended ? (a.type === "Person" ? "deceased" : a.type === "Group" ? "disbanded" : null) : null;
  return {
    mbid: a.id,
    aliases: [...new Set((a.aliases ?? []).map((x) => normalizeName(x.name)).filter((x) => x && x !== n))],
    origin: !a.country ? "unknown" : a.country === "IN" ? "india" : "international",
    deceased: inactiveReason === "deceased",
    inactiveReason,
  };
}
