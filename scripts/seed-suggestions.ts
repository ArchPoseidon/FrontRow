import { config } from "dotenv";
config({ path: ".env.local" });

const NAMES = [
  "Prateek Kuhad", "Anuv Jain", "Arijit Singh", "Diljit Dosanjh", "AP Dhillon", "Karan Aujla", "Badshah", "Divine",
  "When Chai Met Toast", "Peter Cat Recording Co.", "Lifafa", "Parvaaz", "Indian Ocean", "Raftaar", "King", "Sunidhi Chauhan",
  "Coldplay", "Ed Sheeran", "The Weeknd", "Linkin Park", "Imagine Dragons", "Dua Lipa", "Martin Garrix", "Metallica",
];

async function main() {
  const { searchArtists } = await import("../lib/identity/spotify");
  const { upsertSpotifyArtist, enrichArtist } = await import("../lib/identity/store");
  const { getDb, appSettings } = await import("../lib/db");
  const { normalizeName } = await import("../lib/util/names");
  const ids: string[] = [];
  for (const n of NAMES) {
    const r = (await searchArtists(n, 5)).find((x) => normalizeName(x.name) === normalizeName(n));
    if (!r) { console.log("skip (no exact match)", n); continue; }
    const id = await upsertSpotifyArtist(r);
    const { hidden } = await enrichArtist(id);
    console.log(hidden ? "HIDDEN" : "ok    ", n);
    if (!hidden) ids.push(id);
  }
  await getDb().insert(appSettings).values({ key: "suggested_artist_ids", value: JSON.stringify(ids) })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: JSON.stringify(ids), updatedAt: new Date() } });
  console.log("suggested:", ids.length);
}
main().then(() => process.exit(0));
