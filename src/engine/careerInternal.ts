// 커리어 엔진 내부 도우미(공개 API 아님). careerCore·careerCreate·season·offseason이 같이 쓴다.

import { normal, rngFor, type Rng } from './rng';
import { SERIES, type SeriesId } from './series';
import { STAT_KEYS, type Stats } from './types';

export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const zeroStats = (): Stats => ({ pace: 0, racecraft: 0, tyre: 0, consistency: 0, wet: 0, feedback: 0 });

export function statsAround(rng: Rng, target: number, spread = 5): Stats {
  const s = zeroStats();
  for (const k of STAT_KEYS) s[k] = clamp(Math.round(target + normal(rng) * spread), 20, 97);
  return s;
}

export function juniorTeams(series: Exclude<SeriesId, 'f1'>, year: number, seed: number): Array<{ name: string; quality: number; facility: number }> {
  const r = rngFor(seed, 'junior-teams', series, year);
  return SERIES[series].teams.map((name, i) => {
    const q = clamp(0.93 - i * 0.022 + normal(r) * 0.015, 0.65, 0.97);
    return { name, quality: q, facility: clamp(q - 0.05 + normal(r) * 0.03, 0.4, 0.98) };
  });
}
