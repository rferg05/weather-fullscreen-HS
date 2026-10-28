// A picture of tonight's moon: the near side's seas and bright craters, lit
// to the current phase, with the dark part faintly showing (earthshine).
// Drawn, not a photo, so it stays sharp at any size and adds nothing to load.

import React from 'react';

/** The maria and craters, on a unit disc as seen from the northern
 *  hemisphere: north up, Mare Crisium on the right (east). [x, y, rx, ry, rotate]. */
const MARIA: Array<[number, number, number, number, number]> = [
  [-0.5, 0.0, 0.27, 0.48, 10], // Oceanus Procellarum
  [-0.24, -0.4, 0.27, 0.22, 0], // Imbrium
  [0.2, -0.36, 0.15, 0.14, 0], // Serenitatis
  [0.32, -0.04, 0.21, 0.16, -15], // Tranquillitatis
  [0.64, -0.26, 0.11, 0.09, 0], // Crisium
  [0.58, 0.16, 0.1, 0.17, 10], // Fecunditatis
  [0.36, 0.3, 0.09, 0.08, 0], // Nectaris
  [-0.14, 0.33, 0.17, 0.12, 0], // Nubium
  [-0.46, 0.4, 0.09, 0.08, 0], // Humorum
  [0.02, -0.68, 0.36, 0.06, 0], // Frigoris
  [0.08, -0.06, 0.08, 0.07, 0], // Vaporum / Sinus Medii
];
/** Bright young craters: [x, y, r]. Tycho's rays are drawn separately. */
const BRIGHT: Array<[number, number, number]> = [
  [-0.14, 0.7, 0.05], // Tycho
  [-0.27, -0.12, 0.045], // Copernicus
  [-0.62, -0.18, 0.03], // Kepler
  [-0.62, -0.42, 0.03], // Aristarchus
];

let seq = 0;

export function MoonPicture({ phase, size, mirror = false }: {
  /** 0 new → 0.5 full → 1 new. */
  phase: number;
  size: string;
  /** Southern hemisphere: the moon appears upside down. */
  mirror?: boolean;
}) {
  const id = React.useMemo(() => `moonpic${++seq}`, []);
  const r = 50;
  const waxing = phase <= 0.5;
  const rx = r * Math.abs(Math.cos(2 * Math.PI * phase));
  const gibbous = phase > 0.25 && phase < 0.75;
  // The unlit side: the far limb, then back along the terminator.
  const dark = `M0 ${-r}A${r} ${r} 0 0 0 0 ${r}A${rx} ${r} 0 0 ${gibbous ? 1 : 0} 0 ${-r}Z`;
  // Waxing moons are lit on the right in the north; the south sees it turned over.
  const shadeFlip = waxing !== mirror ? undefined : 'scale(-1 1)';
  const faceFlip = mirror ? 'rotate(180)' : undefined;
  return (
    <svg viewBox="-54 -54 108 108" width={size} height={size} aria-hidden="true"
      style={{ flexShrink: 0, overflow: 'visible', filter: 'drop-shadow(0 0.05em 0.12em rgba(0,0,0,0.6))' }}>
      <defs>
        <radialGradient id={`${id}g`} cx="45%" cy="40%" r="62%">
          <stop offset="0" stopColor="#f4f1e8" />
          <stop offset="0.7" stopColor="#ddd8cb" />
          <stop offset="1" stopColor="#b9b3a5" />
        </radialGradient>
        <filter id={`${id}b`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
        <clipPath id={`${id}c`}><circle r={r} /></clipPath>
      </defs>
      <g clipPath={`url(#${id}c)`}>
        <circle r={r} fill={`url(#${id}g)`} />
        <g transform={faceFlip}>
          <g fill="#8d887d" opacity={0.75} filter={`url(#${id}b)`}>
            {MARIA.map(([x, y, ex, ey, rot], i) => (
              <ellipse key={i} cx={x * r} cy={y * r} rx={ex * r} ry={ey * r} transform={`rotate(${rot} ${x * r} ${y * r})`} />
            ))}
          </g>
          <g stroke="#fbfaf5" strokeWidth={0.9} opacity={0.4}>
            {[0, 40, 75, 110, 150, 200, 250, 300].map((a) => {
              const t = (a * Math.PI) / 180;
              const [x, y] = [BRIGHT[0][0] * r, BRIGHT[0][1] * r];
              return <line key={a} x1={x} y1={y} x2={x + Math.cos(t) * r * 0.5} y2={y + Math.sin(t) * r * 0.5} />;
            })}
          </g>
          {BRIGHT.map(([x, y, cr], i) => <circle key={i} cx={x * r} cy={y * r} r={cr * r} fill="#fdfcf7" opacity={0.85} />)}
        </g>
        <path d={dark} transform={shadeFlip} fill="#0b1020" opacity={0.84} />
      </g>
      <circle r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={0.8} />
    </svg>
  );
}
