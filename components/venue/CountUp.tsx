"use client";
// Number that ticks up like a turnstile counter when it scrolls into view.
// Writes textContent directly; no React state per frame.
import { useEffect, useRef } from "react";
import { easeOutCubic } from "@/lib/venue/math";

export function CountUp({ to, duration = 1600, className = "" }: { to: number; duration?: number; className?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const width = String(to).length;
    const fmt = (n: number) => String(Math.round(n)).padStart(width, "0");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.textContent = fmt(to);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        let last = -1;
        const tick = (t: number) => {
          const p = Math.min(1, (t - start) / duration);
          // Stepped like a mechanical counter: whole numbers only.
          const v = Math.round(easeOutCubic(p) * to);
          if (v !== last) {
            node.textContent = fmt(v);
            last = v;
          }
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    io.observe(node);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, duration]);
  return (
    <span ref={el} className={`tabular-nums ${className}`} aria-label={String(to)}>
      {String(0).padStart(String(to).length, "0")}
    </span>
  );
}
