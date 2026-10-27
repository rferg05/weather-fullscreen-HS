import { describe, expect, it } from 'vitest';
import { intensity, rainEvents, sharpSwings } from './rain';
import type { WetHour } from './rain';
import { fallingFrom } from './openmeteo';
import type { Falling } from './openmeteo';

const H = 3_600_000;
const T0 = Date.parse('2026-10-23T12:00:00Z');
const opts = { likely: 40, minAmount: 0.01 };

function hours(spec: Array<[number, number | null, number?]>): WetHour[] {
  return spec.map(([prob, rain, snow], i) => ({ t: T0 + i * H, prob, rain, snow: snow ?? null }));
}

describe('rain events', () => {
  it('groups wet hours and totals their rain', () => {
    const ev = rainEvents(hours([[10, 0], [50, 0.05], [80, 0.2], [60, 0.1], [10, 0]]), opts);
    expect(ev).toHaveLength(1);
    expect(ev[0].start).toBe(T0 + H);
    expect(ev[0].end).toBe(T0 + 4 * H);
    expect(ev[0].rain).toBeCloseTo(0.35);
    expect(ev[0].peakProb).toBe(80);
    expect(ev[0].peakRate).toBeCloseTo(0.2);
    expect(ev[0].kind).toBe('rain');
  });

  it('bridges a one-hour lull but not a longer one', () => {
    expect(rainEvents(hours([[60, 0.1], [10, 0], [60, 0.1]]), opts)).toHaveLength(1);
    expect(rainEvents(hours([[60, 0.1], [10, 0], [10, 0], [60, 0.1]]), opts)).toHaveLength(2);
  });

  it('counts a forecast amount with a middling chance', () => {
    expect(rainEvents(hours([[25, 0.08]]), opts)).toHaveLength(1);
    expect(rainEvents(hours([[10, 0.08]]), opts)).toHaveLength(0);
  });

  it('works from chances alone when there are no amounts', () => {
    const ev = rainEvents(hours([[20, null], [55, null], [45, null]]), opts);
    expect(ev).toHaveLength(1);
    expect(ev[0].rain).toBeNull();
  });

  it('tells snow from rain', () => {
    expect(rainEvents(hours([[70, 0, 1.2], [70, 0, 0.8]]), opts)[0].kind).toBe('snow');
    expect(rainEvents(hours([[70, 0.1, 0.5]]), opts)[0].kind).toBe('mix');
  });

  it('names sleet, freezing rain and storms from what falls', () => {
    const kinds = (...f: Array<Falling | null>) => rainEvents(hours(f.map(() => [70, 0.1] as [number, number])).map((h, i) => ({ ...h, falling: f[i] })), opts)[0];
    expect(kinds('rain', 'sleet', 'snow').kind).toBe('sleet');
    expect(kinds('rain', 'freezing', 'sleet').kind).toBe('freezing');
    expect(kinds('rain', 'storm').kind).toBe('storm');
    expect(kinds('rain', 'storm').thunder).toBe(true);
    expect(kinds('rain', 'rain').thunder).toBe(false);
  });

  it('reads the kind from weather codes and amounts', () => {
    expect(fallingFrom(66, 0.1, 0)).toBe('freezing');
    expect(fallingFrom(95, 0.3, 0)).toBe('storm');
    expect(fallingFrom(73, 0, 0)).toBe('snow');
    expect(fallingFrom(61, 0.05, 0.2)).toBe('sleet');
    expect(fallingFrom(3, 0, 0)).toBeNull();
  });

  it('rates intensity from the wettest hour', () => {
    expect(intensity(0.04, false)).toBe('light');
    expect(intensity(0.2, false)).toBe('moderate');
    expect(intensity(10, true)).toBe('heavy');
    expect(intensity(null, false)).toBeNull();
  });
});

describe('sharp swings', () => {
  it('finds a drop and rides it to the bottom', () => {
    const s = sharpSwings([70, 69, 62, 57, 55, 55, 56], 10);
    expect(s).toEqual([{ from: 0, to: 4, delta: -15 }]);
  });

  it('ignores gentle changes', () => {
    expect(sharpSwings([60, 62, 64, 66, 68, 70], 10)).toEqual([]);
  });

  it('reports a rise after a drop separately', () => {
    const s = sharpSwings([70, 58, 57, 58, 70], 10);
    expect(s.map((x) => Math.sign(x.delta))).toEqual([-1, 1]);
  });
});
