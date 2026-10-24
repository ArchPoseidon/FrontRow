export function normalizeName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Aliases derived without AI: leading "the", "&"/"and". MusicBrainz adds real aliases later. */
export function derivedAliases(name: string): string[] {
  const out = new Set<string>();
  const n = normalizeName(name);
  if (n.startsWith("the ")) out.add(n.slice(4));
  else out.add("the " + n);
  if (/\band\b/.test(name.toLowerCase()) || name.includes("&")) {
    out.add(normalizeName(name.replace(/&/g, " and ")));
    out.add(normalizeName(name.replace(/\band\b/gi, " ")));
  }
  out.delete(n);
  return [...out].filter(Boolean);
}

/** JS port of pg_trgm similarity(). */
function trigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (const word of normalizeName(s).split(" ")) {
    if (!word) continue;
    const p = `  ${word} `;
    for (let i = 0; i < p.length - 2; i++) set.add(p.slice(i, i + 3));
  }
  return set;
}

export function similarity(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}
