import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import type { RainEvent, Swing } from './rain';

const HOUR = 3_600_000;
export const RAIN_BLUE = '#38bdf8';
const SNOW_WHITE = '#e0f2fe';
const DROP_BLUE = '#7dd3fc';
const RISE_ORANGE = '#fdba74';
const NIGHT = 'rgba(2, 6, 23, 0.38)';

export interface ChartHour {
  /** Start of the hour, epoch ms. */
  t: number;
  temp: number;
  icon: string;
  prob: number;
  rain: number | null;
  snow: number | null;
  night: boolean;
}

export interface ChartProps {
  hours: ChartHour[];
  now: number;
  events: RainEvent[];
  swings: Swing[];
  /** Time-out-of-the-house windows, [start, end] epoch ms. */
  away: Array<[number, number]>;
  /** The module's root font size in px: every size here is a multiple of it. */
  fs: number;
  accent: string;
  amountUnit: string;
  fmtHour: (t: number) => string;
  /** The weekday name for an hour that starts a new day, else null. */
  dayStart: (t: number) => string | null;
  colorTemp: (temp: number) => string;
  icon: (id: string, size: number) => React.ReactNode;
  textShadow: boolean;
}

function useBox() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setSize((s) => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    const ro = new ResizeObserver(read);
    ro.observe(el);
    read();
    return () => ro.disconnect();
  }, []);
  return { ref, ...size };
}

/** A smooth line through the points (Catmull-Rom, as cubic Béziers). */
function smooth(pts: Array<[number, number]>): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function fmtAmount(v: number, unit: string): string {
  if (unit === 'in') return v < 0.1 ? `${v.toFixed(2)} in` : `${v.toFixed(1)} in`;
  return v < 10 ? `${v.toFixed(1)} mm` : `${Math.round(v)} mm`;
}

/** The next hours: temperature line with labels and icons, night shaded,
 *  the time out of the house marked, sharp swings called out, and rain as
 *  bars sized by amount with the chance as a dashed line over them. */
export function HoursChart(p: ChartProps) {
  const { ref, w, h } = useBox();
  const ids = useId().replace(/:/g, '');
  const n = p.hours.length;
  const fs = p.fs;

  let body: React.ReactNode = null;
  if (w > 0 && h > 0 && n > 1) {
    const t0 = p.hours[0].t;
    const padX = fs * 0.4;
    const colW = (w - padX * 2) / n;
    const xT = (t: number) => padX + ((t - t0) / HOUR) * colW;
    const xi = (i: number) => padX + (i + 0.5) * colW;

    const iconSize = fs * 1.35;
    const axisH = fs * 2.3;
    const barsH = Math.max(fs * 2.4, h * 0.22);
    const barsBottom = h - axisH;
    const barsTop = barsBottom - barsH;
    // Room above the line for the high's label, below it for a swing badge.
    const tempTop = iconSize + fs * 1.7;
    const tempBottom = barsTop - fs * 1.9;

    const temps = p.hours.map((x) => x.temp);
    const lo = Math.min(...temps) - 1;
    const hi = Math.max(...temps) + 1;
    const yT = (t: number) => tempTop + (1 - (t - lo) / Math.max(1, hi - lo)) * (tempBottom - tempTop);
    const pts = p.hours.map((x, i) => [xi(i), yT(x.temp)] as [number, number]);
    const line = smooth(pts);
    const area = `${line}L${pts[n - 1][0]},${barsTop}L${pts[0][0]},${barsTop}Z`;

    // Rain bars: by amount when the source has amounts, else by chance.
    const hasAmounts = p.hours.some((x) => x.rain != null);
    const amountOf = (x: ChartHour) => (x.rain ?? 0) + (x.snow ?? 0) * 0.1;
    const amountScale = Math.max(p.amountUnit === 'in' ? 0.15 : 4, ...p.hours.map(amountOf));
    const barW = Math.min(colW * 0.72, fs * 1.4);

    // Labels: every third hour, plus the high and the low (larger), never two
    // within an hour of each other.
    const iMax = temps.indexOf(Math.max(...temps));
    const iMin = temps.indexOf(Math.min(...temps));
    const labelled = new Set<number>([iMax, iMin]);
    for (let i = 0; i < n; i += 3) if (![...labelled].some((j) => Math.abs(j - i) <= 1)) labelled.add(i);

    // Night as contiguous bands.
    const nights: Array<[number, number]> = [];
    p.hours.forEach((x, i) => {
      if (!x.night) return;
      const last = nights[nights.length - 1];
      if (last && last[1] === i) last[1] = i + 1; else nights.push([i, i + 1]);
    });

    const shadow = p.textShadow ? `drop-shadow(0 ${fs * 0.05}px ${fs * 0.12}px rgba(0, 0, 0, 0.6))` : undefined;
    const nowX = xT(p.now);
    const end = t0 + n * HOUR;

    body = (
      <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={`${ids}-stroke`} gradientUnits="userSpaceOnUse" x1={xi(0)} x2={xi(n - 1)} y1={0} y2={0}>
            {p.hours.map((x, i) => <stop key={i} offset={n > 1 ? i / (n - 1) : 0} stopColor={p.colorTemp(x.temp)} />)}
          </linearGradient>
          <linearGradient id={`${ids}-fill`} x1={0} x2={0} y1={0} y2={1}>
            <stop offset="0" stopColor="#ffffff" stopOpacity={0.2} />
            <stop offset="1" stopColor="#ffffff" stopOpacity={0} />
          </linearGradient>
        </defs>

        {nights.map(([a, b]) => (
          <rect key={`n${a}`} x={padX + a * colW} y={0} width={(b - a) * colW} height={barsBottom} fill={NIGHT} rx={fs * 0.3} />
        ))}

        {p.away.map(([a, b]) => {
          const x0 = Math.max(padX, xT(Math.max(a, t0)));
          const x1 = Math.min(w - padX, xT(Math.min(b, end)));
          if (x1 - x0 < colW * 0.5) return null;
          return (
            <g key={`a${a}`}>
              <rect x={x0} y={barsTop - fs * 0.15} width={x1 - x0} height={barsH + fs * 0.15} fill={p.accent} opacity={0.12} rx={fs * 0.25} />
              <line x1={x0} x2={x1} y1={barsTop - fs * 0.15} y2={barsTop - fs * 0.15} stroke={p.accent} strokeWidth={fs * 0.12} opacity={0.9} />
              <text x={x0 + fs * 0.3} y={barsBottom - fs * 0.3} fontSize={fs * 0.7} fontWeight={700} fill={p.accent} letterSpacing="0.08em" style={{ filter: shadow }}>OUT</text>
            </g>
          );
        })}

        {/* Rain: chance as a dashed line, amount (or chance) as bars. */}
        <line x1={padX} x2={w - padX} y1={barsBottom} y2={barsBottom} stroke="currentColor" strokeOpacity={0.35} strokeWidth={Math.max(1, fs * 0.05)} />
        {p.hours.map((x, i) => {
          const v = hasAmounts ? amountOf(x) / amountScale : x.prob / 100;
          if (v <= 0.005 || (hasAmounts && x.prob < 10 && amountOf(x) === 0)) return null;
          const bh = Math.max(fs * 0.15, Math.min(1, v) * barsH);
          return (
            <rect key={`b${i}`} x={xi(i) - barW / 2} y={barsBottom - bh} width={barW} height={bh} rx={Math.min(barW / 3, fs * 0.2)}
              fill={(x.snow ?? 0) > 0 && (x.rain ?? 0) === 0 ? SNOW_WHITE : RAIN_BLUE} opacity={0.35 + 0.65 * Math.min(1, x.prob / 100)} />
          );
        })}
        {hasAmounts && (
          <polyline fill="none" stroke={RAIN_BLUE} strokeWidth={fs * 0.08} strokeDasharray={`${fs * 0.25} ${fs * 0.2}`} opacity={0.9}
            points={p.hours.map((x, i) => `${xi(i).toFixed(1)},${(barsBottom - (x.prob / 100) * barsH).toFixed(1)}`).join(' ')} />
        )}
        {p.events.map((e) => {
          const a = Math.max(e.start, t0);
          const b = Math.min(e.end, end);
          if (b <= a) return null;
          const label = e.rain != null || e.snow != null
            ? [e.rain && e.rain >= 0.005 ? fmtAmount(e.rain, p.amountUnit) : null,
              e.snow && e.snow > 0 ? `${fmtAmount(e.snow, p.amountUnit === 'in' ? 'in' : 'cm').replace(' mm', ' cm')} snow` : null].filter(Boolean).join(' + ')
            : `${e.peakProb}%`;
          return (
            <text key={`e${e.start}`} x={(xT(a) + xT(b)) / 2} y={barsTop - fs * 0.35} textAnchor="middle" fontSize={fs * 0.95} fontWeight={700}
              fill={RAIN_BLUE} style={{ filter: shadow }}>{label}</text>
          );
        })}

        {/* Temperature */}
        <path d={area} fill={`url(#${ids}-fill)`} />
        <path d={line} fill="none" stroke={`url(#${ids}-stroke)`} strokeWidth={fs * 0.22} strokeLinecap="round" strokeLinejoin="round" style={{ filter: shadow }} />

        {p.swings.map((s) => {
          const a = pts[s.from];
          const b = pts[s.to];
          const drop = s.delta < 0;
          const color = drop ? DROP_BLUE : RISE_ORANGE;
          const mx = (a[0] + b[0]) / 2;
          const my = (a[1] + b[1]) / 2;
          return (
            <g key={`s${s.from}`} style={{ filter: shadow }}>
              <circle cx={a[0]} cy={a[1]} r={fs * 0.22} fill={color} />
              <circle cx={b[0]} cy={b[1]} r={fs * 0.22} fill={color} />
              <rect x={mx - fs * 1.9} y={my + (drop ? fs * 0.5 : -fs * 1.9)} width={fs * 3.8} height={fs * 1.35} rx={fs * 0.35} fill={color} />
              <text x={mx} y={my + (drop ? fs * 1.55 : -fs * 0.85)} textAnchor="middle" fontSize={fs * 0.95} fontWeight={800} fill="#0f172a">
                {drop ? '▼' : '▲'} {Math.abs(Math.round(s.delta))}{'°'}
              </text>
            </g>
          );
        })}

        {[...labelled].map((i) => {
          const big = i === iMax || i === iMin;
          return (
            <text key={`t${i}`} x={pts[i][0]} y={pts[i][1] - fs * (big ? 0.7 : 0.55)} textAnchor="middle"
              fontSize={fs * (big ? 1.25 : 0.95)} fontWeight={big ? 800 : 600} fill="currentColor" style={{ filter: shadow }}>
              {Math.round(p.hours[i].temp)}{'°'}
            </text>
          );
        })}

        {p.hours.map((x, i) => (i % 3 === 0 ? (
          <g key={`i${i}`} transform={`translate(${xi(i) - iconSize / 2} 0)`}>{p.icon(x.icon, iconSize)}</g>
        ) : null))}

        {/* Now */}
        {nowX >= padX && nowX <= w - padX && (
          <g>
            <line x1={nowX} x2={nowX} y1={iconSize + fs * 0.3} y2={barsBottom} stroke={p.accent} strokeWidth={fs * 0.1} />
            <circle cx={nowX} cy={barsBottom} r={fs * 0.22} fill={p.accent} />
          </g>
        )}

        {/* Hours along the bottom, the weekday under each midnight. */}
        {p.hours.map((x, i) => {
          const day = p.dayStart(x.t);
          const show = i % 3 === 0 || day != null;
          if (!show) return null;
          return (
            <g key={`x${i}`} style={{ filter: shadow }}>
              {i % 3 === 0 && (
                <text x={xi(i)} y={barsBottom + fs * 1.05} textAnchor="middle" fontSize={fs * 0.85} fill="currentColor" opacity={0.9}>{p.fmtHour(x.t)}</text>
              )}
              {day && (
                <text x={padX + i * colW} y={barsBottom + fs * 2.15} textAnchor="start" fontSize={fs * 0.85} fontWeight={800} fill="currentColor">{day}</text>
              )}
            </g>
          );
        })}
      </svg>
    );
  }

  return <div ref={ref} style={{ flex: 1, minHeight: 0, position: 'relative' }}>{body}</div>;
}
