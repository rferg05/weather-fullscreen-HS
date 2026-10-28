import React, { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowUp, Droplets, Leaf, TriangleAlert, Umbrella, CircleCheck, Snowflake, Wind, Sun as SunIcon, CalendarDays, CloudLightning, CloudHail, Thermometer, Shirt, Hourglass, Sparkles, Eclipse, Telescope, Rainbow } from 'lucide-react';
import type { PluginComponentProps } from './hs-plugin';
import { hostFrameStyle } from './host-style';
import { colorIconComponents } from './color-icons';
import { useFitFontSize } from './fit';
import { HoursChart, RAIN_BLUE } from './chart';
import type { ChartHour } from './chart';
import { intensity, rainEvents, sharpSwings } from './rain';
import type { RainEvent } from './rain';
import { useAirQuality, usePrecip } from './openmeteo';
import type { Falling } from './openmeteo';
import { RadarMap, useRadarIndex } from './radar';
import LivingSky from './sky/LivingSky';
import { plotScene, skyScene, sunPhase } from './sky/sky-layer';
import { sunAltitude, todaysSunTimes, moonPhase, moonPhaseName, moonPass } from './sun/astro';
import type { SunTimes } from './sun/astro';
import SunClock from './sun/index';
import { MoonPicture } from './moon-picture';
import { auroraEvent, cometEvents, eclipseEvents, meteorEvents, useComets, useKpForecast } from './skyevents';
import type { SkyEvent, SkyFormat, SkyKind } from './skyevents';

// ── Data the host injects when dataRequirements includes "weather" ──

interface HourlyWeather {
  time: string;
  temp: number;
  feelsLike?: number;
  humidity?: number;
  windSpeed?: number;
  windDirection?: number;
  windGust?: number;
  uvIndex?: number;
  icon: string;
  description: string;
  precipProbability?: number;
}

interface ForecastDay {
  date: string;
  high: number;
  low: number;
  icon: string;
  description: string;
  precipProbability?: number;
  precipAmount?: number;
}

interface MinutelyPrecip { time: number; intensity: number; probability?: number }
interface WeatherAlert { title: string; severity: string; expires: number }

// ── Look ──

/** The root font on a full 1920x1080 module; everything is a multiple of it. */
const BASE_PX = 30;
const HOUR = 3_600_000;
const HIGH_ORANGE = '#fb923c';
const LOW_BLUE = '#60a5fa';
const SEVERITY_COLOR: Record<string, string> = {
  Extreme: '#b91c1c', Severe: '#dc2626', Moderate: '#d97706', Minor: '#a16207', Unknown: '#475569',
};
const SKY_STYLE: Record<SkyKind, [string, React.ComponentType<{ size?: string; strokeWidth?: number; color?: string; style?: CSSProperties }>]> = {
  eclipse: ['#fbbf24', Eclipse], meteor: ['#a5b4fc', Sparkles], comet: ['#67e8f9', Telescope], aurora: ['#4ade80', Rainbow],
};
/** Eclipse searches take a moment, so they run once an hour per place. */
let eclipseCache: { key: string; events: SkyEvent[] } | null = null;
const SEVERITY_RANK: Record<string, number> = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };

const TEMP_STOPS: Array<[number, [number, number, number]]> = [
  [15, [165, 180, 252]], [32, [125, 211, 252]], [50, [94, 234, 212]],
  [62, [190, 242, 100]], [72, [253, 224, 71]], [82, [251, 146, 60]], [95, [248, 113, 113]],
];

function tempColor(t: number, metric: boolean): string {
  const f = metric ? t * 9 / 5 + 32 : t;
  if (f <= TEMP_STOPS[0][0]) return `rgb(${TEMP_STOPS[0][1].join(',')})`;
  for (let i = 1; i < TEMP_STOPS.length; i++) {
    const [t1, c1] = TEMP_STOPS[i];
    if (f <= t1) {
      const [t0, c0] = TEMP_STOPS[i - 1];
      const k = (f - t0) / (t1 - t0);
      return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * k)).join(',')})`;
    }
  }
  return `rgb(${TEMP_STOPS[TEMP_STOPS.length - 1][1].join(',')})`;
}

/** Colour accents for the stat icons, the card headings and the date. */
const WIND_TEAL = '#2dd4bf';
const HUMID_BLUE = '#38bdf8';
const UV_AMBER = '#fbbf24';
const HOURS_SKY = '#7dd3fc';
const WEEK_VIOLET = '#c4b5fd';
const SNOW_ICE = '#bae6fd';
const SLEET_LILAC = '#a5b4fc';
const STORM_PURPLE = '#c084fc';

/** What falls, from the provider's icon, for when Open-Meteo is off. */
function fallingFromIcon(icon: string | undefined): Falling | null {
  switch (icon) {
    case 'cloud-snow': case 'snowflake': return 'snow';
    case 'cloud-lightning': return 'storm';
    case 'cloud-hail': return 'sleet';
    case 'cloud-rain': case 'cloud-drizzle': return 'rain';
    default: return null;
  }
}

/** A coloured line icon with a dark outline under it, so it reads over any
 *  sky or photo without a chip behind it. */
function OutlinedGlyph({ Glyph, color, size }: { Glyph: React.ComponentType<{ size?: string; strokeWidth?: number; color?: string; style?: CSSProperties }>; color: string; size: string }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0, width: size, height: size }} aria-hidden="true">
      <Glyph size={size} strokeWidth={4.6} color="rgba(2, 6, 23, 0.82)" style={{ position: 'absolute', inset: 0, overflow: 'visible' }} />
      <Glyph size={size} strokeWidth={2.4} color={color} style={{ position: 'absolute', inset: 0, overflow: 'visible', filter: 'drop-shadow(0 0.04em 0.08em rgba(0,0,0,0.55))' }} />
    </span>
  );
}

/** The EPA's AQI categories: name and colour. */
function aqiCategory(aqi: number): [string, string] {
  if (aqi <= 50) return ['Good', '#4ade80'];
  if (aqi <= 100) return ['Moderate', '#facc15'];
  if (aqi <= 150) return ['Unhealthy for sensitive groups', '#fb923c'];
  if (aqi <= 200) return ['Unhealthy', '#f87171'];
  if (aqi <= 300) return ['Very unhealthy', '#c084fc'];
  return ['Hazardous', '#e11d48'];
}

/** Alerts about the air rather than the weather. */
const AIR_ALERT = /air quality|air stagnation|smoke|ozone|particulate|pm2\.5|unhealthy air/i;

/** The WHO's UV levels: name and colour. */
function uvLevel(uv: number): [string, string] {
  if (uv < 3) return ['Low', '#4ade80'];
  if (uv < 6) return ['Moderate', '#facc15'];
  if (uv < 8) return ['High', '#fb923c'];
  if (uv < 11) return ['Very high', '#f87171'];
  return ['Extreme', '#c084fc'];
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [11, 18, 32];
  const s = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as [number, number, number];
}

// ── Helpers ──

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const deg = (v: number | undefined) => (typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v)}°` : '–');
const msOf = (t: number) => (t < 1e12 ? t * 1000 : t);

function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => { setNow(Date.now()); schedule(); }, 60_000 - (Date.now() % 60_000) + 50);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  return now;
}

function formatter(timezone: string | undefined, opts: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: timezone || undefined });
  } catch {
    return new Intl.DateTimeFormat('en-US', opts);
  }
}

/** The next hour's rain from minute-by-minute data, when the provider sends it. */
function nowcast(minutely: MinutelyPrecip[], now: number, metric: boolean): string | null {
  const wetAt = metric ? 0.1 : 0.004;
  const pts = minutely
    .filter((m) => m && typeof m.time === 'number' && typeof m.intensity === 'number')
    .map((m) => ({ t: msOf(m.time), wet: m.intensity >= wetAt && (m.probability == null || m.probability >= 30) }))
    .filter((m) => m.t >= now - 60_000)
    .sort((a, b) => a.t - b.t)
    .slice(0, 61);
  if (pts.length < 5 || !pts.some((m) => m.wet)) return null;
  const wetNow = pts[0].wet;
  const change = pts.findIndex((m) => m.wet !== wetNow);
  const mins = change < 0 ? 0 : Math.max(1, Math.round((pts[change].t - now) / 60_000));
  return wetNow ? (change < 0 ? 'Raining for at least the next hour' : `Rain stopping in ${mins} min`) : `Rain starting in ${mins} min`;
}

// ── Module ──

export default function WeatherFullScreen(props: PluginComponentProps) {
  const { config, style } = props;
  const p = props as PluginComponentProps & { weatherError?: unknown };
  const now = useMinuteClock();
  const metric = props.units === 'metric';
  const tz = props.timezone;
  const lat = props.latitude;
  const lng = props.longitude;

  // Settings
  const hoursShown = Math.round(Math.min(48, Math.max(12, num(config.hours, 36))));
  const awayOn = config.awayEnabled !== false;
  const awayStart = Math.round(num(config.awayStart, 8)) % 24;
  const awayEnd = Math.round(num(config.awayEnd, 18)) % 24;
  const rainLikely = Math.min(90, Math.max(10, num(config.rainLikely, 40)));
  const swingF = Math.max(3, num(config.swingThreshold, 10));
  const swingThreshold = metric ? swingF * 5 / 9 : swingF;
  const useOpenMeteo = config.useOpenMeteo !== false;
  const showSunCard = config.showSunCard !== false;
  const showArcClock = config.showArcClock !== false;
  const showArcCountdown = config.showArcCountdown === true;
  const showGoTips = config.showGoTips !== false;
  const showSunDetails = config.showSunDetails !== false;
  const livingSky = config.livingSky !== false;
  const skyOn = config.showSkyEvents !== false;
  const skyEclipses = skyOn && config.skyEclipses !== false;
  const skyMeteors = skyOn && config.skyMeteors !== false;
  const skyComets = skyOn && config.skyComets !== false;
  const skyAurora = skyOn && config.skyAurora !== false;
  const cometMag = Math.min(10, Math.max(3, num(config.cometMagnitude, 7)));
  const radarOn = config.showRadar !== false;
  const radarLead = Math.min(12, Math.max(1, num(config.radarLeadHours, 3)));
  const radarSeconds = Math.min(120, Math.max(8, num(config.radarSeconds, 20)));
  const radarZoom = Math.round(Math.min(10, Math.max(5, num(config.radarZoom, 7))));
  const textScale = Math.min(1.6, Math.max(0.6, num(config.textScale, 1)));
  const accent = typeof config.accentColor === 'string' && config.accentColor ? config.accentColor : '#fbbf24';
  const cardRgb = hexToRgb(typeof config.cardColor === 'string' ? config.cardColor : '#0b1220');
  const cardBlur = Math.max(0, num(config.cardBlur, 0));
  const borderW = Math.max(0, num(config.cardBorderWidth, 0));
  const borderColor = typeof config.cardBorderColor === 'string' ? config.cardBorderColor : '#64748b';
  const textShadow = config.textShadow !== false;
  const strength = (key: string) => Math.min(100, Math.max(0, num(config[key], 55))) / 100;
  const timeFormat = config.timeFormat === '12h' || config.timeFormat === '24h' ? config.timeFormat : props.timeFormat;
  const h12 = timeFormat ? timeFormat !== '24h' : undefined;

  const precip = usePrecip(useOpenMeteo, lat, lng, metric);
  const airOn = config.showAirQuality !== false;
  const aqiAt = Math.min(300, Math.max(51, num(config.aqiThreshold, 151)));
  const aqi = useAirQuality(airOn, lat, lng);

  // What's on screen changes after the first render (an alert, a sky event,
  // new outlook text); the render records it here and the fit restarts.
  const contentRef = useRef('');
  const [contentKey, setContentKey] = useState('');
  useEffect(() => {
    if (contentRef.current !== contentKey) setContentKey(contentRef.current);
  });
  const { boxRef, fontSize: fs } = useFitFontSize(
    (w, h) => (w && h ? BASE_PX * Math.min(w / 1920, h / 1080) * textScale : BASE_PX * textScale),
    [hoursShown, showSunCard, awayOn, textScale, style.padding, style.fontFamily, contentKey].join('|'),
  );

  // ── Formatting ──
  const fHour = formatter(tz, { hour: 'numeric', hour12: h12 });
  const fClock = formatter(tz, { hour: 'numeric', minute: '2-digit', hour12: h12 });
  const fDate = formatter(tz, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const fWeekday = formatter(tz, { weekday: 'short' });
  const fLongDate = formatter(tz, { weekday: 'long', month: 'long', day: 'numeric' });
  const fLocalHour = formatter(tz, { hour: 'numeric', hourCycle: 'h23' });
  const localDate = (t: number) => {
    const v: Record<string, string> = {};
    for (const part of fDate.formatToParts(t)) v[part.type] = part.value;
    return `${v.year}-${v.month}-${v.day}`;
  };
  const localHour = (t: number) => Number(fLocalHour.format(t)) % 24;
  /** "3 PM", or "3:30 PM" off the hour; "15" / "15:30" in 24-hour. */
  const timeLabel = (t: number) => {
    const s = new Date(t).getMinutes() === 0 ? fHour.format(t) : fClock.format(t);
    return h12 === false ? s : s.replace(':00', '');
  };
  const shortHour = (t: number) => (h12 === false ? fHour.format(t) : fHour.format(t).replace(' AM', 'a').replace(' PM', 'p'));
  const today = localDate(now);
  const tomorrow = localDate(now + 24 * HOUR);
  const dayWord = (t: number) => {
    const d = localDate(t);
    return d === today ? '' : d === tomorrow ? 'Tomorrow' : fWeekday.format(t);
  };
  /** "this afternoon"-free day words for a sentence: "", "tonight",
   *  "tomorrow", or a weekday. */
  const whenWord = (t: number) => {
    const d = dayWord(t);
    if (d) return d === 'Tomorrow' ? 'tomorrow' : d;
    return localHour(t) >= 17 ? 'tonight' : '';
  };
  /** "tonight, 9 PM – 1 AM", "3 – 7 PM", "tomorrow, 2 – 6 AM". The end's day
   *  is only named for a spell running a day or more. */
  const range = (a: number, b: number) => {
    const prefix = whenWord(a);
    const left = timeLabel(a);
    const right = timeLabel(b);
    // "3 – 7 PM" when both ends share AM/PM.
    const tidy = h12 !== false && b - a < 12 * HOUR && left.slice(-2) === right.slice(-2) ? left.slice(0, -3) : left;
    const end = b - a >= 20 * HOUR ? `${dayWord(b) || 'today'} ${right}` : right;
    return `${prefix ? `${prefix}, ` : ''}${tidy} – ${end}`;
  };
  const amountUnit = metric ? 'mm' : 'in';
  const fmtAmount = (v: number) => (metric ? (v < 10 ? `${v.toFixed(1)} mm` : `${Math.round(v)} mm`) : v < 0.1 ? `${v.toFixed(2)} in` : `${v.toFixed(1)} in`);
  const fmtSnow = (v: number) => (metric ? `${v < 10 ? v.toFixed(1) : Math.round(v)} cm` : `${v < 1 ? v.toFixed(1) : Math.round(v)} in`);

  // ── Sun times, for night shading ──
  const sunCache = new Map<string, SunTimes>();
  const isNight = (t: number) => {
    if (typeof lat !== 'number' || typeof lng !== 'number') return false;
    const key = localDate(t);
    let s = sunCache.get(key);
    if (!s) { s = todaysSunTimes(t, lat, lng, tz); sunCache.set(key, s); }
    if (s.polar) return s.polar === 'night';
    return s.sunrise == null || s.sunset == null || t < s.sunrise || t >= s.sunset;
  };

  // ── The hours ahead ──
  const allHourly = (Array.isArray(props.hourly) ? props.hourly : []) as HourlyWeather[];
  const hourly = allHourly.filter((x) => {
    const t = Date.parse(x.time);
    return Number.isNaN(t) || t + HOUR > now;
  });
  const forecast = (Array.isArray(props.forecast) ? props.forecast : []) as ForecastDay[];
  const current = hourly[0];
  const todayFc = forecast.find((d) => d.date === today) ?? forecast[0];

  const chartHours: ChartHour[] = hourly.slice(0, hoursShown).map((x) => {
    const t = Math.floor(Date.parse(x.time) / HOUR) * HOUR;
    const om = precip?.hours.get(t);
    return {
      t,
      temp: x.temp,
      icon: x.icon,
      // One source for chance and amount, so the two always agree.
      prob: om ? om.prob : x.precipProbability ?? 0,
      rain: om ? om.rain : null,
      snow: om ? om.snow : null,
      falling: om ? om.falling : fallingFromIcon(x.icon),
      night: isNight(t + HOUR / 2),
    };
  });
  const events = rainEvents(chartHours, { likely: rainLikely, minAmount: metric ? 0.25 : 0.01 });
  const swings = sharpSwings(chartHours.map((x) => x.temp), swingThreshold);

  // Time out of the house, as windows over the hours shown.
  const isAwayHour = (t: number) => {
    const hr = localHour(t);
    return awayStart <= awayEnd ? hr >= awayStart && hr < awayEnd : hr >= awayStart || hr < awayEnd;
  };
  const away: Array<[number, number]> = [];
  if (awayOn && awayStart !== awayEnd) {
    for (const x of chartHours) {
      if (!isAwayHour(x.t)) continue;
      const last = away[away.length - 1];
      if (last && last[1] === x.t) last[1] = x.t + HOUR; else away.push([x.t, x.t + HOUR]);
    }
  }

  const alerts = (Array.isArray(props.alerts) ? props.alerts as WeatherAlert[] : [])
    .filter((a) => a && a.title && (!a.expires || msOf(a.expires) > now))
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4));
  const soon = Array.isArray(props.minutely) ? nowcast(props.minutely as MinutelyPrecip[], now, metric) : null;

  // The radar comes up when something is falling or due within the lead time,
  // or a weather warning is out, and then takes turns with the chart.
  const hasLocation = typeof lat === 'number' && typeof lng === 'number';
  const precipNear = events.some((e) => e.end > now && e.start < now + radarLead * HOUR) || (soon != null && !soon.startsWith('Rain stopping'));
  const weatherWarning = alerts.some((a) => !AIR_ALERT.test(a.title));
  const radarWanted = radarOn && hasLocation && (precipNear || weatherWarning);
  const radarIndex = useRadarIndex(radarWanted);
  const [radarTurn, setRadarTurn] = useState(false);
  useEffect(() => {
    if (!radarWanted) { setRadarTurn(false); return; }
    setRadarTurn(true);
    const timer = setInterval(() => setRadarTurn((v) => !v), radarSeconds * 1000);
    return () => clearInterval(timer);
  }, [radarWanted, radarSeconds]);
  const radarShowing = radarWanted && radarTurn;
  const comets = useComets(skyComets && showSunCard, cometMag);
  const kpRows = useKpForecast(skyAurora && showSunCard && typeof lat === 'number');
  // Several sky events take turns on one line.
  const [skyTurn, setSkyTurn] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSkyTurn((v) => v + 1), 9000);
    return () => clearInterval(timer);
  }, []);

  // ── Styles ──
  const shadow = textShadow ? `0 ${fs * 0.05}px ${fs * 0.14}px rgba(0, 0, 0, 0.6)` : undefined;
  const root: CSSProperties = {
    ...hostFrameStyle(style, { baseFontSize: BASE_PX }),
    fontSize: fs,
    lineHeight: 1.15,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6em',
    textShadow: shadow,
    ...(livingSky ? { position: 'relative', overflow: 'hidden', backgroundColor: '#151833' } : {}),
  };
  const card = (key: string): CSSProperties => ({
    overflow: 'hidden',
    background: `rgba(${cardRgb.join(',')}, ${strength(key)})`,
    backdropFilter: cardBlur > 0 ? `blur(${cardBlur}px)` : undefined,
    WebkitBackdropFilter: cardBlur > 0 ? `blur(${cardBlur}px)` : undefined,
    border: borderW > 0 ? `${borderW}px solid ${borderColor}` : undefined,
    borderRadius: '0.7em',
    padding: '0.7em 0.9em',
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  });
  const heading = (text: string, color: string, right?: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1em', flexShrink: 0, marginBottom: '0.35em' }}>
      <span style={{ fontSize: '0.72em', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color }}>{text}</span>
      {right}
    </div>
  );
  const Icon = ({ id, size }: { id: string; size: string | number }) => {
    const C = colorIconComponents[id] ?? colorIconComponents.thermometer;
    return <C size={size} strokeWidth={1.75} style={{ flexShrink: 0, overflow: 'visible', filter: textShadow ? `drop-shadow(0 ${fs * 0.04}px ${fs * 0.1}px rgba(0,0,0,0.5))` : undefined }} aria-hidden="true" />;
  };

  if (p.locationMissing || (hourly.length === 0 && forecast.length === 0)) {
    return (
      <div ref={boxRef} style={{ ...root, alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '1.4em' }}>
          {p.locationMissing ? 'Set your location in Settings > Location & language'
            : p.weatherError ? 'Weather unavailable' : 'Loading weather…'}
        </span>
      </div>
    );
  }

  // ── Now ──
  const swingSoon = swings.find((s) => chartHours[s.from].t < now + 12 * HOUR);
  /** A reading with its icon in its own colour. */
  const stat = (label: string, value: React.ReactNode, Glyph: React.ComponentType<{ size?: string; strokeWidth?: number; color?: string; style?: CSSProperties }>, color: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45em', minWidth: 0 }}>
      <OutlinedGlyph Glyph={Glyph} color={color} size="1.9em" />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontSize: '0.7em', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color }}>{label}</span>
        <span style={{ fontSize: '1.4em', fontWeight: 650, whiteSpace: 'nowrap' }}>{value}</span>
      </div>
    </div>
  );
  // Air quality earns a place only when it's bad: an air-quality alert, or
  // an AQI at or above the setting.
  const airAlert = alerts.find((a) => AIR_ALERT.test(a.title));
  const airBad = airOn && (airAlert != null || (aqi != null && aqi >= aqiAt));
  const airColor = aqi != null ? aqiCategory(aqi)[1] : '#fb923c';
  // "Before you go": what to bring, from the next 12 hours.
  const goTips = (() => {
    if (!showGoTips || !current) return '';
    const next12 = chartHours.filter((h) => h.t < now + 12 * HOUR);
    const lo = Math.min(current.temp, ...next12.map((h) => h.temp));
    const wet = next12.find((h) => h.prob >= rainLikely);
    const tips: string[] = [];
    tips.push(lo < (metric ? 4 : 40) ? 'Warm coat' : lo < (metric ? 12 : 55) ? 'Jacket' : lo < (metric ? 17 : 63) ? 'Light jacket' : 'No jacket');
    if (wet) {
      // Snow and ice call for boots rather than an umbrella.
      const gear = wet.falling === 'snow' || wet.falling === 'sleet' || wet.falling === 'freezing' || (wet.snow ?? 0) > 0 ? 'Boots' : 'Umbrella';
      tips.push(wet.t <= now + HOUR ? gear : `${gear} by ${timeLabel(wet.t)}`);
    }
    if ((current.uvIndex ?? 0) >= 6) tips.push('Sunscreen');
    return tips.join(' · ');
  })();
  const nowCard = (
    <div data-fit style={{ ...card('nowStrength'), justifyContent: 'space-between', gap: '0.25em' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4em', fontSize: '1.1em', fontWeight: 700, color: accent }}>
        <OutlinedGlyph Glyph={CalendarDays} color={accent} size="1em" />{fLongDate.format(now)}
      </span>
      {current && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3em' }}>
          <span style={{ fontSize: '5em', fontWeight: 300, lineHeight: 0.92, letterSpacing: '-0.03em' }}>{deg(current.temp)}</span>
          <Icon id={current.icon} size="3.8em" />
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2em' }}>
        {current && <span style={{ fontSize: '1.5em', fontWeight: 600, textTransform: 'capitalize' }}>{current.description}</span>}
        <span style={{ fontSize: '1.2em', whiteSpace: 'nowrap' }}>
          {todayFc && (
            <>
              <span style={{ color: HIGH_ORANGE, fontWeight: 700 }}>H</span> {deg(todayFc.high)}
              <span style={{ marginLeft: '0.6em', color: LOW_BLUE, fontWeight: 700 }}>L</span> {deg(todayFc.low)}
            </>
          )}
                  </span>
        {swingSoon && (
          <span style={{
            alignSelf: 'flex-start', marginTop: '0.2em', padding: '0.15em 0.55em', borderRadius: '0.4em', fontSize: '1.05em', fontWeight: 800,
            background: swingSoon.delta < 0 ? '#7dd3fc' : '#fdba74', color: '#0f172a', textShadow: 'none',
          }}>
            {swingSoon.delta < 0 ? '▼ Dropping' : '▲ Rising'} {Math.abs(Math.round(swingSoon.delta))}{'°'} to {deg(chartHours[swingSoon.to].temp)} by {timeLabel(chartHours[swingSoon.to].t)}
          </span>
        )}
      </div>
      {goTips && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4em', fontSize: '1.2em', fontWeight: 700 }}>
          <OutlinedGlyph Glyph={Shirt} color="#a3e635" size="1.2em" />{goTips}
        </span>
      )}
      {current && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '1em', rowGap: '0.3em' }}>
          {current.windSpeed != null && stat('Wind', (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2em' }}>
              {current.windDirection != null && <ArrowUp size="0.85em" strokeWidth={3} style={{ transform: `rotate(${current.windDirection + 180}deg)` }} aria-hidden="true" />}
              {Math.round(current.windSpeed)}
              {current.windGust != null && current.windGust >= current.windSpeed + 8 ? `–${Math.round(current.windGust)}` : ''}
              <span style={{ fontSize: '0.6em', fontWeight: 500 }}> {metric ? 'km/h' : 'mph'}</span>
            </span>
          ), Wind, WIND_TEAL)}
          {current.humidity != null && stat('Humidity', `${Math.round(current.humidity)}%`, Droplets, HUMID_BLUE)}
          {current.uvIndex != null && !isNight(now) && stat('UV index', (
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.3em' }}>
              {Math.round(current.uvIndex)}
              <span style={{ fontSize: '0.6em', fontWeight: 700, color: uvLevel(current.uvIndex)[1] }}>{uvLevel(current.uvIndex)[0]}</span>
            </span>
          ), SunIcon, UV_AMBER)}
          {stat('Feels like', deg(current.feelsLike ?? current.temp), Thermometer, '#f472b6')}
          {airBad && stat('Air quality', aqi != null ? (
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.3em' }}>
              {Math.round(aqi)}
              <span style={{ fontSize: '0.6em', fontWeight: 700, color: airColor, whiteSpace: 'normal' }}>{aqiCategory(aqi)[0]}</span>
            </span>
          ) : <span style={{ color: airColor }}>Alert</span>, Leaf, airColor)}
        </div>
      )}
    </div>
  );

  // ── The week's days, with their chance and amounts ──
  interface WeekDay { date: string; d: ForecastDay; prob: number; amt: number | null; snow: number; falling: Falling | null; shown: boolean }
  const DAY_WORD: Record<Falling, string> = { rain: 'rain', snow: 'snow', sleet: 'rain and snow', freezing: 'freezing rain', storm: 'storms' };
  const weekDays: WeekDay[] = forecast.filter((d) => d.date >= today).slice(0, 7).map((d) => {
    const om = precip?.days.get(d.date);
    const prob = om?.prob ?? d.precipProbability ?? 0;
    const amt = om ? om.rain : d.precipAmount ?? null;
    const snow = om?.snow ?? 0;
    const shown = prob >= Math.min(rainLikely, 30) || (amt ?? 0) >= (metric ? 1 : 0.04) || snow >= (metric ? 0.5 : 0.2);
    return { date: d.date, d, prob, amt, snow, falling: om ? om.falling : fallingFromIcon(d.icon), shown };
  });

  // ── Precipitation: the answer to "do I need an umbrella (or a scraper), and when" ──
  const upcoming = events.filter((e) => e.end > now);
  const first: RainEvent | undefined = upcoming[0];
  const second: RainEvent | undefined = upcoming[1];
  const dryUntil = chartHours.length ? chartHours[chartHours.length - 1].t + HOUR : now;
  const WORD: Record<RainEvent['kind'], string> = {
    rain: 'Rain', snow: 'Snow', mix: 'Rain and snow', sleet: 'Sleet', freezing: 'Freezing rain', storm: 'Storms',
  };
  const word = (e: RainEvent) => WORD[e.kind];
  const howMuch = (e: RainEvent) => {
    const parts: string[] = [];
    if (e.rain != null && e.rain > 0) parts.push(`about ${fmtAmount(e.rain)}`);
    if (e.snow != null && e.snow > 0) parts.push(`${fmtSnow(e.snow)} of snow`);
    const level = e.kind !== 'snow' ? intensity(e.peakRate, metric) : null;
    if (level) parts.push(level);
    if (e.kind === 'freezing') parts.push('icy');
    if (e.thunder && e.kind !== 'storm') parts.push('thunder');
    parts.push(`${e.peakProb}% chance`);
    return parts.join(' · ');
  };
  let rainTitle: string;
  let rainDetail: string;
  if (first && first.start <= now) {
    rainTitle = `${word(first)} now, until ${timeLabel(first.end)}${dayWord(first.end) ? ` ${dayWord(first.end)}` : ''}`;
    rainDetail = howMuch(first);
  } else if (first) {
    rainTitle = `${word(first)} ${first.peakProb >= 70 ? 'likely' : 'possible'} ${range(first.start, first.end)}`;
    rainDetail = howMuch(first);
  } else {
    // Snow joins the headline once it's cold enough for it.
    const cold = chartHours.some((x) => x.temp <= (metric ? 3.5 : 38)) || forecast.slice(0, 7).some((d) => d.low <= (metric ? 1 : 34));
    rainTitle = cold ? 'No rain or snow expected' : 'No rain expected';
    // The days after the chart, read exactly as the week card reads them, so
    // the two cards always agree: the first day the week marks wet, and the
    // first likely one when that comes later.
    const past = localDate(dryUntil - 1);
    const laterDays = weekDays.filter((d) => d.date > past && d.shown);
    const nextDay = laterDays[0];
    const likelyDay = laterDays.find((d) => d.prob >= rainLikely);
    const dayNote = (d: WeekDay) => `${fWeekday.format(Date.parse(`${d.date}T12:00:00Z`))}, ${d.prob}%${d.falling && d.falling !== 'rain' ? ` ${DAY_WORD[d.falling]}` : ''}`;
    rainDetail = `through ${dayWord(dryUntil) || 'today'} ${timeLabel(dryUntil)}`
      + (nextDay ? ` · next chance ${dayNote(nextDay)}` : '')
      + (likelyDay && likelyDay !== nextDay ? ` · likelier ${dayNote(likelyDay)}` : '');
  }
  // The next stretch out of the house, and whether rain falls in it.
  const nextAway = away.find(([, b]) => b > now);
  const awayHit = nextAway ? upcoming.find((e) => e.start < nextAway[1] && e.end > nextAway[0]) : undefined;
  const awayLabel = nextAway ? `${dayWord(Math.max(nextAway[0], now)) ? `${dayWord(Math.max(nextAway[0], now))} ` : ''}${timeLabel(nextAway[0])}–${timeLabel(nextAway[1])}` : '';
  const wet = !!first && first.start < now + 24 * HOUR;
  const kind = first?.kind;
  const RainGlyph = !wet ? CircleCheck : kind === 'snow' ? Snowflake : kind === 'storm' ? CloudLightning : kind === 'sleet' || kind === 'freezing' || kind === 'mix' ? CloudHail : Umbrella;
  const badge = !wet ? '#4ade80' : kind === 'snow' ? SNOW_ICE : kind === 'storm' ? STORM_PURPLE : kind === 'sleet' || kind === 'freezing' || kind === 'mix' ? SLEET_LILAC : RAIN_BLUE;
  // A weather alert takes the card over: its colour, its title first, and the
  // precipitation outlook underneath.
  const alert = alerts[0];
  const alertColor = alert ? SEVERITY_COLOR[alert.severity] ?? SEVERITY_COLOR.Unknown : null;
  const alertRgb = alertColor ? hexToRgb(alertColor) : null;
  const precipCard = (
    <div data-fit style={{
      ...card('rainStrength'), flexDirection: 'row', alignItems: 'center', gap: '0.8em',
      ...(alertRgb ? { background: `rgba(${alertRgb.join(',')}, 0.82)`, boxShadow: `inset 0 0 0 0.12em rgba(255, 255, 255, 0.35)` } : {}),
    }}>
      <div style={{
        flexShrink: 0, width: '3.2em', height: '3.2em', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: alert ? '#ffffff' : badge, color: alertColor ?? '#0f172a',
      }}>
        {alert ? <TriangleAlert size="1.9em" strokeWidth={2.4} aria-hidden="true" /> : <RainGlyph size="1.9em" strokeWidth={2.25} aria-hidden="true" />}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15em', minWidth: 0, flex: 1 }}>
        {alert ? (
          <>
            <span style={{ fontSize: '1.5em', fontWeight: 800, lineHeight: 1.05 }}>
              {alert.title}
              {alerts.length > 1 && <span style={{ fontSize: '0.6em', fontWeight: 700, opacity: 0.9, whiteSpace: 'nowrap' }}> +{alerts.length - 1} more</span>}
            </span>
            <span style={{ fontSize: '1.15em' }}><span style={{ fontWeight: 800 }}>{rainTitle}</span> · {rainDetail}</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: '1.75em', fontWeight: 800, lineHeight: 1.05 }}>{rainTitle}</span>
            <span style={{ fontSize: '1.15em', opacity: 0.9 }}>{rainDetail}</span>
          </>
        )}
        {(soon || second || nextAway) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4em 0.8em', marginTop: '0.15em', fontSize: '1.05em', fontWeight: 700 }}>
            {soon && <span style={{ color: alert ? '#ffffff' : badge === '#4ade80' ? RAIN_BLUE : badge }}>{soon}</span>}
            {nextAway && (awayHit ? (
              <span style={{ padding: '0.05em 0.5em', borderRadius: '0.35em', background: accent, color: '#0f172a', textShadow: 'none' }}>
                While you're out ({awayLabel}): {awayHit.start <= nextAway[0] ? 'wet from the start' : `from ${timeLabel(awayHit.start)}`}
              </span>
            ) : (
              <span style={{ color: alert ? '#ffffff' : '#4ade80' }}>Dry while you're out ({awayLabel})</span>
            ))}
            {second && <span style={{ opacity: 0.9 }}>Then {word(second).toLowerCase()} {range(second.start, second.end)}</span>}
          </div>
        )}
      </div>
    </div>
  );

  // ── The next hours ──
  const chartCard = (
    <div data-fit style={{ ...card('chartStrength'), gridArea: '1 / 1', opacity: radarShowing ? 0 : 1, transition: 'opacity 1s ease' }}>
      {heading(`Next ${chartHours.length} hours`, HOURS_SKY, (
        <span style={{ display: 'flex', gap: '1em', fontSize: '0.72em', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.9 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35em' }}>
            <span style={{ width: '0.8em', height: '0.8em', borderRadius: '0.15em', background: RAIN_BLUE }} />{precip ? `Rain (${amountUnit})` : 'Chance of rain'}
          </span>
          {precip && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35em' }}>
              <span style={{ width: '1.2em', borderTop: `0.15em dashed ${RAIN_BLUE}` }} />Chance
            </span>
          )}
        </span>
      ))}
      <HoursChart
        hours={chartHours} now={now} events={upcoming} fs={fs} accent={accent}
        amountUnit={amountUnit} fmtHour={shortHour}
        dayStart={(t) => (localHour(t) === 0 ? fWeekday.format(t) : null)}
        colorTemp={(t) => tempColor(t, metric)}
        icon={(id, size) => <Icon id={id} size={size} />}
        textShadow={textShadow}
      />
    </div>
  );

  // ── Radar ──
  const radarCard = radarWanted && hasLocation ? (
    <div style={{ ...card('chartStrength'), gridArea: '1 / 1', opacity: radarShowing ? 1 : 0, transition: 'opacity 1s ease', pointerEvents: 'none' }}>
      {heading('Radar', HOURS_SKY, (
        <span style={{ fontSize: '0.8em', fontWeight: 700, opacity: 0.9 }}>
          {first && first.start <= now ? `${word(first)} now` : first ? `${word(first)} from ${timeLabel(first.start)}` : alerts[0]?.title ?? ''}
        </span>
      ))}
      <RadarMap index={radarIndex} lat={lat as number} lng={lng as number} zoom={radarZoom} scale={Math.max(1, fs / 20)} accent={accent}
        fmtTime={timeLabel} running={radarShowing} />
    </div>
  ) : null;

  // ── The week ──
  const days = weekDays.map((w) => w.d);
  const weekLo = Math.min(...days.map((d) => d.low));
  const weekHi = Math.max(...days.map((d) => d.high));
  const pct = (t: number) => `${(((t - weekLo) / Math.max(1, weekHi - weekLo)) * 100).toFixed(1)}%`;
  const weekCard = days.length ? (
    <div data-fit style={card('weekStrength')}>
      {heading('The week', WEEK_VIOLET, <span style={{ fontSize: '0.8em', opacity: 0.85 }}>{deg(weekLo)} – {deg(weekHi)}</span>)}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        {weekDays.map(({ d, prob, amt, snow, shown: showRain }, i) => {
          return (
            <div key={d.date} style={{ display: 'grid', gridTemplateColumns: '3.6em 1.4em 6.6em 2.4em 1fr 2.4em', alignItems: 'center', columnGap: '0.6em', fontSize: '1.05em' }}>
              <span style={{ fontWeight: i === 0 ? 800 : 600 }}>{i === 0 ? 'Today' : fWeekday.format(Date.parse(`${d.date}T12:00:00Z`))}</span>
              <Icon id={d.icon} size="1.35em" />
              <span style={{ color: RAIN_BLUE, fontWeight: 700, fontSize: '0.85em', whiteSpace: 'nowrap' }}>
                {showRain ? `${prob}%${snow > 0 ? ` · ${fmtSnow(snow)}` : amt != null && amt > 0 ? ` · ${fmtAmount(amt)}` : ''}` : ''}
              </span>
              <span style={{ textAlign: 'right', opacity: 0.85 }}>{deg(d.low)}</span>
              <div style={{ position: 'relative', height: '0.45em', borderRadius: '0.25em', background: 'rgba(255, 255, 255, 0.2)' }}>
                <div style={{
                  position: 'absolute', top: 0, bottom: 0, left: pct(d.low), right: `calc(100% - ${pct(d.high)})`, borderRadius: '0.25em',
                  background: `linear-gradient(90deg, ${tempColor(d.low, metric)}, ${tempColor(d.high, metric)})`,
                }} />
                {i === 0 && current && (
                  <div style={{
                    position: 'absolute', top: '50%', left: pct(Math.min(d.high, Math.max(d.low, current.temp))), width: '0.8em', height: '0.8em',
                    transform: 'translate(-50%, -50%)', borderRadius: '50%', background: '#ffffff', boxShadow: '0 0 0 0.12em #0f172a',
                  }} />
                )}
              </div>
              <span style={{ fontWeight: 800 }}>{deg(d.high)}</span>
            </div>
          );
        })}
      </div>
    </div>
  ) : null;

  // ── Sky events ──
  const fMonthDay = formatter(tz, { month: 'short', day: 'numeric' });
  const skyFmt: SkyFormat = {
    time: timeLabel,
    day: (t) => {
      const d = dayWord(t);
      if (!d) return 'today';
      if (d === 'Tomorrow') return 'tomorrow';
      return t - now > 6 * 24 * HOUR ? `${d}, ${fMonthDay.format(t)}` : d;
    },
    night: (t) => {
      // A night belongs to the evening it starts on.
      const eve = localDate(t - 12 * HOUR);
      if (eve <= today) return 'tonight';
      if (eve === tomorrow) return 'tomorrow night';
      const noon = Date.parse(`${eve}T12:00:00Z`);
      return `${fWeekday.format(noon)}${noon - now > 6 * 24 * HOUR ? `, ${fMonthDay.format(noon)}` : ''} night`;
    },
    date: (t) => fMonthDay.format(t),
  };
  const skyEvents: SkyEvent[] = [];
  if (hasLocation && showSunCard) {
    const [la, ln] = [lat as number, lng as number];
    if (skyEclipses) {
      const key = `${Math.floor(now / HOUR)}|${la}|${ln}|${tz}|${h12}`;
      if (eclipseCache?.key !== key) {
        try {
          eclipseCache = { key, events: eclipseEvents(now, la, ln, skyFmt) };
        } catch {
          eclipseCache = { key, events: [] };
        }
      }
      skyEvents.push(...eclipseCache.events.filter((e) => e.at > now - 6 * HOUR));
    }
    if (skyMeteors) skyEvents.push(...meteorEvents(now, la, skyFmt));
    if (skyAurora) {
      const a = auroraEvent(kpRows, now, la, ln, skyFmt);
      if (a) skyEvents.push(a);
    }
  }
  if (skyComets) skyEvents.push(...cometEvents(comets, now, cometMag, skyFmt));
  skyEvents.sort((a, b) => a.at - b.at);
  const skyNowEvent = skyEvents.length ? skyEvents[skyTurn % skyEvents.length] : null;
  contentRef.current = [alert?.title, alerts.length, rainTitle, rainDetail, soon, second ? 1 : 0, awayHit ? 1 : 0, goTips, skyEvents.length > 0].join('|');

  // ── Sun and moon: the Sun Arc Clock, inside a card ──
  const sunCard = showSunCard ? (
    <div data-fit style={{ ...card('sunStrength'), padding: '0.4em 0.6em' }}>
      {/* The arc takes what the lines underneath leave it. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
      <SunClock
        config={{ showClock: showArcClock, showCountdown: showArcCountdown, showPhaseIcon: false, timeFormat: timeFormat ?? 'auto', softShadow: textShadow }}
        /* Its own text never smaller than the rest of the screen's small print. */
        style={{ ...style, fontSize: fs * 0.72, backgroundColor: 'transparent', padding: 0, borderRadius: 0, opacity: 1, backdropBlur: 0, borderWidth: 0, shadowSize: 0 }}
        timezone={tz} latitude={lat} longitude={lng} timeFormat={props.timeFormat}
      />
      </div>
      {showSunDetails && hasLocation && (() => {
        const today = todaysSunTimes(now, lat as number, lng as number, tz);
        const yday = todaysSunTimes(now - 24 * HOUR, lat as number, lng as number, tz);
        const len = (t: SunTimes) => (t.sunset ?? 0) - (t.sunrise ?? 0);
        const mins = Math.round(len(today) / 60_000);
        const diff = Math.round((len(today) - len(yday)) / 60_000);
        const mp = moonPhase(now);
        const pass = moonPass(now, lat as number, lng as number);
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6em', flexShrink: 0, fontSize: '1.05em', fontWeight: 650, whiteSpace: 'nowrap', padding: '0.2em 0.3em 0.1em' }}>
            <MoonPicture phase={mp.phase} size="2.9em" mirror={(lat as number) < 0} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15em' }}>
              <span>
                {moonPhaseName(mp.phase)} {Math.round(mp.fraction * 100)}%
                {!pass.up && pass.rise != null && <span style={{ fontSize: '0.8em', opacity: 0.85 }}> · rises {timeLabel(pass.rise)}</span>}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35em' }}>
                <OutlinedGlyph Glyph={Hourglass} color={accent} size="1em" />
                {Math.floor(mins / 60)}h {mins % 60}m<span style={{ fontSize: '0.8em', opacity: 0.85 }}>· {Math.abs(diff)} min {diff < 0 ? 'shorter' : 'longer'}</span>
              </span>
            </div>
          </div>
        );
      })()}
      {skyNowEvent && (() => {
        const [color, Glyph] = SKY_STYLE[skyNowEvent.kind];
        const [r, g, b] = hexToRgb(color);
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5em', flexShrink: 0, marginTop: '0.3em', padding: '0.3em 0.6em', borderRadius: '0.5em', whiteSpace: 'nowrap',
            background: `rgba(${r}, ${g}, ${b}, 0.16)`, boxShadow: `inset 0 0 0 0.08em rgba(${r}, ${g}, ${b}, 0.55)`,
          }}>
            <OutlinedGlyph Glyph={Glyph} color={color} size="1.5em" />
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: '1.05em', fontWeight: 800, color, overflow: 'hidden', textOverflow: 'ellipsis' }}>{skyNowEvent.title}</span>
              <span style={{ fontSize: '0.88em', fontWeight: 600, opacity: 0.92, overflow: 'hidden', textOverflow: 'ellipsis' }}>{skyNowEvent.detail}</span>
            </div>
            {skyEvents.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2em', flexShrink: 0 }}>
                {skyEvents.map((e, i) => (
                  <span key={i} style={{ width: '0.38em', height: '0.38em', borderRadius: '50%', background: i === skyTurn % skyEvents.length ? '#ffffff' : 'rgba(255,255,255,0.3)' }} />
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  ) : null;

  const stale = (() => {
    if (!allHourly.length) return null;
    const firstHour = Date.parse(allHourly[0].time);
    const age = Math.floor((now - firstHour) / HOUR);
    if (p.weatherError) return 'Couldn’t refresh the weather — showing the last forecast';
    return age >= 2 ? `Forecast is ${age} h old` : null;
  })();

  // What's falling right now, and how hard, for the sky.
  const nowHour = chartHours[0];
  const nowWet = first != null && first.start <= now;
  const skyNow = livingSky
    ? plotScene(
      skyScene(current?.icon, sunPhase(hasLocation ? sunAltitude(now, lat as number, lng as number) : null)),
      nowWet ? (nowHour?.falling ?? (first?.kind === 'snow' ? 'snow' : 'rain')) : null,
      nowWet ? (intensity(nowHour?.rain ?? null, metric) as 'light' | 'moderate' | 'heavy' | null) : null,
    )
    : null;
  const layer: CSSProperties = livingSky ? { position: 'relative', zIndex: 1 } : {};

  return (
    <div ref={boxRef} style={root}>
      {skyNow && <LivingSky scene={skyNow} />}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '34fr 66fr', gap: '0.6em', ...layer }}>
        <div style={{ display: 'grid', gridTemplateRows: showSunCard ? 'minmax(0, 1.35fr) minmax(0, 1fr)' : '1fr', gap: '0.6em', minHeight: 0 }}>
          {nowCard}
          {sunCard}
        </div>
        <div style={{ display: 'grid', gridTemplateRows: weekCard ? 'auto minmax(0, 1.45fr) minmax(0, 1fr)' : 'auto minmax(0, 1fr)', gap: '0.6em', minHeight: 0 }}>
          {precipCard}
          <div style={{ display: 'grid', gridTemplate: 'minmax(0, 1fr) / minmax(0, 1fr)', minHeight: 0 }}>
            {chartCard}
            {radarCard}
          </div>
          {weekCard}
        </div>
      </div>
      {stale && <div style={{ alignSelf: 'flex-end', fontSize: '0.8em', opacity: 0.85, flexShrink: 0, ...layer }}>{stale}</div>}
    </div>
  );
}
