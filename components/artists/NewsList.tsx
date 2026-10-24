import type { NewsRow } from "@/lib/news/queries";
import { relativeTime } from "@/lib/news/time";

// Headline, publisher and age only. Links leave the app in a new tab. No summaries, no scraped text.
export function NewsList({ items }: { items: NewsRow[] }) {
  if (!items.length) return <p className="rounded-card border border-dashed border-surface-border p-6 text-sm text-muted">No recent news found for this artist.</p>;
  return (
    <ul className="flex flex-col divide-y divide-surface-border rounded-card border border-surface-border bg-surface/80 backdrop-blur">
      {items.map((n) => (
        <li key={n.id}>
          <a href={n.url} target="_blank" rel="noopener noreferrer" className="block p-3 hover:bg-white/5">
            <span className="block text-sm font-semibold">{n.title}</span>
            <span className="mt-1 block text-xs text-muted">{[n.publisher, relativeTime(n.publishedAt)].filter(Boolean).join(" · ")}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
