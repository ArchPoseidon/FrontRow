import { gte, sql } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";

export type Scraped = { ok: boolean; markdown: string; title: string | null; statusCode: number | null; finalUrl: string | null; via: "firecrawl" | "jina"; error?: string };

export const dailyCap = () => Number(process.env.FIRECRAWL_DAILY_CAP ?? 60);

// Credits used in the last 24h, from the runs table (each run logs what it spent).
export async function creditsUsedToday(db: Db): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [r] = await db.select({ n: sql<number>`coalesce(sum(${schema.runs.firecrawlCredits}), 0)::int` }).from(schema.runs).where(gte(schema.runs.startedAt, since));
  return r.n;
}

// Firecrawl scrape to markdown. One credit per call; the caller counts them.
// The plan allows about 19 requests a minute: space calls out, and honour Retry-After on a 429.
let nextSlot = 0;
const SPACING_MS = 3500;
async function slot() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + SPACING_MS;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

export async function firecrawlScrape(url: string, attempt = 0): Promise<Scraped> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return { ok: false, markdown: "", title: null, statusCode: null, finalUrl: null, via: "firecrawl", error: "no Firecrawl key" };
  try {
    await slot();
    const r = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: false, timeout: 30000 }),
      signal: AbortSignal.timeout(40_000),
    });
    if (r.status === 429 && attempt < 1) {
      const wait = Math.min(Number(r.headers.get("retry-after") ?? 20) || 20, 25);
      nextSlot = Date.now() + wait * 1000;
      return firecrawlScrape(url, attempt + 1);
    }
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string; data?: { markdown?: string; metadata?: { title?: string; statusCode?: number; sourceURL?: string; url?: string } } };
    if (!r.ok || !j.success) return { ok: false, markdown: "", title: null, statusCode: r.status, finalUrl: null, via: "firecrawl", error: j.error ?? `Firecrawl ${r.status}` };
    const m = j.data?.metadata;
    return { ok: true, markdown: j.data?.markdown ?? "", title: m?.title ?? null, statusCode: m?.statusCode ?? 200, finalUrl: m?.url ?? m?.sourceURL ?? url, via: "firecrawl" };
  } catch (e) {
    return { ok: false, markdown: "", title: null, statusCode: null, finalUrl: null, via: "firecrawl", error: e instanceof Error ? e.message.slice(0, 120) : "Firecrawl failed" };
  }
}

// Free fallback when Firecrawl errors or credits run out.
export async function jinaScrape(url: string): Promise<Scraped> {
  try {
    const r = await fetch(`https://r.jina.ai/${url}`, { signal: AbortSignal.timeout(30_000), headers: { Accept: "text/plain" } });
    const text = await r.text();
    const title = /^Title:\s*(.*)$/m.exec(text)?.[1]?.trim() ?? null;
    const blocked = /Just a moment|Attention Required|Performing security verification|Access denied/i.test(title ?? "") || /Warning: Target URL returned error (40[0-9]|5\d\d)/.test(text);
    return { ok: r.ok && !blocked, markdown: text, title, statusCode: blocked ? 403 : r.status, finalUrl: url, via: "jina", error: blocked ? "blocked by site" : undefined };
  } catch (e) {
    return { ok: false, markdown: "", title: null, statusCode: null, finalUrl: null, via: "jina", error: e instanceof Error ? e.message.slice(0, 120) : "Jina failed" };
  }
}
