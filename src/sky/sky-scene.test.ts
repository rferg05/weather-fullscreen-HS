import { describe, it, expect } from 'vitest';
import { skyScene, sunPhase, SKY_BASES, CLOUD_PALETTES } from './sky-layer';

describe('sunPhase', () => {
  it('splits the day at six degrees above and below the horizon', () => {
    expect(sunPhase(40)).toBe('day');
    expect(sunPhase(6.1)).toBe('day');
    expect(sunPhase(6)).toBe('golden');
    expect(sunPhase(0)).toBe('golden');
    expect(sunPhase(-5.9)).toBe('golden');
    expect(sunPhase(-6)).toBe('night');
    expect(sunPhase(-30)).toBe('night');
  });
  it('is day without a location', () => {
    expect(sunPhase(null)).toBe('day');
  });
});

describe('skyScene', () => {
  it('lets precipitation and fog outrank the sun', () => {
    for (const phase of ['day', 'golden', 'night'] as const) {
      expect(skyScene('cloud-rain', phase).key).toBe('rain');
      expect(skyScene('cloud-drizzle', phase).key).toBe('rain');
      expect(skyScene('cloud-lightning', phase).key).toBe('storm');
      expect(skyScene('cloud-hail', phase).key).toBe('storm');
      expect(skyScene('cloud-snow', phase).key).toBe('snow');
      expect(skyScene('snowflake', phase).key).toBe('snow');
    }
    expect(skyScene('cloud-fog', 'day').key).toBe('fog');
    expect(skyScene('cloud-fog', 'night').key).toBe('fog-night');
  });

  it('follows the sun for clear and partly cloudy skies', () => {
    expect(skyScene('sun', 'day').key).toBe('clear-day');
    expect(skyScene('sun', 'golden').key).toBe('golden');
    expect(skyScene('moon', 'night').key).toBe('clear-night');
    expect(skyScene('cloud-sun', 'day').key).toBe('partly-day');
    expect(skyScene('cloud-sun', 'golden').key).toBe('partly-golden');
    expect(skyScene('cloud-moon', 'night').key).toBe('partly-night');
    expect(skyScene('cloud', 'day').key).toBe('overcast');
    expect(skyScene('cloud', 'night').key).toBe('overcast-night');
  });

  it('treats the fallback icon and unknown ids as clear', () => {
    expect(skyScene('thermometer', 'day').key).toBe('clear-day');
    expect(skyScene(undefined, 'night').key).toBe('clear-night');
    expect(skyScene('mystery', 'golden').key).toBe('golden');
  });

  it('puts stars and the moon only in the night sky, and rain only under a deck', () => {
    const night = skyScene('sun', 'night');
    expect(night.stars && night.moon).toBe(true);
    expect(skyScene('sun', 'day').stars).toBe(false);
    const storm = skyScene('cloud-lightning', 'day');
    expect(storm.deck && storm.rain && storm.lightning).toBe(true);
    expect(skyScene('cloud-rain', 'day').lightning).toBe(false);
  });

  it('names a base gradient and a palette that exist for every scene', () => {
    const icons = ['sun', 'moon', 'cloud', 'cloud-sun', 'cloud-moon', 'cloud-fog', 'cloud-rain', 'cloud-drizzle', 'cloud-snow', 'snowflake', 'cloud-lightning', 'cloud-hail', 'thermometer'];
    for (const icon of icons) {
      for (const phase of ['day', 'golden', 'night'] as const) {
        const scene = skyScene(icon, phase);
        expect(SKY_BASES[scene.base]).toBeTruthy();
        expect(CLOUD_PALETTES[scene.palette]).toBeTruthy();
      }
    }
  });
});
