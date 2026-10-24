import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const basic = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const t = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  console.log("spotify token", t.status);
  const { access_token } = await t.json();
  for (const q of ["Prateek Kuhad", "Michael Jackson", "Linkin Park"]) {
    const r = await fetch(`https://api.spotify.com/v1/search?type=artist&limit=5&q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${access_token}` } });
    const j = await r.json();
    console.log("search", q, r.status, (j.artists?.items ?? []).map((a: { name: string; id: string; images: unknown[] }) => `${a.name}(${a.images?.length})`).join(", ") || JSON.stringify(j).slice(0, 150));
  }
  const ua = process.env.MUSICBRAINZ_USER_AGENT!;
  for (const q of ["Michael Jackson", "Linkin Park", "Prateek Kuhad"]) {
    const r = await fetch(`https://musicbrainz.org/ws/2/artist?query=artist:${encodeURIComponent('"' + q + '"')}&fmt=json&limit=3`, { headers: { "User-Agent": ua } });
    const j = await r.json();
    console.log("mb", q, r.status, (j.artists ?? []).map((a: { name: string; score: number; type: string; country: string; "life-span"?: { ended: boolean | null } }) => `${a.name}|${a.score}|${a.type}|${a.country}|ended=${a["life-span"]?.ended}`).join(" ; "));
    await new Promise((r) => setTimeout(r, 1100));
  }
}
main();
