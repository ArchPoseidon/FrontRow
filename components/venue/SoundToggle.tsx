"use client";
import { toggleSound, useSound } from "@/lib/venue/audio";

export function SoundToggle() {
  const on = useSound();
  return (
    <button
      type="button"
      onClick={() => void toggleSound()}
      aria-pressed={on}
      className="label fixed bottom-20 left-4 z-40 flex items-center gap-2 rounded-full bg-house/70 px-3 py-2.5 text-smoke sm:px-3.5 sm:py-2 ring-1 ring-white/10 backdrop-blur-md transition hover:ring-white/25 md:bottom-5 md:left-5"
    >
      <span aria-hidden className="flex h-3 items-end gap-[2px]">
        {[0.5, 1, 0.7].map((h, i) => (
          <span
            key={i}
            className={`w-[3px] rounded-sm ${on ? "bg-stage" : "bg-dim"}`}
            style={{ height: `${on ? h * 100 : 30}%`, transform: on ? `scaleY(calc(0.6 + var(--beat) * ${0.4 + i * 0.2}))` : undefined, transformOrigin: "bottom" }}
          />
        ))}
      </span>
      <span className="hidden sm:inline">{on ? "Sound on" : "🔊 Sound on"}</span>
      <span className="sr-only sm:hidden">Sound</span>
      <span className="sr-only">{on ? "(playing — press to mute)" : "(muted — press to play venue sound)"}</span>
    </button>
  );
}
