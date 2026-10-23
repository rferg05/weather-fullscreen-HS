# Weather Full Screen

A Home Screens module that fills the screen with weather, in order of what matters before you leave the house: **will it rain, when, and how much**. It combines [Outlined Weather](../outlined-weather/README.md) and the [Sun Arc Clock](../../Sun/sun-clock/README.md), and is built to be read from across the room over any background photo.

## What it shows

- **Rain outlook** (top right, the largest words on the screen):
  - *Rain likely tonight, 9 PM – 1 AM* with *about 0.5 in · moderate · 85% chance*, or *Raining now, until 5 PM*, or *No rain expected through Sun 6 AM · next chance Mon, 60%*.
  - **Your time out of the house** (8 AM–6 PM by default): an amber *While you're out (8 AM–6 PM): from 1 PM*, or a green *Dry while you're out*.
  - The next spell after that (*Then rain Sun, 12 – 2 AM*), and *Rain starting in 12 min* when the weather provider sends minute-by-minute data.
  - Snow is reported as snow, with its depth.
- **Next 36 hours** chart:
  - the temperature line, coloured from cold blue to hot red, with the high and low labelled large
  - night hours shaded, a *now* line, and your time out marked *OUT*
  - **sharp swings** (10°F or more within 3 hours) marked on the line with a badge, *▼ 14°*
  - rain as bars sized by **how much** falls each hour, the chance as a dashed line over them, and each spell's total above it
- **Now**: the temperature, conditions, high and low, *feels like* when it differs by 3° or more, wind with direction and gusts, humidity, UV (daytime) and pressure. A swing in the next 12 hours shows here too: *▼ Dropping 14° to 52° by 3 AM*.
- **Sun and moon**: the Sun Arc Clock, with the time, golden hour, a countdown to sunset or sunrise, and the moon's arc at night.
- **The week**: each day's low-to-high range on one shared scale, with the chance and amount of rain.
- A weather **alert** banner across the top while a watch or warning is active, and a note when the forecast is stale.

## Where the numbers come from

Temperatures, conditions, wind and the week come from the weather provider set in Home Screens. That data has the chance of rain but not the amount, so the module asks **Open-Meteo** (free, no key, through the Home Screens server) for hourly and daily rain and snow amounts every 15 minutes. When Open-Meteo answers, both the chance and the amount in the rain outlook and the chart come from it, so the two always agree. With *Rain amounts from Open-Meteo* off, or if it's unreachable, everything falls back to the provider's chance of rain.

## Looks

Each section is a card, styled like the full-screen calendar's day cards: a card color, a **strength per card** (0 is fully clear, 100 solid) so you choose where the background photo shows through, an optional frosted-glass blur and border, and a soft shadow behind text that keeps it readable when a card is mostly clear. Text isn't outlined.

## Sizing

The root text is 30 px on a 1920×1080 module and scales with the smaller of its width and height against that; *Text size* scales it from there. If something wouldn't fit, everything shrinks together until it does (about 28 px on a full 1080p screen with a busy week).

## Settings

| Setting | Default | |
|---|---|---|
| Mark my time out of the house | on, 8 to 18 | Hours 0–23; an overnight window like 22 to 6 works too. |
| Count an hour as rainy from | 40% | An hour with a forecast amount counts from half this. |
| Rain amounts from Open-Meteo | on | |
| Hours on the chart | 36 | 12–48. |
| Call out temperature swings of | 10°F | Within 3 hours. |
| Show the sun and moon arc / time inside it | on / on | |
| Times | Household setting | Or 12-hour or 24-hour. |
| Text size | 1× | 0.6–1.6×. |
| Card color / strength per card | near-black / 55% | |
| Frosted glass / Border | off / off | |
| Soft shadow behind text | on | |
| Accent color | amber | The now line and your time out. |

## Development

```bash
npm install
npm test          # rain spells and temperature swings
npm run build     # dist/bundle.js
```

To package: put `manifest.json` and `dist/bundle.js(.map)` in a `weather-fullscreen/` folder, `tar -czf weather-fullscreen-<version>.tar.gz` it into `../releases/`, and attach that plus a copy named `weather-fullscreen.tar.gz` to a GitHub release tagged `v<version>`.

`src/sun/` is the Sun Arc Clock's source, copied in; changes to the clock there don't reach the standalone module, or the other way round.
