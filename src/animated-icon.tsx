// The current-weather icon, gently animated: the colour icons from
// color-icons.tsx with turning rays, drifting clouds, and falling rain and
// snow. CSS animations on a few small SVG shapes only, so it costs next to
// nothing, unlike the full-screen sky it replaced.

import React, { useId } from 'react';
import type { CSSProperties } from 'react';

const CSS = `
@keyframes wfa-spin { to { transform: rotate(360deg); } }
@keyframes wfa-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
@keyframes wfa-drift { 0%, 100% { transform: translateX(-1.5px); } 50% { transform: translateX(1.5px); } }
@keyframes wfa-rock { 0%, 100% { transform: rotate(-5deg); } 50% { transform: rotate(5deg); } }
@keyframes wfa-fall { 0% { transform: translateY(-5px); opacity: 0; } 20% { opacity: 1; } 80% { opacity: 1; } 100% { transform: translateY(7px); opacity: 0; } }
@keyframes wfa-flake { 0% { transform: translate(0, -5px); opacity: 0; } 20% { opacity: 1; } 50% { transform: translate(2px, 1px); } 80% { opacity: 1; } 100% { transform: translate(-1px, 8px); opacity: 0; } }
@keyframes wfa-flash { 0%, 80%, 86%, 100% { opacity: 1; } 83% { opacity: 0.15; } 89% { opacity: 0.35; } 92% { opacity: 1; } }
@keyframes wfa-slide { 0%, 100% { transform: translateX(-3px); } 50% { transform: translateX(3px); } }
.wfa-a { transform-box: fill-box; transform-origin: center; }
`;

let injected = false;
function useStyles() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const el = document.createElement('style');
  el.textContent = CSS;
  document.head.appendChild(el);
}

const anim = (name: string, seconds: number, delay = 0, timing = 'ease-in-out'): CSSProperties =>
  ({ animation: `wfa-${name} ${seconds}s ${timing} ${delay}s infinite` });

const Cloud = ({ y = 0 }: { y?: number }) => (
  <g transform={`translate(0 ${y})`}>
    <g className="wfa-a" style={anim('drift', 6)}>
      <ellipse cx="32" cy="38" rx="18" ry="10" fill="#B0BEC5" />
      <circle cx="24" cy="30" r="10" fill="#B0BEC5" />
      <circle cx="36" cy="26" r="12" fill="#CFD8DC" />
      <circle cx="28" cy="28" r="9" fill="#CFD8DC" />
    </g>
  </g>
);

const Sun = ({ uid, cx, cy, r, rays, ray }: { uid: string; cx: number; cy: number; r: number; rays: number; ray: [number, number] }) => (
  <>
    <defs>
      <radialGradient id={`${uid}-sun`}>
        <stop offset="0%" stopColor="#FFE066" />
        <stop offset="100%" stopColor="#FFA726" />
      </radialGradient>
    </defs>
    <g style={{ ...anim('spin', 24, 0, 'linear'), transformOrigin: `${cx}px ${cy}px` }}>
      {Array.from({ length: rays }, (_, i) => (360 / rays) * i).map((deg) => (
        <line key={deg} x1={cx} y1={cy - r - ray[1]} x2={cx} y2={cy - r - ray[0]}
          stroke="#FFA726" strokeWidth={rays > 6 ? 3 : 2.5} strokeLinecap="round" transform={`rotate(${deg} ${cx} ${cy})`} />
      ))}
    </g>
    <circle className="wfa-a" style={anim('pulse', 4)} cx={cx} cy={cy} r={r} fill={`url(#${uid}-sun)`} />
  </>
);

const Moon = ({ uid, d }: { uid: string; d: string }) => (
  <>
    <defs>
      <radialGradient id={`${uid}-moon`} cx="40%" cy="40%">
        <stop offset="0%" stopColor="#F0E6D3" />
        <stop offset="100%" stopColor="#C9B99A" />
      </radialGradient>
    </defs>
    <path className="wfa-a" style={anim('rock', 8)} d={d} fill={`url(#${uid}-moon)`} />
  </>
);

const Drops = ({ heavy }: { heavy: boolean }) => (
  <>
    {(heavy
      ? [{ x: 22, d: 10 }, { x: 30, d: 13 }, { x: 38, d: 11 }, { x: 26, d: 8 }, { x: 34, d: 9 }]
      : [{ x: 24, d: 10 }, { x: 32, d: 12 }, { x: 40, d: 9 }]
    ).map(({ x, d }, i, all) => (
      <line key={i} x1={x} y1={46} x2={x - 2} y2={46 + d}
        stroke={heavy ? '#2196F3' : '#64B5F6'} strokeWidth={heavy ? 2.5 : 2} strokeLinecap="round"
        style={anim('fall', heavy ? 0.9 : 1.3, -(i / all.length) * (heavy ? 0.9 : 1.3), 'linear')} />
    ))}
  </>
);

const Pellets = ({ r, fill, stroke, seconds }: { r: number; fill: string; stroke?: string; seconds: number }) => (
  <>
    {[{ x: 24, y: 46 }, { x: 34, y: 50 }, { x: 40, y: 44 }, { x: 28, y: 52 }].map(({ x, y }, i) => (
      <circle key={i} cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth={stroke ? 0.5 : undefined}
        style={anim(stroke ? 'fall' : 'flake', seconds, -i * (seconds / 4), 'linear')} />
    ))}
  </>
);

function art(id: string, uid: string): React.ReactNode {
  switch (id) {
    case 'sun': return <Sun uid={uid} cx={32} cy={32} r={14} rays={8} ray={[4, 10]} />;
    case 'moon': return <Moon uid={uid} d="M38 12a20 20 0 1 0 14 34A22 22 0 0 1 38 12z" />;
    case 'cloud': return <Cloud />;
    case 'cloud-sun': return <><Sun uid={uid} cx={46} cy={18} r={10} rays={6} ray={[1, 4]} /><Cloud y={4} /></>;
    case 'cloud-moon': return <><Moon uid={uid} d="M50 8a12 12 0 1 0 8 20A13 13 0 0 1 50 8z" /><Cloud y={4} /></>;
    // Rain and snow are drawn first, so they come out from under the cloud.
    case 'cloud-rain': return <><Drops heavy /><Cloud y={-2} /></>;
    case 'cloud-drizzle': return <><Drops heavy={false} /><Cloud y={-2} /></>;
    case 'cloud-snow': return <><Pellets r={2} fill="#E3F2FD" seconds={2.6} /><Cloud y={-4} /></>;
    case 'cloud-hail': return <><Pellets r={2.5} fill="#B3E5FC" stroke="#81D4FA" seconds={1} /><Cloud y={-4} /></>;
    case 'cloud-lightning': return (
      <>
        <Cloud y={-4} />
        <polygon points="34,40 28,50 32,50 28,58 38,48 34,48 38,40" fill="#FFD54F" style={anim('flash', 3.5, 0, 'linear')} />
      </>
    );
    case 'cloud-fog': return (
      <>
        <Cloud y={-6} />
        {[42, 48, 54].map((y, i) => (
          <line key={i} x1="16" y1={y} x2="48" y2={y} stroke="#B0BEC5" strokeWidth="2.5" strokeLinecap="round"
            opacity={0.7 - i * 0.15} style={anim('slide', 5, -i * 1.6)} />
        ))}
      </>
    );
    case 'snowflake': return (
      <g style={{ ...anim('spin', 30, 0, 'linear'), transformOrigin: '32px 32px' }}>
        {[0, 60, 120].map((deg) => (
          <g key={deg} transform={`rotate(${deg} 32 32)`} stroke="#90CAF9" strokeLinecap="round">
            <line x1="32" y1="10" x2="32" y2="54" strokeWidth="3" />
            <line x1="32" y1="16" x2="26" y2="12" strokeWidth="2" />
            <line x1="32" y1="16" x2="38" y2="12" strokeWidth="2" />
            <line x1="32" y1="48" x2="26" y2="52" strokeWidth="2" />
            <line x1="32" y1="48" x2="38" y2="52" strokeWidth="2" />
          </g>
        ))}
      </g>
    );
    default: return null;
  }
}

/** The animated icon for a host weather icon id, or null for an id it doesn't draw. */
export function AnimatedWeatherIcon({ id, size, style }: { id: string; size: string | number; style?: CSSProperties }) {
  useStyles();
  const uid = useId().replace(/:/g, '');
  const body = art(id, uid);
  if (!body) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true"
      style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}>
      {body}
    </svg>
  );
}
