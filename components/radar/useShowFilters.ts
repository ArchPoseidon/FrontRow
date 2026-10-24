"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { clientTrack } from "@/lib/data/track-client";

// Search text (debounced 150 ms) and the city chip (kept in the URL as ?city=mumbai so refresh and sharing keep it).
// `track` is off for the public demo (no session).
export function useShowFilters(page: string, track = true) {
  const sp = useSearchParams();
  const [city, setCityState] = useState<string | null>(() => sp.get("city"));
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const searched = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 150);
    return () => clearTimeout(t);
  }, [input]);

  // search_used: at most once per page visit.
  useEffect(() => {
    if (q && track && !searched.current) {
      searched.current = true;
      clientTrack("search_used", { page });
    }
  }, [q, track, page]);

  const setCity = useCallback(
    (slug: string | null) => {
      setCityState(slug);
      const u = new URL(window.location.href);
      if (slug) u.searchParams.set("city", slug);
      else u.searchParams.delete("city");
      window.history.replaceState(null, "", `${u.pathname}${u.search}${u.hash}`);
      if (slug && track) clientTrack("city_filter_used", { page, city: slug });
    },
    [track, page],
  );

  return { input, setInput, q, city, setCity };
}
