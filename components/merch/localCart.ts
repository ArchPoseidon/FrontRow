"use client";

import { useSyncExternalStore } from "react";

export type LocalLine = { variantId: string; qty: number; productId: string; name: string; size: string | null; priceInr: number; image: string | null; artistName: string; stock: number };
const KEY = "fr_cart";
const EVT = "fr-cart-change";
let cache: { raw: string | null; val: LocalLine[] } = { raw: null, val: [] };
const EMPTY: LocalLine[] = [];

function read(): LocalLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === cache.raw) return cache.val;
    const parsed = raw ? (JSON.parse(raw) as LocalLine[]) : [];
    cache = { raw, val: Array.isArray(parsed) ? parsed : [] };
    return cache.val;
  } catch {
    return EMPTY;
  }
}
function write(lines: LocalLine[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* private mode: cart just won't persist */
  }
  window.dispatchEvent(new Event(EVT));
}
export function localAdd(line: Omit<LocalLine, "qty">, qty = 1) {
  const lines = [...read()];
  const i = lines.findIndex((l) => l.variantId === line.variantId);
  if (i >= 0) lines[i] = { ...lines[i], qty: Math.min(lines[i].qty + qty, Math.max(line.stock, 1), 10) };
  else lines.push({ ...line, qty });
  write(lines);
}
export function localSetQty(variantId: string, qty: number) {
  write(read().flatMap((l) => (l.variantId !== variantId ? [l] : qty <= 0 ? [] : [{ ...l, qty: Math.min(qty, Math.max(l.stock, 1), 10) }])));
}
export function useLocalCart(): LocalLine[] {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVT, cb);
      window.addEventListener("storage", cb);
      return () => { window.removeEventListener(EVT, cb); window.removeEventListener("storage", cb); };
    },
    read,
    () => EMPTY,
  );
}
