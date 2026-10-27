# Weather Full Screen

A Home Screens module that fills the screen with weather, in order of what matters before you leave the house: **will it rain or snow, when, and how much**. It combines [Outlined Weather](../outlined-weather/README.md) and the [Sun Arc Clock](../../Sun/sun-clock/README.md) over an animated sky that matches the weather, and is built to be read from across the room.

## Install

In the Home Screens editor, open the Plugin Store, choose **Install from URL**, and paste:

```
https://github.com/rferg05/weather-fullscreen-HS/releases/latest/download/weather-fullscreen.tar.gz
```

This always points at the newest release. To update: Plugin Store > **Installed**, then the download icon on Weather Full Screen, then **Install**.

## What it shows

- **Precipitation outlook** (top right, the largest words on the screen):
  - *Rain likely tonight, 9 PM – 1 AM* with *about 0.5 in · moderate · 85% chance*, or *Rain now, until 5 PM*, or *No rain expected through Thu 12 AM · next chance Thu, 16% · likelier Sat, 42%*. The days after the chart are read exactly as the week card reads them, so the two always agree.
  - It names what falls: **rain**, **snow**, **sleet**, **freezing rain** (marked *icy*), **storms**, or *rain and snow* when a spell changes over, each with its own icon and color. Thunder inside a rainy spell is called out too. Once it's cold enough for snow the clear message becomes *No rain or snow expected*.
  - **Your time out of the house** (8 AM–6 PM by default): an amber *While you're out (8 AM–6 PM): from 1 PM*, or a green *Dry while you're out*.
  - The next spell after that (*Then rain Sun, 12 – 2 AM*), and *Rain starting in 12 min* when the weather provider sends minute-by-minute data.
  - Snow is reported with its depth.
- **Radar**, when something is on the way: while precipitation is falling or due within 3 hours, or a weather warning is out, the chart card takes turns with an animated radar map (20 s each). It loops the last hour plus the radar forecast, with the time over the map, a dot for home, and a timeline along the bottom (white for what was seen, amber for the forecast). The frames are the ones Home Screens' Rain Map uses, from LibreWXR, over OpenStreetMap.- **Next 36 hours** chart:
  - the temperature line, coloured from cold blue to hot red, with the high and low labelled large
  - night hours shaded and a *now* line
  - rain as bars sized by **how much** falls each hour, the chance as a dashed line over them, and each spell's total above it
- **Now**: the date, the temperature, conditions, high and low, and *feels like* when it differs by 3° or more. Wind with direction and gusts, humidity and UV (daytime), each with its icon on a chip of its own color. **Air quality** joins them only when it's bad: during an air-quality alert, or when the US AQI reaches 151 (adjustable), shown with its EPA category and color. A sharp swing (10°F or more within 3 hours) in the next 12 hours shows here too: *▼ Dropping 14° to 52° by 3 AM*.
- **Sun and moon**: the Sun Arc Clock, with the time, golden hour, a countdown to sunset or sunrise, and the moon's arc at night.
- **Living sky** behind everything: Home Screens' animated weather background, following the real sun (day, golden hour, night with stars) and the current weather: drifting clouds, fog, rain that falls lighter or harder with the forecast amount, snow, sleet, and lightning in storms.
- **The week**: each day's low-to-high range on one shared scale, with the chance and amount of rain.
- A weather **alert** banner across the top while a watch or warning is active, and a note when the forecast is stale.

## Where the numbers come from

Temperatures, conditions, wind and the week come from the weather provider set in Home Screens. That data has the chance of rain but not the amount, so the module asks **Open-Meteo** (free, no key, through the Home Screens server) for hourly and daily rain and snow amounts and weather codes every 15 minutes (the codes are what tell sleet, freezing rain and thunder apart), and its air-quality service for the US AQI every 30 minutes. The radar's frame list comes from LibreWXR's public server every 10 minutes, only while the radar is up. When Open-Meteo answers, both the chance and the amount in the rain outlook and the chart come from it, so the two always agree. With *Rain amounts from Open-Meteo* off, or if it's unreachable, everything falls back to the provider's chance of rain.

## Looks

With the living sky on, it fills the module in place of the background photo; turn it off to put your photo back. The sky's pictures are served by Home Screens itself (1.14.0 and later).

Each section is a card, styled like the full-screen calendar's day cards: a card color, a **strength per card** (0 is fully clear, 100 solid) so you choose where the background photo shows through, an optional frosted-glass blur and border, and a soft shadow behind text that keeps it readable when a card is mostly clear. Text isn't outlined; the colored icons for wind, humidity, UV and air quality have a dark outline so they read over any background.

## Sizing

The root text is 30 px on a 1920×1080 module and scales with the smaller of its width and height against that; *Text size* scales it from there. If something wouldn't fit, everything shrinks together until it does (about 28 px on a full 1080p screen with a busy week).

## Settings

| Setting | Default | |
|---|---|---|
| Mark my time out of the house | on, 8 to 18 | Hours 0–23; an overnight window like 22 to 6 works too. |
| Count an hour as wet from | 40% | An hour with a forecast amount counts from half this. |
| Rain and snow amounts from Open-Meteo | on | Also tells sleet, freezing rain and storms apart. |
| Show radar when precipitation is near / hours ahead | on / 3 | Also during a weather warning. |
| Seconds for the chart and radar each | 20 | 8–120. |
| Radar zoom | 7 | 5 (several states) to 10 (a city). |
| Hours on the chart | 36 | 12–48. |
| Warn about temperature swings of | 10°F | Within 3 hours, in the next 12. |
| Show air quality when it's bad / from AQI | on / 151 | Or during an air-quality alert. |
| Living sky background | on | In place of the background photo. |
| Show the sun and moon arc / time inside it / countdown to sunset or sunrise | on / on / on | |
| Times | Household setting | Or 12-hour or 24-hour. |
| Text size | 1× | 0.6–1.6×. |
| Card color / strength per card | near-black / 55% | |
| Frosted glass / Border | off / off | |
| Soft shadow behind text | on | |
| Accent color | amber | The now line and the date. |

## Development

```bash
npm install
npm test          # precipitation spells, temperature swings, sky scenes
npm run build     # dist/bundle.js
```

To package: put `manifest.json` and `dist/bundle.js(.map)` in a `weather-fullscreen/` folder, `tar -czf weather-fullscreen-<version>.tar.gz` it into `../releases/`, and attach that plus a copy named `weather-fullscreen.tar.gz` to a GitHub release tagged `v<version>`.

`src/sun/` is the Sun Arc Clock's source, copied in; changes to the clock there don't reach the standalone module, or the other way round.

`src/sky/` is the living sky from [Home Screens](https://github.com/home-screens/home-screens) (MIT, © Bryan Brandau), copied from `src/components/modules/fullscreen-weather/` at 715395d, with rain intensity, sleet and no sky moon added here.
