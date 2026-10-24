"use client";

import { EventCard } from "@/components/event-card/EventCard";
import { ToastView, useEventActions } from "@/components/event-card/useEventActions";
import type { EventView } from "@/components/event-card/types";

export function ArtistShows({ events: initial, returnTo }: { events: EventView[]; returnTo: string }) {
  const { events, mark, toggleCalendar, toast, clearToast } = useEventActions(initial, { returnTo });
  if (!events.length) return <p className="rounded-card border border-dashed border-surface-border p-6 text-sm text-muted">No India shows announced yet. We check every few minutes and will alert you the moment one appears.</p>;
  return (
    <>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {events.map((e) => (
          <li key={e.id}>
            <EventCard ev={e} onMark={mark} onCalendar={toggleCalendar} auto />
          </li>
        ))}
      </ul>
      <ToastView toast={toast} onClose={clearToast} />
    </>
  );
}
