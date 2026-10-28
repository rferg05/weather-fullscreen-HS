import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PluginComponentProps } from '../hs-plugin';
import { hostFrameStyle } from '../host-style';
import { readConfig } from './config';
import type { Config } from './config';
import { dayPhase, dayProgress, moonPass, moonPhase, moonPhaseName, nextSunrise, todaysSunTimes } from './astro';
import type { SunTimes } from './astro';
import { MoonGlyph, PhaseIcon, SunHorizonGlyph } from './icons';

/** The manifest's default text size, which every proportion below is tuned to. */
const BASE_FONT_SIZE = 18;
/** With "Grow text with the module" on, the text tracks the module's size
 *  (whichever of these runs out first), never dropping below Text size. */
const AUTO_FS_OF_HEIGHT = 0.062;
const AUTO_FS_OF_WIDTH = 0.036;
const GOLDEN = '#fb923c';
const MOON_PALE = '#e2e8f0';

// ── Formatting ──────────────────────────────────────────────────────────────

interface ClockText { main: string; period: string }

function clockFormatter(config: Config, hostFormat: '12h' | '24h' | undefined, timezone: string | undefined, seconds: boolean) {
  const fmt = config.timeFormat === 'auto' ? hostFormat : config.timeFormat;
  const opts: Intl.DateTimeFormatOptions = {
    hour: 'numeric', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}),
    ...(fmt ? { hour12: fmt === '12h' } : {}),
  };
  let f: Intl.DateTimeFormat;
  try {
    f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: timezone || undefined });
  } catch {
    f = new Intl.DateTimeFormat('en-US', opts);
  }
  return (ms: number): ClockText => {
    const v: Record<string, string> = {};
    for (const p of f.formatToParts(new Date(ms))) v[p.type] = p.value;
    const hour = v.dayPeriod ? v.hour : v.hour.padStart(2, '0');
    const main = `${hour}:${v.minute}${seconds ? `:${v.second}` : ''}`;
    return { main, period: v.dayPeriod ?? '' };
  };
}

/** A rough width in em for the layout, close enough for Inter and the
 *  system stacks: digits are tabular, colons and spaces narrow. */
function widthEm(text: string): number {
  let w = 0;
  for (const ch of text) w += /[0-9]/.test(ch) ? 0.6 : ch === ':' ? 0.3 : ch === ' ' ? 0.28 : 0.7;
  return w;
}

/** "1h 57m", or "42m" under an hour. */
function duration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

// ── Ticking ─────────────────────────────────────────────────────────────────

/** Now, re-read on each second or minute boundary so the clock flips on time. */
function useNow(stepMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => { setNow(Date.now()); schedule(); }, stepMs - (Date.now() % stepMs) + 20);
    };
    setNow(Date.now());
    schedule();
    return () => clearTimeout(timer);
  }, [stepMs]);
  return now;
}

function useBoxSize() {
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

// ── Module ──────────────────────────────────────────────────────────────────

export default function SunClock(props: PluginComponentProps) {
  const { style, timezone } = props;
  const config = useMemo(() => readConfig(props.config ?? {}), [props.config]);
  const now = useNow(config.showClock && config.showSeconds ? 1000 : 60_000);
  const { ref, w, h } = useBoxSize();

  const host = window.__HS_SDK__?.getHostSettings?.();
  const lat = typeof props.latitude === 'number' ? props.latitude : host?.latitude ?? null;
  const lng = typeof props.longitude === 'number' ? props.longitude : host?.longitude ?? null;
  const hasLocation = typeof lat === 'number' && typeof lng === 'number';

  const clock = useMemo(() => clockFormatter(config, props.timeFormat, timezone, config.showClock && config.showSeconds),
    [config, props.timeFormat, timezone]);
  const shortTime = useMemo(() => clockFormatter(config, props.timeFormat, timezone, false),
    [config, props.timeFormat, timezone]);

  const times: SunTimes | null = hasLocation ? todaysSunTimes(now, lat, lng, timezone) : null;
  const phase = times ? dayPhase(now, times, config.phaseWindow * 60_000) : 'night';
  const progress = times ? dayProgress(now, times) : null;
  const moon = moonPhase(now).phase;

  const fmtSun = (ms: number | null | undefined) => {
    if (ms == null) return '--:--';
    const t = shortTime(ms);
    return t.period ? `${t.main} ${t.period}` : t.main;
  };

  // Golden hour: the stretches after sunrise and before sunset with the sun
  // under 6 degrees, as fractions of the day's arc.
  let golden: [number, number] | null = null;
  if (config.showGoldenHour && hasLocation && times?.sunrise != null && times.sunset != null) {
    const g = todaysSunTimes(now, lat, lng, timezone, 6);
    const len = times.sunset - times.sunrise;
    if (g.sunrise != null && g.sunset != null && len > 0) {
      golden = [(g.sunrise - times.sunrise) / len, (g.sunset - times.sunrise) / len];
    }
  }

  // After dark the arc follows the moon: its rise, set and place in the sky.
  const pass = progress == null && config.nightArc && hasLocation ? moonPass(now, lat, lng) : null;
  const night = pass ? {
    progress: pass.up && pass.rise != null && pass.set != null ? (now - pass.rise) / (pass.set - pass.rise) : null,
    phaseName: moonPhaseName(moon),
  } : null;

  let countdown: string | null = null;
  if (config.showCountdown && hasLocation && times && !times.polar) {
    if (progress != null && times.sunset != null) {
      countdown = `Sunset in ${duration(times.sunset - now)}`;
    } else {
      const next = nextSunrise(now, lat, lng, timezone);
      if (next != null) countdown = `Sunrise in ${duration(next - now)}`;
    }
  }

  const fsBase = Number.isFinite(style.fontSize) && style.fontSize > 0 ? style.fontSize : BASE_FONT_SIZE;
  const fs = config.autoSize ? Math.max(fsBase, Math.min(h * AUTO_FS_OF_HEIGHT, w * AUTO_FS_OF_WIDTH)) : fsBase;

  return (
    <div style={hostFrameStyle(style, { baseFontSize: BASE_FONT_SIZE })}>
      <div ref={ref} style={{ width: '100%', height: '100%', position: 'relative' }}>
        {w > 0 && h > 0 && (
          <Scene
            w={w} h={h} fs={fs}
            config={config} clock={config.showClock ? clock(now) : null}
            rise={fmtSun(night ? pass!.rise : times?.sunrise)} set={fmtSun(night ? pass!.set : times?.sunset)}
            progress={progress} phase={phase} moon={moon} mirrorMoon={hasLocation && lat < 0}
            notice={hasLocation ? null : 'Set a location in Settings'}
            golden={golden} night={night} countdown={countdown}
          />
        )}
      </div>
    </div>
  );
}

interface SceneProps {
  w: number; h: number; fs: number; config: Config;
  clock: ClockText | null; rise: string; set: string;
  progress: number | null; phase: ReturnType<typeof dayPhase>; moon: number; mirrorMoon: boolean;
  notice: string | null;
  /** Golden hour as fractions of the day's arc: [morning ends, evening starts]. */
  golden: [number, number] | null;
  /** Set after dark when the arc follows the moon. */
  night: { progress: number | null; phaseName: string } | null;
  countdown: string | null;
}

function Scene({ w, h, fs, config, clock, rise, set, progress, phase, moon, mirrorMoon, notice, golden, night, countdown }: SceneProps) {
  const glowId = `${useId().replace(/:/g, '')}-glow`;

  // ── Bottom row: the rise and set blocks under the arc's two feet.
  const timeFs = fs * 1.35;
  const labelFs = fs * 0.9;
  const blockH = timeFs * 1.05 + (config.showLabels ? labelFs * 1.35 : 0);
  const below = fs * 0.45;
  const horizonY = h - blockH - below;
  const iconSize = config.showSideIcons ? blockH * 0.95 : 0;
  const iconGap = config.showSideIcons ? fs * 0.4 : 0;
  const textW = Math.max(widthEm(rise), widthEm(set)) * timeFs;

  // ── The arc: as wide as the blocks allow, as tall as the space above the horizon.
  const strokeW = Math.max(2, fs * 0.3);
  // At night the moon rides the arc's top, so its phase name sits higher to clear it.
  const topSpace = notice ? fs * 1.8
    : night ? (config.showNoon && config.showMoonName ? fs * 2.7 : fs * 1.1)
    : config.showNoon ? fs * 1.8 : strokeW + fs * 0.3;
  const R = Math.max(4, Math.min(w / 2 - textW / 2 - iconGap - iconSize - 2, horizonY - topSpace));
  const cx = w / 2;
  const top = horizonY - R;

  // ── The sun's place on the arc (the moon's, after dark).
  const at = (f: number) => ({ x: cx - R * Math.cos(Math.PI * f), y: horizonY - R * Math.sin(Math.PI * f) });
  const body = night ? night.progress : progress;
  const sun = body == null ? null : at(Math.min(1, Math.max(0, body)));
  const travelled = night ? MOON_PALE : config.accentColor;
  const segment = (a: number, b: number) => {
    const p0 = at(a);
    const p1 = at(b);
    return `M${p0.x} ${p0.y}A${R} ${R} 0 0 1 ${p1.x} ${p1.y}`;
  };

  // ── The clock, sized to sit inside the arc above the horizon.
  let clockEl: React.ReactNode = null;
  let clockTop = horizonY - R * 0.35;
  if (clock) {
    const periodScale = 0.42;
    const em = widthEm(clock.main) + (clock.period ? widthEm(` ${clock.period}`) * periodScale : 0);
    const size = Math.min(R * 0.4 * config.clockScale, (R * 1.5) / em);
    const baseline = horizonY - Math.max(fs * 0.45, R * 0.14);
    clockTop = baseline - size * 0.78;
    clockEl = (
      <text x={cx} y={baseline} textAnchor="middle" fontSize={size} fontWeight={300}
        style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
        {clock.main}
        {clock.period && <tspan fontSize={size * periodScale} fontWeight={400} dx={size * 0.12} opacity={0.75}>{clock.period}</tspan>}
      </text>
    );
  }

  // ── The phase icon, centered under the horizon.
  // A little taller than the space under the horizon, so it rides up just
  // over the line the way the sun sits on it.
  const iconD = Math.min((blockH + below) * 1.4 * config.phaseIconScale, R * 0.7);
  const iconCy = h - iconD / 2;

  const timeY = horizonY + below + timeFs * 0.85;
  const labelY = timeY + labelFs * 1.35;
  const iconY = horizonY + below + (blockH - iconSize) / 2;
  const showArrows = !config.showSideIcons;
  const halfLine = R + fs * 1.4;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="currentColor"
      style={{ display: 'block', overflow: 'visible', filter: config.softShadow ? 'drop-shadow(0 1px 3px rgba(0, 0, 0, 0.55))' : undefined }}>
      <defs>
        <radialGradient id={glowId}>
          <stop offset="0" stopColor={config.accentColor} stopOpacity={0.55} />
          <stop offset="1" stopColor={config.accentColor} stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Horizon */}
      <line x1={Math.max(0, cx - halfLine)} x2={Math.min(w, cx + halfLine)} y1={horizonY} y2={horizonY}
        stroke="currentColor" strokeOpacity={0.5} strokeWidth={Math.max(1, fs * 0.09)} />

      {/* Golden hour: a wide warm band under the first and last stretch of the arc. */}
      {golden && !night && golden[0] > 0 && golden[1] < 1 && golden[0] < golden[1] && (
        <g fill="none" stroke={GOLDEN} strokeOpacity={0.65} strokeWidth={strokeW * 2.8}>
          <path d={segment(0, golden[0])} />
          <path d={segment(golden[1], 1)} />
        </g>
      )}

      {/* The day's path, dotted, with the part already travelled drawn solid. */}
      <path d={`M${cx - R} ${horizonY}A${R} ${R} 0 0 1 ${cx + R} ${horizonY}`} fill="none"
        stroke="currentColor" strokeOpacity={0.45} strokeWidth={strokeW}
        strokeDasharray={`${strokeW * 1.5} ${strokeW * 1.4}`} />
      {sun && config.showSunOnArc && (
        <path d={`M${cx - R} ${horizonY}A${R} ${R} 0 0 1 ${sun.x} ${sun.y}`} fill="none"
          stroke={travelled} strokeOpacity={0.85} strokeWidth={strokeW} strokeLinecap="round" />
      )}

      {/* Noon by day; tonight's moon phase by night. */}
      {config.showNoon && !notice && !night && (
        <g opacity={0.8}>
          <line x1={cx} x2={cx} y1={top - fs * 0.5} y2={top + fs * 0.5} stroke="currentColor" strokeWidth={Math.max(1, fs * 0.1)} />
          <text x={cx} y={top - fs * 0.8} textAnchor="middle" fontSize={fs}>noon</text>
        </g>
      )}
      {config.showNoon && config.showMoonName && !notice && night && (
        <text x={cx} y={top - fs * 1.7} textAnchor="middle" fontSize={fs} opacity={0.85}>{night.phaseName}</text>
      )}
      {notice && <text x={cx} y={top - fs * 0.8} textAnchor="middle" fontSize={fs} opacity={0.85}>{notice}</text>}

      {countdown && (
        <text x={cx} y={clockTop - fs * 0.35} textAnchor="middle" fontSize={fs * 1.15} opacity={0.9}
          style={{ fontVariantNumeric: 'tabular-nums' }}>{countdown}</text>
      )}

      {clockEl}

      {sun && config.showSunOnArc && !night && (
        <g>
          <circle cx={sun.x} cy={sun.y} r={fs * 1.5} fill={`url(#${glowId})`} />
          <circle cx={sun.x} cy={sun.y} r={fs * 0.55} fill={config.accentColor} />
        </g>
      )}
      {sun && config.showSunOnArc && night && (
        <g transform={`translate(${sun.x} ${sun.y})`}>
          <circle r={fs * 1.4} fill={MOON_PALE} opacity={0.18} />
          <MoonGlyph phase={moon} r={fs * 0.75} iconStyle={config.iconStyle} mirror={mirrorMoon} />
        </g>
      )}

      {/* Sunrise, left */}
      <g>
        <text x={cx - R} y={timeY} textAnchor="middle" fontSize={timeFs} style={{ fontVariantNumeric: 'tabular-nums' }}>{rise}</text>
        {config.showLabels && (
          <text x={cx - R} y={labelY} textAnchor="middle" fontSize={labelFs} opacity={0.8}>{`${showArrows ? '↑ ' : ''}${night ? 'moonrise' : 'rise'}`}</text>
        )}
        {config.showSideIcons && (
          <svg x={cx - R - textW / 2 - iconGap - iconSize} y={iconY} width={iconSize} height={iconSize}
            viewBox={night ? '-12 -12 24 24' : '0 0 24 24'} overflow="visible">
            {night
              ? <MoonGlyph phase={moon} r={8} iconStyle={config.iconStyle} mirror={mirrorMoon} />
              : <SunHorizonGlyph direction="up" iconStyle={config.iconStyle} />}
          </svg>
        )}
      </g>

      {/* Sunset, right */}
      <g>
        <text x={cx + R} y={timeY} textAnchor="middle" fontSize={timeFs} style={{ fontVariantNumeric: 'tabular-nums' }}>{set}</text>
        {config.showLabels && (
          <text x={cx + R} y={labelY} textAnchor="middle" fontSize={labelFs} opacity={0.8}>{`${night ? 'moonset' : 'set'}${showArrows ? ' ↓' : ''}`}</text>
        )}
        {config.showSideIcons && (
          <svg x={cx + R + textW / 2 + iconGap} y={iconY} width={iconSize} height={iconSize}
            viewBox={night ? '-12 -12 24 24' : '0 0 24 24'} overflow="visible">
            {night
              ? <MoonGlyph phase={moon} r={8} iconStyle={config.iconStyle} mirror={mirrorMoon} />
              : <SunHorizonGlyph direction="down" iconStyle={config.iconStyle} />}
          </svg>
        )}
      </g>

      {config.showPhaseIcon && iconD > 4 && (
        <PhaseIcon cx={cx} cy={iconCy} d={iconD} phase={phase} moon={moon}
          iconStyle={config.iconStyle} backdrop={config.iconBackdrop} mirrorMoon={mirrorMoon} />
      )}
    </svg>
  );
}
