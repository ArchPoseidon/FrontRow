// Fire-and-forget client activity event (POST /api/track; needs a session, allow-listed types only). Never throws.
export function clientTrack(type: "search_used" | "city_filter_used" | "calendar_add", meta: Record<string, string> = {}) {
  try {
    void fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, meta }), keepalive: true }).catch(() => {});
  } catch {
    /* tracking must never break the UI */
  }
}
