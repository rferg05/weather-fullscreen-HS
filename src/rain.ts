// Turning hourly forecasts into the two things the screen is for: when it
// will rain or snow (and how much), and when the temperature will swing sharply.

import type { Falling } from './openmeteo';

export interface WetHour {
  /** Epoch ms at the start of the hour. */
  t: number;
  /** Chance of precipitation, 0-100. */
  prob: number;
  /** Liquid rain in the hour (in or mm); null when the source has no amounts. */
  rain: number | null;
  /** Snow depth in the hour (in or cm); null when unknown. */
  snow: number | null;
  /** What falls, when the source says; otherwise read from the amounts. */
  falling?: Falling | null;
}

export interface RainEvent {
  /** Start of the first wet hour. */
  start: number;
  /** End of the last wet hour (exclusive). */
  end: number;
  /** Total rain over the event; null when the source has no amounts. */
  rain: number | null;
  /** Total snow depth; null when unknown. */
  snow: number | null;
  peakProb: number;
  /** The wettest hour's rain, for "light / moderate / heavy". */
  peakRate: number | null;
  /** The headline: the most hazardous thing that falls. `mix` is rain and
   *  snow in different hours; `sleet` is both at once. */
  kind: 'rain' | 'snow' | 'mix' | 'sleet' | 'freezing' | 'storm';
  /** Thunder anywhere in the spell. */
  thunder: boolean;
}

const HOUR = 3_600_000;

export interface RainOptions {
  /** A chance at or above this makes an hour wet on its own. */
  likely: number;
  /** An amount at or above this makes an hour wet when the chance is at least
   *  half of `likely` (a forecast amount with a middling chance is still
   *  worth planning around). */
  minAmount: number;
}

function isWet(h: WetHour, o: RainOptions): boolean {
  if (h.prob >= o.likely) return true;
  const amount = (h.rain ?? 0) + (h.snow ?? 0) * 0.1;
  return amount >= o.minAmount && h.prob >= o.likely / 2;
}

/** Consecutive wet hours grouped into events. A single dry hour inside a
 *  wet spell doesn't split it: nobody plans around a one-hour lull. */
export function rainEvents(hours: WetHour[], o: RainOptions): RainEvent[] {
  const sorted = [...hours].sort((a, b) => a.t - b.t);
  const events: RainEvent[] = [];
  let cur: RainEvent | null = null;
  for (const h of sorted) {
    if (!isWet(h, o)) continue;
    if (cur && h.t <= cur.end + HOUR) {
      cur.end = h.t + HOUR;
    } else {
      cur = { start: h.t, end: h.t + HOUR, rain: null, snow: null, peakProb: 0, peakRate: null, kind: 'rain', thunder: false };
      events.push(cur);
    }
  }
  // Totals cover every hour inside each event, the lull hours included.
  for (const e of events) {
    const seen = new Set<Falling>();
    for (const h of sorted) {
      if (h.t < e.start || h.t >= e.end) continue;
      if (h.falling) seen.add(h.falling);
      e.peakProb = Math.max(e.peakProb, h.prob);
      if (h.rain != null) {
        e.rain = (e.rain ?? 0) + h.rain;
        e.peakRate = Math.max(e.peakRate ?? 0, h.rain);
      }
      if (h.snow != null) e.snow = (e.snow ?? 0) + h.snow;
    }
    const snowy = (e.snow ?? 0) > 0 || seen.has('snow');
    const rainy = (e.rain ?? 0) >= o.minAmount || (e.rain == null && !seen.has('snow')) || seen.has('rain') || seen.has('storm');
    e.thunder = seen.has('storm');
    e.kind = seen.has('freezing') ? 'freezing'
      : seen.has('sleet') ? 'sleet'
      : snowy && !rainy ? 'snow'
      : snowy ? 'mix'
      : e.thunder ? 'storm'
      : 'rain';
  }
  return events;
}

/** "light", "moderate" or "heavy" from the wettest hour, in in/h or mm/h. */
export function intensity(peakRate: number | null, metric: boolean): string | null {
  if (peakRate == null) return null;
  const inches = metric ? peakRate / 25.4 : peakRate;
  if (inches < 0.1) return 'light';
  if (inches < 0.3) return 'moderate';
  return 'heavy';
}

export interface Swing {
  /** Index of the hour the swing starts from and the one it reaches. */
  from: number;
  to: number;
  /** Signed change in degrees. */
  delta: number;
}

/** Sharp temperature changes: at least `threshold` degrees within `windowH`
 *  hours. Swings don't overlap; each is taken at its largest extent. */
export function sharpSwings(temps: number[], threshold: number, windowH = 3): Swing[] {
  const out: Swing[] = [];
  let i = 0;
  while (i < temps.length - 1) {
    let best = -1;
    let bestDelta = 0;
    for (let j = i + 1; j <= Math.min(temps.length - 1, i + windowH); j++) {
      const d = temps[j] - temps[i];
      if (Math.abs(d) > Math.abs(bestDelta)) { bestDelta = d; best = j; }
    }
    if (best > 0 && Math.abs(bestDelta) >= threshold) {
      // Ride the swing while it keeps going the same way.
      let to = best;
      while (to + 1 < temps.length && Math.sign(temps[to + 1] - temps[to]) === Math.sign(bestDelta)) to++;
      out.push({ from: i, to, delta: temps[to] - temps[i] });
      i = to;
    } else {
      i++;
    }
  }
  return out;
}
