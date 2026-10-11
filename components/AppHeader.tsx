import Link from "next/link";
import { signOut } from "@/auth";

export function AppHeader({ isOwner, name, image }: { isOwner?: boolean; name?: string | null; image?: string | null }) {
  return (
    <header className="sticky top-0 z-20 border-b border-surface-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4">
        <Link href="/radar" className="text-sm font-semibold tracking-widest text-accent uppercase">FrontRow</Link>
        <nav className="flex flex-1 items-center gap-4 text-sm">
          <Link href="/radar" className="hover:underline">Radar</Link>
          <Link href="/onboarding" className="hover:underline">Artists</Link>
          <Link href="/settings" className="hover:underline">Settings</Link>
          {isOwner && <Link href="/setup" className="text-muted hover:underline">Setup</Link>}
        </nav>
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" width={28} height={28} className="rounded-full" referrerPolicy="no-referrer" />
        )}
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button className="text-sm text-muted hover:underline" aria-label={`Sign out ${name ?? ""}`}>Sign out</button>
        </form>
      </div>
    </header>
  );
}
