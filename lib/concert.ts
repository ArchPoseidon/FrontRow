// Real concert photos (free-licence), dimmed in CSS. Files live in /public/concert; a missing file just shows the dark overlay.
export const CONCERT_IMAGES = ["/concert/hero.jpg", "/concert/crowd.jpg", "/concert/lights.jpg"];

export function concertFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CONCERT_IMAGES[h % CONCERT_IMAGES.length];
}
