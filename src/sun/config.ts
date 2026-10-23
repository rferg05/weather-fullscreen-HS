import type { Backdrop, IconStyle } from './icons';

export interface Config {
  showClock: boolean;
  showSeconds: boolean;
  timeFormat: 'auto' | '12h' | '24h';
  clockScale: number;
  showPhaseIcon: boolean;
  phaseWindow: number;
  phaseIconScale: number;
  iconBackdrop: Backdrop;
  showSideIcons: boolean;
  iconStyle: IconStyle;
  showLabels: boolean;
  showNoon: boolean;
  showSunOnArc: boolean;
  accentColor: string;
  softShadow: boolean;
  autoSize: boolean;
  showGoldenHour: boolean;
  nightArc: boolean;
  showCountdown: boolean;
}

export const DEFAULTS: Config = {
  showClock: true,
  showSeconds: false,
  timeFormat: 'auto',
  clockScale: 1,
  showPhaseIcon: true,
  phaseWindow: 45,
  phaseIconScale: 1,
  iconBackdrop: 'sky',
  showSideIcons: true,
  iconStyle: 'color',
  showLabels: true,
  showNoon: true,
  showSunOnArc: true,
  accentColor: '#fbbf24',
  softShadow: true,
  autoSize: true,
  showGoldenHour: true,
  nightArc: true,
  showCountdown: true,
};

const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : fallback);

function num(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function oneOf<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return options.includes(v as T) ? (v as T) : fallback;
}

/** The module's config with every field present and in range, whatever the
 *  host hands over (older saves, hand-edited JSON, preview query strings). */
export function readConfig(raw: Record<string, unknown>): Config {
  return {
    showClock: bool(raw.showClock, DEFAULTS.showClock),
    showSeconds: bool(raw.showSeconds, DEFAULTS.showSeconds),
    timeFormat: oneOf(raw.timeFormat, ['auto', '12h', '24h'] as const, DEFAULTS.timeFormat),
    clockScale: num(raw.clockScale, 0.4, 1.6, DEFAULTS.clockScale),
    showPhaseIcon: bool(raw.showPhaseIcon, DEFAULTS.showPhaseIcon),
    phaseWindow: num(raw.phaseWindow, 5, 180, DEFAULTS.phaseWindow),
    phaseIconScale: num(raw.phaseIconScale, 0.5, 1.5, DEFAULTS.phaseIconScale),
    iconBackdrop: oneOf(raw.iconBackdrop, ['sky', 'plain', 'none'] as const, DEFAULTS.iconBackdrop),
    showSideIcons: bool(raw.showSideIcons, DEFAULTS.showSideIcons),
    iconStyle: oneOf(raw.iconStyle, ['color', 'line'] as const, DEFAULTS.iconStyle),
    showLabels: bool(raw.showLabels, DEFAULTS.showLabels),
    showNoon: bool(raw.showNoon, DEFAULTS.showNoon),
    showSunOnArc: bool(raw.showSunOnArc, DEFAULTS.showSunOnArc),
    accentColor: typeof raw.accentColor === 'string' && raw.accentColor ? raw.accentColor : DEFAULTS.accentColor,
    softShadow: bool(raw.softShadow, DEFAULTS.softShadow),
    autoSize: bool(raw.autoSize, DEFAULTS.autoSize),
    showGoldenHour: bool(raw.showGoldenHour, DEFAULTS.showGoldenHour),
    nightArc: bool(raw.nightArc, DEFAULTS.nightArc),
    showCountdown: bool(raw.showCountdown, DEFAULTS.showCountdown),
  };
}
