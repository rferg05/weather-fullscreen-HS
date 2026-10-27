// The precipitation radar: the same frames Home Screens' Rain Map reads
// (LibreWXR's public server, RainViewer's v2 wire format), drawn as plain
// tiles over a darkened OpenStreetMap basemap. The frame index comes through
// the host's proxy; the tiles themselves are ordinary images.

import React, { useEffect, useRef, useState } from 'react';
import { PLUGIN_ID } from './openmeteo';
import { useBoxSize } from './sky/useBoxSize';

const INDEX_URL = 'https://api.librewxr.net/public/weather-maps.json';
const INDEX_REFRESH_MS = 10 * 60_000;
const OSM_TILE = 'https://tile.openstreetmap.org';
/** Home Screens' dark style: the light OSM map inverted, colours muted. */
const DARK_MAP = 'invert(1) hue-rotate(180deg) brightness(0.72) contrast(1.05) saturate(0.55)';
/** The Rain Map's default colour scheme, smoothed, with snow shown apart. */
const RADAR_STYLE = '2/1_1';
const PAST_FRAMES = 7;
const FRAME_MS = 650;
const HOLD_MS = 2500;

export interface RadarFrame { time: number; path: string; nowcast: boolean }
export interface RadarIndex { host: string; frames: RadarFrame[] }

interface RawIndex { host?: string; radar?: { past?: Array<{ time: number; path: string }>; nowcast?: Array<{ time: number; path: string }> } }

/** The last hour of radar plus the nowcast; null until it answers, or when off. */
export function useRadarIndex(enabled: boolean): RadarIndex | null {
  const [index, setIndex] = useState<RadarIndex | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const sdk = window.__HS_SDK__;
    if (!sdk?.pluginFetch) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await sdk.pluginFetch(PLUGIN_ID, { url: INDEX_URL, cacheTtlMs: 5 * 60_000 });
        if (!res.ok) return;
        const raw = await res.json() as RawIndex;
        const past = (raw.radar?.past ?? []).slice(-PAST_FRAMES).map((f) => ({ ...f, nowcast: false }));
        const ahead = (raw.radar?.nowcast ?? []).map((f) => ({ ...f, nowcast: true }));
        if (!cancelled && raw.host && past.length) setIndex({ host: raw.host.replace(/\/+$/, ''), frames: [...past, ...ahead] });
      } catch {
        // Keep the last good index; the frames are still on the server for a while.
      }
    };
    load();
    const timer = setInterval(load, INDEX_REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [enabled]);
  return index;
}

/** Web Mercator: a point's position in world pixels at a zoom, for 256 px tiles. */
function worldPx(lat: number, lng: number, z: number): [number, number] {
  const size = 256 * 2 ** z;
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return [((lng + 180) / 360) * size, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size];
}

export function RadarMap({ index, lat, lng, zoom, scale, accent, fmtTime, running }: {
  index: RadarIndex | null;
  lat: number;
  lng: number;
  zoom: number;
  /** Tile magnification, so place names read from across the room. */
  scale: number;
  accent: string;
  fmtTime: (ms: number) => string;
  /** Animate only while it's on screen. */
  running: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const size = useBoxSize(box);
  const frames = index?.frames ?? [];
  const nowIdx = frames.reduce((last, f, i) => (f.nowcast ? last : i), 0);
  const [at, setAt] = useState(nowIdx);
  useEffect(() => {
    if (!running || frames.length < 2) { setAt(nowIdx); return; }
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      setAt(i);
      // Linger on the latest observed frame and on the last forecast one.
      const wait = i === nowIdx || i === frames.length - 1 ? HOLD_MS : FRAME_MS;
      i = (i + 1) % frames.length;
      timer = setTimeout(step, wait);
    };
    step();
    return () => clearTimeout(timer);
  }, [running, frames.length, nowIdx, index]);

  const tile = 256 * scale;
  const w = size?.w ?? 0;
  const h = size?.h ?? 0;
  const tiles: Array<{ key: string; x: number; y: number; left: number; top: number }> = [];
  if (w && h) {
    const [cx, cy] = worldPx(lat, lng, zoom).map((v) => v * scale);
    const left = cx - w / 2;
    const top = cy - h / 2;
    const n = 2 ** zoom;
    for (let ty = Math.floor(top / tile); ty * tile < top + h; ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = Math.floor(left / tile); tx * tile < left + w; tx++) {
        const x = ((tx % n) + n) % n;
        tiles.push({ key: `${tx}_${ty}`, x, y: ty, left: tx * tile - left, top: ty * tile - top });
      }
    }
  }
  const tileImg = (src: string, t: (typeof tiles)[number]) => (
    <img key={t.key} src={src} alt="" draggable={false} style={{ position: 'absolute', left: t.left, top: t.top, width: tile, height: tile, maxWidth: 'none' }} />
  );
  const frame = frames[Math.min(at, frames.length - 1)];
  const ahead = frame ? Math.round((frame.time * 1000 - Date.now()) / 60_000) : 0;

  return (
    <div ref={box} style={{ position: 'relative', flex: 1, minHeight: 0, borderRadius: '0.45em', overflow: 'hidden', background: '#151515', textShadow: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, filter: DARK_MAP }}>
        {tiles.map((t) => tileImg(`${OSM_TILE}/${zoom}/${t.x}/${t.y}.png`, t))}
      </div>
      {index && frames.map((f, i) => (
        <div key={f.path} style={{ position: 'absolute', inset: 0, opacity: i === at ? 0.85 : 0 }}>
          {tiles.map((t) => tileImg(`${index.host}${f.path}/256/${zoom}/${t.x}/${t.y}/${RADAR_STYLE}.png`, t))}
        </div>
      ))}
      {/* Home */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%', width: '0.75em', height: '0.75em', transform: 'translate(-50%, -50%)',
        borderRadius: '50%', background: accent, boxShadow: '0 0 0 0.16em #ffffff, 0 0 0.5em 0.2em rgba(0,0,0,0.6)',
      }} />
      {frame && (
        <div style={{
          position: 'absolute', left: '0.5em', top: '0.45em', padding: '0.15em 0.55em', borderRadius: '0.4em',
          background: 'rgba(8, 12, 24, 0.78)', fontSize: '1.05em', fontWeight: 800, color: frame.nowcast ? accent : '#ffffff',
        }}>
          {fmtTime(frame.time * 1000)}{frame.nowcast ? ` · in ${Math.max(0, ahead)} min` : at === nowIdx ? ' · now' : ''}
        </div>
      )}
      {/* The loop: solid for what was seen, hollow for the forecast. */}
      {frames.length > 1 && (
        <div style={{ position: 'absolute', left: '0.6em', right: '0.6em', bottom: '0.5em', display: 'flex', gap: '0.25em' }}>
          {frames.map((f, i) => (
            <span key={f.path} style={{
              flex: 1, height: '0.32em', borderRadius: '0.16em',
              background: i <= at ? (f.nowcast ? accent : '#ffffff') : 'rgba(255,255,255,0.25)',
              boxShadow: f.nowcast ? `inset 0 0 0 0.06em ${accent}` : undefined,
            }} />
          ))}
        </div>
      )}
      <span style={{ position: 'absolute', right: '0.7em', top: '0.5em', fontSize: '0.5em', color: 'rgba(255,255,255,0.7)' }}>© OpenStreetMap · LibreWXR</span>
      {!index && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1em', fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
          Loading radar…
        </div>
      )}
    </div>
  );
}
