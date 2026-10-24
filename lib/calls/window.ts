// Quiet hours: reminder calls only between 09:00 and 21:00 IST. IST is a fixed UTC+5:30 (no DST).
const IST_OFFSET_MS = 5.5 * 3600_000;
const DAY_MS = 24 * 3600_000;
export const WINDOW_START_H = 9;
export const WINDOW_END_H = 21;

const istMinutesOfDay = (d: Date) => ((((d.getTime() + IST_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS) / 60_000;

export function inCallWindow(d: Date): boolean {
  const m = istMinutesOfDay(d);
  return m >= WINDOW_START_H * 60 && m <= WINDOW_END_H * 60; // 21:00 sharp is the last allowed instant
}

/**
 * Move `d` to the nearest instant inside 09:00-21:00 IST. A call after go-live is useless, so when the
 * nearest edge would land after `goLive` the earlier edge (the previous evening, 21:00) is used instead.
 */
export function clampToCallWindow(d: Date, goLive?: Date | null): Date {
  if (inCallWindow(d)) return d;
  const m = istMinutesOfDay(d);
  const dayStart = d.getTime() - m * 60_000; // IST midnight of d's IST day, as UTC instant
  const at = (dayOffset: number, hour: number) => new Date(dayStart + dayOffset * DAY_MS + hour * 3600_000);
  const [earlier, later] = m < WINDOW_START_H * 60 ? [at(-1, WINDOW_END_H), at(0, WINDOW_START_H)] : [at(0, WINDOW_END_H), at(1, WINDOW_START_H)];
  const nearer = later.getTime() - d.getTime() < d.getTime() - earlier.getTime() ? later : earlier;
  return goLive && nearer.getTime() > goLive.getTime() ? earlier : nearer;
}
