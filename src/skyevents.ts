// Things worth stepping outside for: eclipses visible from here, the major
// meteor showers around their peaks, comets bright enough for binoculars, and
// northern (or southern) lights when a geomagnetic storm could reach this far.
// Eclipses and showers are worked out on the device with astronomy-engine;
// comets come from COBS and the Kp forecast from NOAA's Space Weather
// Prediction Center, both through the host's proxy.

import { useEffect, useState } from 'react';
import {
  Body, EclipseKind, Equator, Horizon, Illumination, NextLocalSolarEclipse, NextLunarEclipse, Observer,
  SearchLocalSolarEclipse, SearchLunarEclipse, SearchSunLongitude,
} from 'astronomy-engine';
import { PLUGIN_ID } from './openmeteo';
import { sunAltitude } from './sun/astro';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type SkyKind = 'eclipse' | 'meteor' | 'comet' | 'aurora';

export interface SkyEvent {
  kind: SkyKind;
  title: string;
  detail: string;
  /** When it happens, for ordering; the soonest leads. */
  at: number;
}

export interface SkyFormat {
  time: (ms: number) => string;
  /** 'today', 'tomorrow' or a weekday. */
  day: (ms: number) => string;
  /** 'tonight', 'tomorrow night' or 'Sat night', for the night `ms` falls in. */
  night: (ms: number) => string;
  /** 'Nov 20'. */
  date: (ms: number) => string;
}

// ── Eclipses ──

/** How far ahead an eclipse is announced. */
const ECLIPSE_LEAD = 14 * DAY;

function moonAltitudeAt(ms: number, obs: Observer): number {
  const d = new Date(ms);
  const eq = Equator(Body.Moon, d, obs, true, true);
  return Horizon(d, obs, eq.ra, eq.dec, 'normal').altitude;
}

/** Solar and lunar eclipses in the next two weeks that can be seen from here.
 *  Penumbral lunar eclipses are left out: the moon barely dims. */
export function eclipseEvents(now: number, lat: number, lng: number, f: SkyFormat): SkyEvent[] {
  const obs = new Observer(lat, lng, 0);
  const out: SkyEvent[] = [];

  let lunar = SearchLunarEclipse(new Date(now - 6 * HOUR));
  for (let i = 0; i < 4 && lunar.peak.date.getTime() < now + ECLIPSE_LEAD; i++) {
    const peak = lunar.peak.date.getTime();
    const half = (lunar.sd_total || lunar.sd_partial) * 60_000;
    const end = peak + lunar.sd_partial * 60_000;
    if (lunar.kind !== EclipseKind.Penumbral && end > now) {
      const seen = [peak - half, peak, peak + half].some((t) => moonAltitudeAt(t, obs) > 0);
      if (seen) {
        const total = lunar.kind === EclipseKind.Total;
        out.push({
          kind: 'eclipse',
          title: `${total ? 'Total' : 'Partial'} lunar eclipse ${f.night(peak)}`,
          detail: total
            ? `totality ${f.time(peak - half)}–${f.time(peak + half)}`
            : `${f.time(peak - half)}–${f.time(peak + half)} · ${Math.round(lunar.obscuration * 100)}% in shadow`,
          at: peak,
        });
      }
    }
    lunar = NextLunarEclipse(lunar.peak);
  }

  let solar = SearchLocalSolarEclipse(new Date(now - 6 * HOUR), obs);
  for (let i = 0; i < 4 && solar.partial_begin.time.date.getTime() < now + ECLIPSE_LEAD; i++) {
    const begin = solar.partial_begin;
    const end = solar.partial_end;
    const visible = [begin, solar.peak, end].some((e) => e.altitude > 0);
    // A graze of a few percent can't be noticed even through eclipse glasses.
    if (visible && solar.obscuration >= 0.05 && end.time.date.getTime() > now) {
      const peak = solar.peak.time.date.getTime();
      const name = solar.kind === EclipseKind.Total ? 'Total' : solar.kind === EclipseKind.Annular ? 'Annular' : 'Partial';
      const from = begin.altitude > 0 ? f.time(begin.time.date.getTime()) : 'sunrise';
      const to = end.altitude > 0 ? f.time(end.time.date.getTime()) : 'sunset';
      out.push({
        kind: 'eclipse',
        title: `${name} solar eclipse ${f.day(peak)}`,
        detail: `${from}–${to} · ${Math.round(solar.obscuration * 100)}% covered · eclipse glasses`,
        at: peak,
      });
    }
    solar = NextLocalSolarEclipse(solar.peak.time, obs);
  }
  return out;
}

// ── Meteor showers ──

/** The major showers: peak by the sun's ecliptic longitude (so the date
 *  follows the calendar each year), a dark-sky rate per hour, and the
 *  radiant's declination to tell who can see it. From the IMO calendar. */
const SHOWERS: Array<{ name: string; sunLon: number; zhr: number; dec: number }> = [
  { name: 'Quadrantids', sunLon: 283.15, zhr: 110, dec: 49 },
  { name: 'Lyrids', sunLon: 32.32, zhr: 18, dec: 33 },
  { name: 'Eta Aquariids', sunLon: 45.5, zhr: 50, dec: -1 },
  { name: 'Perseids', sunLon: 140.0, zhr: 100, dec: 58 },
  { name: 'Orionids', sunLon: 208.0, zhr: 20, dec: 16 },
  { name: 'Leonids', sunLon: 235.27, zhr: 15, dec: 22 },
  { name: 'Geminids', sunLon: 262.2, zhr: 150, dec: 33 },
];

/** Showers peaking within three days, until half a day after the peak. */
export function meteorEvents(now: number, lat: number, f: SkyFormat): SkyEvent[] {
  const out: SkyEvent[] = [];
  for (const s of SHOWERS) {
    // A radiant that never climbs above about 20° gives a poor show.
    if (90 - Math.abs(lat - s.dec) < 20) continue;
    const found = SearchSunLongitude(s.sunLon, new Date(now - DAY), 5);
    if (!found) continue;
    const peak = found.date.getTime();
    if (peak < now - 12 * HOUR || peak > now + 3 * DAY) continue;
    const moon = Math.round(Illumination(Body.Moon, new Date(peak)).phase_fraction * 100);
    out.push({
      kind: 'meteor',
      title: `${s.name} peak ${f.night(peak)}`,
      detail: `up to ${s.zhr}/hr · moon ${moon}%${moon >= 75 ? ', bright' : moon <= 25 ? ', dark skies' : ''}`,
      at: peak,
    });
  }
  return out;
}

// ── Comets ──

interface CobsComet {
  fullname: string;
  current_mag: string | null;
  peak_mag: string | null;
  peak_mag_date: string | null;
  is_active?: boolean;
}

/** Comets near enough to the limit to matter, from COBS, twice a day. */
export function useComets(enabled: boolean, limit: number): CobsComet[] | null {
  const [list, setList] = useState<CobsComet[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const sdk = window.__HS_SDK__;
    if (!sdk?.pluginFetch) return;
    let cancelled = false;
    const load = async () => {
      try {
        // Somewhat fainter than the limit, so a comet on its way up is caught.
        const res = await sdk.pluginFetch(PLUGIN_ID, { url: `https://cobs.si/api/comet_list.api?cur-mag=${limit + 4}`, cacheTtlMs: 6 * HOUR });
        if (!res.ok) return;
        const raw = await res.json() as { objects?: CobsComet[] };
        if (!cancelled && Array.isArray(raw.objects)) setList(raw.objects);
      } catch {
        // Keep the last list.
      }
    };
    load();
    const timer = setInterval(load, 12 * HOUR);
    return () => { cancelled = true; clearInterval(timer); };
  }, [enabled, limit]);
  return list;
}

/** 'C/2023 A3 (Tsuchinshan-ATLAS)' → 'Tsuchinshan-ATLAS'; '12P/Pons-Brooks' → 'Pons-Brooks'. */
function cometName(full: string): string {
  const paren = /\(([^)]+)\)/.exec(full);
  if (paren) return paren[1];
  const slash = full.indexOf('/');
  return slash >= 0 ? full.slice(slash + 1) : full;
}

export function cometEvents(list: CobsComet[] | null, now: number, limit: number, f: SkyFormat): SkyEvent[] {
  if (!list) return [];
  const out: SkyEvent[] = [];
  for (const c of list) {
    if (c.is_active === false) continue;
    const mag = c.current_mag != null ? parseFloat(c.current_mag) : NaN;
    const peakMag = c.peak_mag != null ? parseFloat(c.peak_mag) : NaN;
    const peakAt = c.peak_mag_date ? Date.parse(`${c.peak_mag_date}T12:00:00Z`) : NaN;
    const how = (m: number) => (m <= 5 ? 'naked eye' : 'binoculars');
    if (Number.isFinite(mag) && mag <= limit) {
      out.push({ kind: 'comet', title: `Comet ${cometName(c.fullname)} is out`, detail: `mag ${mag.toFixed(1)} · ${how(mag)}`, at: now });
    } else if (Number.isFinite(peakMag) && peakMag <= limit && peakAt > now && peakAt < now + 45 * DAY) {
      out.push({ kind: 'comet', title: `Comet ${cometName(c.fullname)} brightening`, detail: `best around ${f.date(peakAt)} · mag ${peakMag.toFixed(1)}`, at: peakAt });
    }
  }
  return out;
}

// ── Northern lights ──

export interface KpRow { time_tag: string; kp: number; observed: string; noaa_scale: string | null }

/** NOAA's three-day Kp forecast (with the last few days observed), every half hour. */
export function useKpForecast(enabled: boolean): KpRow[] | null {
  const [rows, setRows] = useState<KpRow[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const sdk = window.__HS_SDK__;
    if (!sdk?.pluginFetch) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await sdk.pluginFetch(PLUGIN_ID, { url: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json', cacheTtlMs: 20 * 60_000 });
        if (!res.ok) return;
        const raw = await res.json() as unknown;
        if (!cancelled && Array.isArray(raw)) setRows(raw.filter((r): r is KpRow => r && typeof r === 'object' && typeof (r as KpRow).kp === 'number'));
      } catch {
        // Keep the last forecast.
      }
    };
    load();
    const timer = setInterval(load, 30 * 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [enabled]);
  return rows;
}

/** Latitude measured from the geomagnetic (dipole) pole, which is where aurora
 *  ovals centre; the pole sits near 80.7° N, 72.7° W (IGRF, mid-2020s). */
export function geomagneticLatitude(lat: number, lng: number): number {
  const r = Math.PI / 180;
  const [pLat, pLng] = [80.7 * r, -72.7 * r];
  const s = Math.sin(lat * r) * Math.sin(pLat) + Math.cos(lat * r) * Math.cos(pLat) * Math.cos(lng * r - pLng);
  return Math.asin(Math.max(-1, Math.min(1, s))) / r;
}

/** The Kp at which aurora shows low on the poleward horizon at a geomagnetic
 *  latitude: roughly 66° at Kp 0, moving about 3° equatorward per step. */
export function kpNeeded(gmLat: number): number {
  return Math.max(3, (66 - Math.abs(gmLat)) / 3);
}

export function auroraEvent(rows: KpRow[] | null, now: number, lat: number, lng: number, f: SkyFormat): SkyEvent | null {
  if (!rows?.length) return null;
  const need = kpNeeded(geomagneticLatitude(lat, lng));
  let best: { kp: number; at: number; scale: string | null } | null = null;
  for (const r of rows) {
    const start = Date.parse(`${r.time_tag.replace(' ', 'T')}Z`);
    if (!Number.isFinite(start) || start + 3 * HOUR < now || start > now + 24 * HOUR) continue;
    // Only the dark part of the night counts.
    const mid = Math.max(now, start + 1.5 * HOUR);
    if (sunAltitude(mid, lat, lng) > -12) continue;
    if (!best || r.kp > best.kp) best = { kp: r.kp, at: mid, scale: r.noaa_scale };
  }
  if (!best || best.kp < need) return null;
  const which = lat >= 0 ? 'Northern' : 'Southern';
  const when = best.at <= now + HOUR ? 'now' : f.night(best.at);
  return {
    kind: 'aurora',
    title: `${which} lights ${best.kp >= need + 1 ? 'likely' : 'possible'} ${when}`,
    detail: `Kp ${Math.round(best.kp)}${best.scale ? `, ${best.scale} storm` : ''} · look ${lat >= 0 ? 'north' : 'south'}`,
    at: best.at,
  };
}
