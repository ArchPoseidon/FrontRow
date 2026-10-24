"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/radar", label: "Radar", d: "M12 4a8 8 0 100 16 8 8 0 000-16zm0 8l5-3" },
  { href: "/shows", label: "My shows", d: "M5 8h14v3a2 2 0 000 4v3H5v-3a2 2 0 000-4z" },
  { href: "/calendar", label: "Calendar", d: "M4 6h16v14H4zM4 11h16M9 4v4M15 4v4" },
  { href: "/artists", label: "Artists", d: "M9 11a3 3 0 100-6 3 3 0 000 6zM3 19c.6-3.2 3-4.5 6-4.5s5.4 1.3 6 4.5M17 8a2.5 2.5 0 010 5M18 15c1.8.4 2.8 1.6 3 3.5" },
  { href: "/merch", label: "Merch", d: "M8 4l-5 3 2 4 2-1v9h10v-9l2 1 2-4-5-3a4 4 0 01-8 0z" },
  { href: "/profile", label: "Profile", d: "M12 6a3.5 3.5 0 110 7 3.5 3.5 0 010-7zM5 20c1-4 4-5 7-5s6 1 7 5" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function useOn() {
  const path = usePathname();
  return (h: string) => path === h || path.startsWith(`${h}/`) || (h === "/radar" && path.startsWith("/event")) || (h === "/profile" && path.startsWith("/connections")) || (h === "/merch" && path.startsWith("/cart"));
}

// Inline links on wider screens.
export function DesktopNav() {
  const on = useOn();
  return (
      <nav aria-label="Main" className="hidden items-center gap-5 sm:flex">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} aria-current={on(t.href) ? "page" : undefined} className={`font-display text-2xl leading-none font-extrabold tracking-wide uppercase ${on(t.href) ? "text-magenta" : "text-muted hover:text-foreground"}`}>
            {t.label}
          </Link>
        ))}
      </nav>
  );
}

// Bottom tab bar on phones. Rendered outside the sticky header (a blurred ancestor would break `fixed`).
export function BottomBar() {
  const on = useOn();
  return (
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-surface-border bg-background/95 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} aria-current={on(t.href) ? "page" : undefined} className={`font-display flex flex-col items-center gap-1 px-1 text-base leading-none font-extrabold tracking-wide uppercase ${on(t.href) ? "text-magenta" : "text-muted"}`}>
            <Icon d={t.d} />
            {t.label}
          </Link>
        ))}
      </nav>
      );
}
