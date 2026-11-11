// 드라이버 생성: 가정 자산 규모(SPEC §3.1), 성격(§3.4), 후보 생성.

import { ovr, OVR_WEIGHTS } from './data';
import { int, pick, rngFor } from './rng';
import { STAT_KEYS, type Personality, type StatKey, type Stats, type WealthTier } from './types';

/** 모든 능력치의 시작값. 가중 평균 OVR이 45가 되려면 평균도 45여야 한다(합 270). */
export const BASE_STAT = 45;
export const TARGET_OVR = 45;
export const STAT_SUM = BASE_STAT * STAT_KEYS.length; // 270
const STAT_MIN = 25;
const STAT_MAX = 65;

export interface PersonalityDef {
  id: Personality;
  label: string;
  /** 능력치 보정. 합은 항상 0 */
  mods: Stats;
  motto: string;
  /** 레이스 엔진이 쓰는 행동 계수 */
  race: { overtakeAttempt: number; contactRisk: number; mistake: number; lapVariance: number; fightback: number };
  /**
   * 기질(SPEC §3.4 v0.11): good = 꾸준하지만 잠재력 상한이 낮다(챔피언 확률 낮음),
   * bad = 들쑥날쑥하지만 상한이 높다(챔피언 확률 높음), 대신 방출 위험이 크다
   */
  temperament: 'good' | 'neutral' | 'bad';
  /** 레이스 시트에 있을 때 시즌마다 팀이 방출할 기본 확률 */
  releaseRisk: number;
  /** 방출될 때 언론에 나오는 이유 */
  releaseReason: string;
  /** 홈 그랑프리 멘탈(SPEC §5.6): 일관성 변화. 기질이 좋으면 오르고 나쁘면 떨어진다 */
  homeMental: number;
  /** 홈 그랑프리에서 보이는 한 줄 */
  homeLine: string;
}

export const PERSONALITIES: Record<Personality, PersonalityDef> = {
  aggressive: {
    id: 'aggressive', temperament: 'bad', releaseRisk: 0.12, releaseReason: '팀메이트와의 잦은 충돌', homeMental: -4, homeLine: '홈 관중 앞에서 너무 들떠 있다. 무리한 시도가 늘 수 있다', label: '공격형', motto: '1코너에서 양보는 없다',
    mods: { pace: 6, racecraft: 8, tyre: -4, consistency: -8, wet: 0, feedback: -2 },
    race: { overtakeAttempt: 1.15, contactRisk: 2.4, mistake: 1.35, lapVariance: 1.35, fightback: 0 },
  },
  calm: {
    id: 'calm', temperament: 'good', releaseRisk: 0.01, releaseReason: '성적 부진', homeMental: 4, homeLine: '홈 관중의 응원을 힘으로 바꾼다. 평소보다 더 차분하다', label: '침착형', motto: '레이스는 마지막 랩에 끝난다',
    mods: { pace: -2, racecraft: -4, tyre: 6, consistency: 8, wet: -2, feedback: -6 },
    race: { overtakeAttempt: 0.95, contactRisk: 0.5, mistake: 0.55, lapVariance: 0.8, fightback: 0 },
  },
  analytical: {
    id: 'analytical', temperament: 'good', releaseRisk: 0.015, releaseReason: '엔지니어링 방향을 둘러싼 이견', homeMental: 2, homeLine: '익숙한 서킷 데이터가 많다. 준비가 탄탄하다', label: '분석형', motto: '데이터는 거짓말하지 않는다',
    mods: { pace: -2, racecraft: -6, tyre: 6, consistency: 2, wet: -6, feedback: 6 },
    race: { overtakeAttempt: 1.0, contactRisk: 0.8, mistake: 0.8, lapVariance: 0.85, fightback: 0 },
  },
  instinctive: {
    id: 'instinctive', temperament: 'bad', releaseRisk: 0.1, releaseReason: '잦은 실수와 팀 오더 무시', homeMental: -5, homeLine: '기대가 부담이 됐다. 마음이 급해 실수가 늘 수 있다', label: '본능형', motto: '생각보다 발이 먼저 나간다',
    mods: { pace: 8, racecraft: 2, tyre: -6, consistency: -4, wet: 6, feedback: -6 },
    race: { overtakeAttempt: 1.05, contactRisk: 1.3, mistake: 1.2, lapVariance: 1.5, fightback: 0 },
  },
  fighter: {
    id: 'fighter', temperament: 'neutral', releaseRisk: 0.05, releaseReason: '팀 수뇌부와의 공개 언쟁', homeMental: 2, homeLine: '응원이 투지에 불을 붙였다', label: '투사형', motto: '잃은 자리는 다시 찾아온다',
    mods: { pace: -4, racecraft: 6, tyre: -4, consistency: 2, wet: 4, feedback: -4 },
    race: { overtakeAttempt: 1.15, contactRisk: 1.1, mistake: 1.0, lapVariance: 1.0, fightback: 0.12 },
  },
  showman: {
    id: 'showman', temperament: 'neutral', releaseRisk: 0.04, releaseReason: 'SNS 논란', homeMental: -2, homeLine: '카메라와 행사가 너무 많다. 집중이 흐트러질 수 있다', label: '쇼맨형', motto: '카메라가 있는 곳이 내 무대',
    mods: { pace: 2, racecraft: 2, tyre: -2, consistency: -2, wet: 0, feedback: 0 },
    race: { overtakeAttempt: 1.05, contactRisk: 1.1, mistake: 1.05, lapVariance: 1.05, fightback: 0 },
  },
};

export const NEUTRAL_RACE = { overtakeAttempt: 1, contactRisk: 1, mistake: 1, lapVariance: 1, fightback: 0 } as const;

export interface WealthTierDef {
  tier: WealthTier;
  label: string;
  /** 유로 */
  startFunds: number;
  /** 유로/시즌. 21세 또는 F1 데뷔 시 종료 */
  familySupport: number;
  growthBonus: number;
  reputationGain: number;
  academyInterest: number;
  sponsorBonus: number;
}

export const WEALTH_TIERS: Record<WealthTier, WealthTierDef> = {
  1: { tier: 1, label: '빠듯함', startFunds: 30_000, familySupport: 15_000, growthBonus: 0.1, reputationGain: 0.2, academyInterest: 0, sponsorBonus: 0.15 },
  2: { tier: 2, label: '보통', startFunds: 150_000, familySupport: 80_000, growthBonus: 0.05, reputationGain: 0, academyInterest: 0, sponsorBonus: 0.1 },
  3: { tier: 3, label: '여유', startFunds: 800_000, familySupport: 300_000, growthBonus: 0, reputationGain: 0, academyInterest: 0, sponsorBonus: 0 },
  4: { tier: 4, label: '부유', startFunds: 4_000_000, familySupport: 1_200_000, growthBonus: 0, reputationGain: -0.1, academyInterest: -0.15, sponsorBonus: 0 },
  5: { tier: 5, label: '재벌', startFunds: 25_000_000, familySupport: 4_000_000, growthBonus: 0, reputationGain: -0.25, academyInterest: -0.3, sponsorBonus: 0 },
};

export interface Candidate {
  index: number;
  stats: Stats;
  ovr: number;
}

const HIGH_WEIGHT: StatKey[] = ['pace', 'racecraft', 'consistency'];
const LOW_WEIGHT: StatKey[] = ['tyre', 'wet', 'feedback'];

function sum(s: Stats): number {
  return STAT_KEYS.reduce((a, k) => a + s[k], 0);
}

/** 후보가 지켜야 하는 불변식: 합 270, OVR이 45로 반올림, 모든 값이 범위 안 */
export function isValidCandidate(s: Stats): boolean {
  return (
    sum(s) === STAT_SUM &&
    Math.abs(ovr(s) - TARGET_OVR) < 0.5 &&
    STAT_KEYS.every((k) => s[k] >= STAT_MIN && s[k] <= STAT_MAX)
  );
}

/**
 * 성격 배분을 바탕으로 후보를 만든다.
 * 1) 모두 45 → 2) 성격 보정 → 3) ±3 흔들기(합 유지) → 4) OVR을 45로 맞춘다. 실패하면 3)부터 다시.
 */
export function generateCandidates(seed: number, personality: Personality, reroll = 0, count = 3): Candidate[] {
  const def = PERSONALITIES[personality];
  const out: Candidate[] = [];
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const rng = rngFor(seed, 'candidate', personality, reroll, i, attempt);
      const s = {} as Stats;
      for (const k of STAT_KEYS) s[k] = BASE_STAT + def.mods[k];

      // 흔들기: 한 능력치에서 빼서 다른 능력치에 더한다(합 유지)
      for (let j = 0; j < 4; j++) {
        const a = pick(rng, STAT_KEYS);
        const b = pick(rng, STAT_KEYS);
        if (a === b) continue;
        const delta = int(rng, 1, 3);
        s[a] += delta;
        s[b] -= delta;
      }

      // OVR 보정: 가중치가 높은 능력치 ↔ 낮은 능력치 사이에서 1점씩 옮긴다
      for (let step = 0; step < 60 && Math.abs(ovr(s) - TARGET_OVR) >= 0.5; step++) {
        const tooHigh = ovr(s) > TARGET_OVR;
        const from = pick(rng, tooHigh ? HIGH_WEIGHT : LOW_WEIGHT);
        const to = pick(rng, tooHigh ? LOW_WEIGHT : HIGH_WEIGHT);
        if (OVR_WEIGHTS[from] === OVR_WEIGHTS[to]) continue;
        s[from] -= 1;
        s[to] += 1;
      }

      if (isValidCandidate(s)) {
        out.push({ index: i, stats: s, ovr: Math.round(ovr(s)) });
        break;
      }
    }
    if (out.length !== i + 1) throw new Error(`candidate ${i} could not be generated for ${personality}`);
  }
  return out;
}

/** 집중 육성 기본 추천: 성격 보정이 가장 낮은 능력치 2개(성격의 약점) */
export function recommendedFocus(personality: Personality): StatKey[] {
  const mods = PERSONALITIES[personality].mods;
  return [...STAT_KEYS].sort((a, b) => mods[a] - mods[b]).slice(0, 2);
}
