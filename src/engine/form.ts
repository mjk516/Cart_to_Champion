// 팀 폼(SPEC §5.1 "서킷 특성에 따라 팀마다 강약이 다르다", "시즌 중 업그레이드").
// 같은 시즌 안에서도 서킷 유형과 개발 속도에 따라 강한 팀이 바뀌어, 우승 팀이 여러 팀으로 나뉜다.

import { normal, rngFor } from './rng';
import type { Circuit } from './types';

export type CircuitType = 'power' | 'downforce' | 'street';

export function circuitType(c: Circuit): CircuitType {
  if (c.street) return 'street';
  return c.overtakeEase >= 0.55 ? 'power' : 'downforce';
}

/** 팀의 시즌 프로필: 서킷 유형별 강약, 시즌 중 개발 기울기 */
export function seasonProfile(seed: number, year: number, teamId: string): Record<CircuitType, number> & { dev: number } {
  const r = rngFor(seed, 'team-profile', year, teamId);
  return {
    power: normal(r) * 0.018,
    downforce: normal(r) * 0.018,
    street: normal(r) * 0.018,
    // 시즌 초반 → 후반으로 갈수록 붙는 차이(±약 0.015)
    dev: normal(r) * 0.02,
  };
}

/** 라운드별 팀 성능 보정값. 팀 퀄리티(0~1)에 더한다 */
export function teamForm(seed: number, year: number, teamId: string, circuit: Circuit, round: number, rounds: number): number {
  const p = seasonProfile(seed, year, teamId);
  const progress = rounds > 1 ? round / (rounds - 1) - 0.5 : 0;
  const weekend = normal(rngFor(seed, 'team-weekend', year, teamId, round)) * 0.007;
  return p[circuitType(circuit)] + p.dev * progress + weekend;
}
