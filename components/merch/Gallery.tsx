"use client";

import { useState } from "react";
import { Placeholder } from "./ProductCard";

export function Gallery({ images, name }: { images: string[]; name: string }) {
  const [i, setI] = useState(0);
  return (
    <div>
      <div className="overflow-hidden rounded-2xl ring-1 ring-white/10">
        {images[i] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={images[i]} alt={name} className="aspect-square w-full object-cover" />
        ) : (
          <Placeholder name={name} />
        )}
      </div>
      {images.length > 1 && (
        <div className="mt-2 flex gap-2">
          {images.map((src, n) => (
            <button key={src} onClick={() => setI(n)} aria-label={`Image ${n + 1}`} aria-current={n === i} className={`size-16 overflow-hidden rounded-lg ring-1 ${n === i ? "ring-2 ring-[var(--magenta)]" : "ring-white/10"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
