import { describe, expect, it } from 'vitest';
import { auroraEvent, cometEvents, eclipseEvents, geomagneticLatitude, kpNeeded, meteorEvents } from './skyevents';
import type { KpRow, SkyFormat } from './skyevents';

const CHI = [41.88, -87.63] as const;
const iso = (ms: number) => new Date(ms).toISOString();
const f: SkyFormat = { time: iso, day: iso, night: iso, date: iso };

describe('eclipses', () => {
  it('finds the April 2024 eclipse from Chicago, about 94% covered', () => {
    const ev = eclipseEvents(Date.parse('2024-04-01T12:00:00Z'), CHI[0], CHI[1], f);
    const solar = ev.find((e) => e.title.includes('solar'));
    expect(solar?.title).toMatch(/^Partial solar eclipse/);
    expect(solar?.detail).toMatch(/9[345]% covered/);
    expect(iso(solar!.at).slice(0, 10)).toBe('2024-04-08');
  });

  it('finds the March 2025 total lunar eclipse from Chicago', () => {
    const ev = eclipseEvents(Date.parse('2025-03-05T12:00:00Z'), CHI[0], CHI[1], f);
    expect(ev.find((e) => e.title.startsWith('Total lunar eclipse'))).toBeTruthy();
  });

  it('skips the August 2026 eclipse, a 0.1% graze from Chicago', () => {
    const ev = eclipseEvents(Date.parse('2026-08-05T12:00:00Z'), CHI[0], CHI[1], f);
    expect(ev.filter((e) => e.title.includes('solar'))).toEqual([]);
  });
});

describe('meteor showers', () => {
  it('announces the 2026 Geminids around December 14', () => {
    const ev = meteorEvents(Date.parse('2026-12-12T18:00:00Z'), CHI[0], f);
    const gem = ev.find((e) => e.title.startsWith('Geminids'));
    expect(gem).toBeTruthy();
    expect(iso(gem!.at).slice(0, 10)).toMatch(/2026-12-1[34]/);
  });

  it('is quiet between showers', () => {
    expect(meteorEvents(Date.parse('2026-03-10T12:00:00Z'), CHI[0], f)).toEqual([]);
  });
});

describe('northern lights', () => {
  it('needs about Kp 5 in Chicago', () => {
    expect(geomagneticLatitude(CHI[0], CHI[1])).toBeCloseTo(50.7, 0);
    expect(kpNeeded(geomagneticLatitude(CHI[0], CHI[1]))).toBeGreaterThan(4.8);
    expect(kpNeeded(geomagneticLatitude(CHI[0], CHI[1]))).toBeLessThan(5.5);
  });

  it('speaks up for a dark-hours storm strong enough, and not for a weak one', () => {
    const now = Date.parse('2026-10-27T22:00:00Z'); // 5 PM in Chicago
    const rows = (kp: number): KpRow[] => [0, 3, 6, 9, 12].map((h) => ({
      time_tag: new Date(now + h * 3_600_000).toISOString().slice(0, 13) + ':00:00', kp, observed: 'predicted', noaa_scale: kp >= 5 ? 'G1' : null,
    }));
    expect(auroraEvent(rows(6.33), now, CHI[0], CHI[1], f)?.title).toMatch(/^Northern lights likely/);
    expect(auroraEvent(rows(3), now, CHI[0], CHI[1], f)).toBeNull();
  });
});

describe('comets', () => {
  it('names bright and brightening comets, and leaves faint ones out', () => {
    const now = Date.parse('2026-10-27T12:00:00Z');
    const ev = cometEvents([
      { fullname: 'C/2023 A3 (Tsuchinshan-ATLAS)', current_mag: '4.2', peak_mag: '-3', peak_mag_date: '2024-10-09' },
      { fullname: '12P/Pons-Brooks', current_mag: '11.0', peak_mag: '6.5', peak_mag_date: '2026-11-20' },
      { fullname: '29P/Schwassmann-Wachmann', current_mag: '12.8', peak_mag: '11.8', peak_mag_date: '2019-10-08' },
    ], now, 7, f);
    expect(ev.map((e) => e.title)).toEqual(['Comet Tsuchinshan-ATLAS is out', 'Comet Pons-Brooks brightening']);
  });
});
