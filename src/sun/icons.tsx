import React, { useId } from 'react';
import type { DayPhase } from './astro';

export type IconStyle = 'color' | 'line';
export type Backdrop = 'sky' | 'plain' | 'none';

const SUN_CORE: [string, string] = ['#fde68a', '#f59e0b'];
const SUN_RAY = '#fbbf24';
const RISE_SUN: [string, string] = ['#fde047', '#fb923c'];
const SET_SUN: [string, string] = ['#fdba74', '#e11d48'];
const MOON_LIT = '#f4f1e6';
const MOON_DARK = '#394150';

/** Rays above the horizon, leaving the top clear for the arrow. */
const HORIZON_RAY_ANGLES = [18, 52, 128, 162];

/** Unique ids for this instance's gradients: several modules can share a page. */
function useIds(...names: string[]): Record<string, string> {
  const base = useId().replace(/:/g, '');
  return Object.fromEntries(names.map((n) => [n, `${base}-${n}`]));
}

function ray(cx: number, cy: number, deg: number, r0: number, r1: number) {
  const a = (deg * Math.PI) / 180;
  return {
    x1: cx + r0 * Math.cos(a), y1: cy - r0 * Math.sin(a),
    x2: cx + r1 * Math.cos(a), y2: cy - r1 * Math.sin(a),
  };
}

/** A half sun on the horizon with an arrow: the sunrise (up) and sunset
 *  (down) icon, drawn in a 24-unit box. */
export function SunHorizonGlyph({ direction, iconStyle }: { direction: 'up' | 'down'; iconStyle: IconStyle }) {
  const ids = useIds('sun');
  const color = iconStyle === 'color';
  const [top, bottom] = direction === 'up' ? RISE_SUN : SET_SUN;
  const rayColor = color ? SUN_RAY : 'currentColor';
  const arrow = direction === 'up' ? 'M12 8.5V2.5M9.5 5l2.5-2.5L14.5 5' : 'M12 2.5v6M9.5 6l2.5 2.5L14.5 6';
  return (
    <g strokeLinecap="round" strokeLinejoin="round" fill="none">
      {color && (
        <defs>
          <linearGradient id={ids.sun} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={top} />
            <stop offset="1" stopColor={bottom} />
          </linearGradient>
        </defs>
      )}
      {HORIZON_RAY_ANGLES.map((deg) => (
        <line key={deg} {...ray(12, 17, deg, 6.6, 8.8)} stroke={rayColor} strokeWidth={1.6} />
      ))}
      <path d="M6.8 17a5.2 5.2 0 0 1 10.4 0Z" fill={color ? `url(#${ids.sun})` : 'none'}
        stroke={color ? 'none' : 'currentColor'} strokeWidth={1.6} />
      <path d={arrow} stroke={color ? (direction === 'up' ? '#fde68a' : '#fdba74') : 'currentColor'} strokeWidth={1.6} />
      <path d="M2 17.6h20" stroke="currentColor" strokeWidth={1.6} opacity={0.85} />
    </g>
  );
}

/** The whole sun, centered in a 24-unit box. */
export function FullSunGlyph({ iconStyle }: { iconStyle: IconStyle }) {
  const ids = useIds('core');
  const color = iconStyle === 'color';
  return (
    <g strokeLinecap="round" fill="none">
      {color && (
        <defs>
          <radialGradient id={ids.core} cx="0.4" cy="0.35" r="0.75">
            <stop offset="0" stopColor={SUN_CORE[0]} />
            <stop offset="1" stopColor={SUN_CORE[1]} />
          </radialGradient>
        </defs>
      )}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <line key={deg} {...ray(12, 12, deg, 7.2, 9.8)} stroke={color ? SUN_RAY : 'currentColor'} strokeWidth={1.7} />
      ))}
      <circle cx={12} cy={12} r={4.9} fill={color ? `url(#${ids.core})` : 'none'}
        stroke={color ? 'none' : 'currentColor'} strokeWidth={1.6} />
    </g>
  );
}

/** The moon as it looks tonight, radius `r` around the origin. `phase` runs
 *  0 new → 0.5 full → 1 new; `mirror` flips it for the southern hemisphere,
 *  where a waxing moon is lit on the left. */
export function MoonGlyph({ phase, r, iconStyle, mirror }: {
  phase: number; r: number; iconStyle: IconStyle; mirror: boolean;
}) {
  const color = iconStyle === 'color';
  const waxing = phase <= 0.5;
  // The terminator is an ellipse whose width follows the phase: a line at
  // the quarters, the full disc edge at new and full.
  const rx = r * Math.abs(Math.cos(2 * Math.PI * phase));
  const gibbous = phase > 0.25 && phase < 0.75;
  // The lit limb runs down the right side; the terminator comes back up,
  // bowing right (crescent) or left (gibbous). Waning moons mirror it.
  const lit = `M0 ${-r}A${r} ${r} 0 0 1 0 ${r}A${rx} ${r} 0 0 ${gibbous ? 1 : 0} 0 ${-r}Z`;
  const flip = waxing !== mirror ? undefined : 'scale(-1 1)';
  return (
    <g>
      <circle r={r} fill={color ? MOON_DARK : 'none'} stroke={color ? 'none' : 'currentColor'}
        strokeWidth={r * 0.1} opacity={color ? 0.9 : 0.6} />
      <path d={lit} transform={flip} fill={color ? MOON_LIT : 'currentColor'} />
      {color && (
        <g opacity={0.12} fill="#4b5563">
          <circle cx={-r * 0.3} cy={-r * 0.25} r={r * 0.2} />
          <circle cx={r * 0.25} cy={r * 0.3} r={r * 0.14} />
          <circle cx={r * 0.35} cy={-r * 0.35} r={r * 0.1} />
        </g>
      )}
    </g>
  );
}

const SKY: Record<DayPhase, [string, string]> = {
  rising: ['rgba(30, 58, 138, 0.6)', 'rgba(251, 146, 60, 0.6)'],
  day: ['rgba(14, 165, 233, 0.55)', 'rgba(125, 211, 252, 0.4)'],
  setting: ['rgba(76, 29, 149, 0.6)', 'rgba(249, 115, 22, 0.6)'],
  night: ['rgba(11, 16, 38, 0.75)', 'rgba(30, 41, 59, 0.6)'],
};

/** The round icon under the horizon: rising sun, full sun, setting sun, then
 *  the moon in its current phase. Centered on (cx, cy), `d` across. */
export function PhaseIcon({ cx, cy, d, phase, moon, iconStyle, backdrop, mirrorMoon }: {
  cx: number; cy: number; d: number; phase: DayPhase; moon: number;
  iconStyle: IconStyle; backdrop: Backdrop; mirrorMoon: boolean;
}) {
  const ids = useIds('sky', 'clip');
  const r = d / 2;
  const s = d / 24;
  return (
    <g transform={`translate(${cx - r} ${cy - r})`}>
      <defs>
        <linearGradient id={ids.sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={SKY[phase][0]} />
          <stop offset="1" stopColor={SKY[phase][1]} />
        </linearGradient>
        <clipPath id={ids.clip}><circle cx={r} cy={r} r={r} /></clipPath>
      </defs>
      {backdrop !== 'none' && (
        <circle cx={r} cy={r} r={r}
          fill={backdrop === 'sky' ? `url(#${ids.sky})` : 'rgba(255, 255, 255, 0.14)'} />
      )}
      <g clipPath={backdrop === 'none' ? undefined : `url(#${ids.clip})`}>
        {phase === 'night' ? (
          <g transform={`translate(${r} ${r})`}>
            <MoonGlyph phase={moon} r={r * 0.58} iconStyle={iconStyle} mirror={mirrorMoon} />
          </g>
        ) : (
          // The 24-unit glyphs, shrunk a little so the rays clear the rim.
          <g transform={`translate(${r} ${r}) scale(${s * 0.78}) translate(-12 ${phase === 'day' ? -12 : -11.5})`}>
            {phase === 'day'
              ? <FullSunGlyph iconStyle={iconStyle} />
              : <SunHorizonGlyph direction={phase === 'rising' ? 'up' : 'down'} iconStyle={iconStyle} />}
          </g>
        )}
      </g>
    </g>
  );
}
