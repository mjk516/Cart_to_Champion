export const STAT_KEYS = ['pace', 'racecraft', 'tyre', 'consistency', 'wet', 'feedback'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;

export type Personality = 'aggressive' | 'calm' | 'analytical' | 'instinctive' | 'fighter' | 'showman';
export type WealthTier = 1 | 2 | 3 | 4 | 5;

/** S/M/H = 슬릭, I = 인터미디어트 */
export type Compound = 'S' | 'M' | 'H' | 'I';

export interface Team {
  id: string;
  name: string;
  /** 트랙 뷰 동그라미 색 */
  color: string;
  /** 차 성능 0~1 (SPEC §5.1 팀 퀄리티의 차 부분) */
  quality: number;
  /** 신뢰도 0~1 */
  reliability: number;
  /** 운영(피트스톱·전략) 0~1 */
  ops: number;
  /** 예산 지수 0~1 */
  budget: number;
  manufacturer: boolean;
  /** F1 데뷔 연도(신생팀 제한 판정용). 없으면 오래된 팀 */
  debutYear?: number;
}

export interface Driver {
  id: string;
  code: string;
  name: string;
  nationality: string;
  birthYear: number;
  teamId: string;
  number: number;
  stats: Stats;
  personality?: Personality;
  real: boolean;
}

export interface Circuit {
  id: string;
  name: string;
  country: string;
  laps: number;
  lengthKm: number;
  /** 기준 랩타임(초) */
  baseLap: number;
  /** 추월 쉬움 0~1 */
  overtakeEase: number;
  street: boolean;
  /** 레이스 중 비 올 확률 0~1 */
  rainChance: number;
  /** 피트레인 손실(초) */
  pitLoss: number;
  /** 타이어 마모 배수(1 = 보통) */
  deg: number;
  sprint: boolean;
}
