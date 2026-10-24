// Hourly and daily rain and snow amounts from Open-Meteo (free, no key),
// fetched through the host's server-side proxy. The host's own weather data
// has the chance of rain but not how much, which is the question that matters
// before leaving the house.

import { useEffect, useState } from 'react';

export const PLUGIN_ID = 'weather-fullscreen';
const REFRESH_MS = 15 * 60_000;
const CACHE_MS = 10 * 60_000;

export interface PrecipHour { prob: number; rain: number; snow: number }
export interface PrecipDay { prob: number | null; rain: number; snow: number }

export interface Precip {
  /** Keyed by the hour's start, epoch ms. */
  hours: Map<number, PrecipHour>;
  /** Keyed by the location's calendar date, YYYY-MM-DD. */
  days: Map<string, PrecipDay>;
}

interface Raw {
  utc_offset_seconds?: number;
  hourly?: { time: number[]; precipitation_probability?: (number | null)[]; rain?: (number | null)[]; showers?: (number | null)[]; snowfall?: (number | null)[] };
  daily?: { time: number[]; precipitation_probability_max?: (number | null)[]; rain_sum?: (number | null)[]; showers_sum?: (number | null)[]; snowfall_sum?: (number | null)[] };
}

export function parsePrecip(raw: Raw): Precip {
  const hours = new Map<number, PrecipHour>();
  const days = new Map<string, PrecipDay>();
  const h = raw.hourly;
  if (h?.time) {
    h.time.forEach((t, i) => {
      hours.set(t * 1000, {
        prob: h.precipitation_probability?.[i] ?? 0,
        rain: (h.rain?.[i] ?? 0) + (h.showers?.[i] ?? 0),
        snow: h.snowfall?.[i] ?? 0,
      });
    });
  }
  const d = raw.daily;
  const offset = (raw.utc_offset_seconds ?? 0) * 1000;
  if (d?.time) {
    d.time.forEach((t, i) => {
      const date = new Date(t * 1000 + offset).toISOString().slice(0, 10);
      days.set(date, {
        prob: d.precipitation_probability_max?.[i] ?? null,
        rain: (d.rain_sum?.[i] ?? 0) + (d.showers_sum?.[i] ?? 0),
        snow: d.snowfall_sum?.[i] ?? 0,
      });
    });
  }
  return { hours, days };
}

/** Polls Open-Meteo every 15 minutes; null until the first answer, or when off. */
export function usePrecip(enabled: boolean, lat: number | undefined, lng: number | undefined, metric: boolean): Precip | null {
  const [data, setData] = useState<Precip | null>(null);
  useEffect(() => {
    if (!enabled || typeof lat !== 'number' || typeof lng !== 'number') { setData(null); return; }
    const sdk = window.__HS_SDK__;
    if (!sdk?.pluginFetch) return;
    const url = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}`
      + '&hourly=precipitation_probability,rain,showers,snowfall'
      + '&daily=precipitation_probability_max,rain_sum,showers_sum,snowfall_sum'
      + '&forecast_days=8&timeformat=unixtime&timezone=auto'
      + (metric ? '' : '&precipitation_unit=inch');
    let cancelled = false;
    const load = async () => {
      try {
        const res = await sdk.pluginFetch(PLUGIN_ID, { url, cacheTtlMs: CACHE_MS });
        if (!res.ok) return;
        const parsed = parsePrecip(await res.json() as Raw);
        if (!cancelled) setData(parsed);
      } catch {
        // Keep the last good answer; the chance of rain still comes from the host.
      }
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [enabled, lat, lng, metric]);
  return data;
}

const AIR_REFRESH_MS = 30 * 60_000;

/** The current US AQI from Open-Meteo's air-quality service; null until it
 *  answers, when off, or when it has no reading for the location. */
export function useAirQuality(enabled: boolean, lat: number | undefined, lng: number | undefined): number | null {
  const [aqi, setAqi] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled || typeof lat !== 'number' || typeof lng !== 'number') { setAqi(null); return; }
    const sdk = window.__HS_SDK__;
    if (!sdk?.pluginFetch) return;
    const url = 'https://air-quality-api.open-meteo.com/v1/air-quality'
      + `?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&current=us_aqi&timezone=auto`;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await sdk.pluginFetch(PLUGIN_ID, { url, cacheTtlMs: 20 * 60_000 });
        if (!res.ok) return;
        const body = await res.json() as { current?: { us_aqi?: number | null } };
        const v = body.current?.us_aqi;
        if (!cancelled) setAqi(typeof v === 'number' && Number.isFinite(v) ? v : null);
      } catch {
        // Air quality is extra; without it the slot simply stays empty.
      }
    };
    load();
    const timer = setInterval(load, AIR_REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [enabled, lat, lng]);
  return aqi;
}
