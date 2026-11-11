// 성장과 노화(SPEC §4). 능력치마다 XP가 쌓이고 기준치를 넘으면 1씩 오른다.
// ⚠️ 수치는 초기값. scripts/balance.ts로 조정한다.

import { PERSONALITIES } from './creation';
import { int, normal, rngFor, weightedPick, type Rng } from './rng';
import { STAT_KEYS, type Personality, type StatKey, type Stats } from './types';

export type GrowthType = 'early' | 'standard' | 'late' | 'longevity';

/** 화면에 보이지 않는 값 */
export interface Hidden {
  potential: number;
  growthType: GrowthType;
  peakEnd: number;
  injuryResist: number;
  pressureResist: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function generateHidden(seed: number, personality: Personality): Hidden {
  const r = rngFor(seed, 'hidden');
  // 기질에 따라 잠재력 분포가 다르다(SPEC §3.4 v0.11): 좋은 성격은 좁고 낮은 상한, 나쁜 성격은 넓고 높은 상한
  const t = PERSONALITIES[personality].temperament;
  const potential = t === 'good'
    ? clamp(Math.round(82.5 + normal(r) * 2.5), 78, 88)
    : t === 'bad'
      ? clamp(Math.round(86 + normal(r) * 5), 76, 97)
      : clamp(Math.round(82 + normal(r) * 3), 77, 88);
  const growthType = weightedPick<GrowthType>(r, ['early', 'standard', 'late', 'longevity'], (g) =>
    g === 'early' ? (personality === 'instinctive' ? 0.4 : 0.25)
      : g === 'standard' ? 0.4
        : g === 'late' ? 0.2
          : personality === 'analytical' ? 0.3 : 0.15,
  );
  const peakEnd =
    growthType === 'early' ? 29 + int(r, 0, 2)
      : growthType === 'longevity' ? 34 + int(r, 0, 3)
        : growthType === 'late' ? 32 + int(r, 0, 2)
          : 31 + int(r, 0, 2);
  const pressureBonus = personality === 'calm' || personality === 'fighter' ? 15 : personality === 'showman' ? -15 : 0;
  return {
    potential,
    growthType,
    peakEnd,
    injuryResist: clamp(Math.round(50 + normal(r) * 15), 10, 95),
    pressureResist: clamp(Math.round(50 + normal(r) * 15 + pressureBonus), 10, 95),
  };
}

/** 나이·성장형에 따른 XP 효율(SPEC §4.1: 14세 1.3 → 25세 1.0 → 33세 0.6 근처) */
export function ageCurve(age: number, type: GrowthType): number {
  let base = age <= 14 ? 1.5 : age <= 17 ? 1.35 : age <= 20 ? 1.15 : age <= 23 ? 1.0 : age <= 26 ? 0.8 : age <= 29 ? 0.55 : 0.3;
  if (type === 'early') base *= age <= 19 ? 1.2 : age >= 24 ? 0.7 : 1;
  if (type === 'late') base *= age <= 19 ? 0.85 : age >= 23 && age <= 29 ? 1.3 : 1;
  if (type === 'longevity') base *= age >= 27 ? 1.3 : 1;
  return base;
}

export type TrainingId = 'sim' | 'longrun' | 'physical' | 'wet' | 'kart' | 'data' | 'mental' | 'rest';

export interface TrainingProgram {
  id: TrainingId;
  label: string;
  xp: Partial<Stats>;
  /** 유로/칸 */
  cost: number;
  fatigue: number;
  pressureRelief?: number;
}

export const TRAINING: Record<TrainingId, TrainingProgram> = {
  sim: { id: 'sim', label: '시뮬레이터 세션', xp: { pace: 70, feedback: 50 }, cost: 20_000, fatigue: 1 },
  longrun: { id: 'longrun', label: '레이스 시뮬레이션(롱런)', xp: { tyre: 60, consistency: 50 }, cost: 0, fatigue: 1 },
  physical: { id: 'physical', label: '피지컬 트레이닝', xp: { consistency: 70 }, cost: 10_000, fatigue: 1.5 },
  wet: { id: 'wet', label: '우천 테스트', xp: { wet: 110 }, cost: 40_000, fatigue: 1 },
  kart: { id: 'kart', label: '카트 복귀 훈련', xp: { racecraft: 100 }, cost: 15_000, fatigue: 1 },
  data: { id: 'data', label: '엔지니어 데이터 분석', xp: { feedback: 100 }, cost: 0, fatigue: 0.5 },
  mental: { id: 'mental', label: '멘탈 코칭', xp: {}, cost: 30_000, fatigue: 0, pressureRelief: 15 },
  rest: { id: 'rest', label: '휴식', xp: {}, cost: 0, fatigue: -3 },
};

export const TRAINING_SLOTS = 6;
export const TRAINING_SLOTS_RESERVE = 8;

/** "추천 계획" 버튼(SPEC §4.1). 휴식 1칸 + 나머지를 약점/강점/균형으로 채운다. 같은 프로그램은 최대 2칸 */
export function recommendedPlan(stats: Stats, mode: 'weakness' | 'strength' | 'balanced', slots = TRAINING_SLOTS, focus: StatKey[] = []): TrainingId[] {
  const plan: TrainingId[] = ['rest'];
  const used: Partial<Record<TrainingId, number>> = { rest: 1 };
  const programs = (Object.keys(TRAINING) as TrainingId[]).filter((id) => id !== 'rest' && id !== 'mental');
  while (plan.length < slots) {
    let best: TrainingId = 'longrun';
    let bestScore = -Infinity;
    for (const id of programs) {
      if ((used[id] ?? 0) >= 2) continue;
      const xp = TRAINING[id].xp;
      let score = 0;
      for (const k of STAT_KEYS) {
        const v = xp[k] ?? 0;
        if (!v) continue;
        const want = mode === 'weakness' ? 100 - stats[k] : mode === 'strength' ? stats[k] : 60;
        score += v * want * (focus.includes(k) ? 1.3 : 1);
      }
      score -= (used[id] ?? 0) * (mode === 'balanced' ? 4000 : 1500);
      if (score > bestScore) { bestScore = score; best = id; }
    }
    plan.push(best);
    used[best] = (used[best] ?? 0) + 1;
  }
  return plan;
}

export interface TrainingResult {
  xp: Partial<Stats>;
  cost: number;
  fatigue: number;
  pressureRelief: number;
  overtrained: boolean;
}

export function trainingOutcome(plan: TrainingId[], freeSim: boolean): TrainingResult {
  const xp: Partial<Stats> = {};
  let cost = 0;
  let fatigue = 0;
  let pressureRelief = 0;
  for (const id of plan) {
    const p = TRAINING[id];
    for (const k of STAT_KEYS) if (p.xp[k]) xp[k] = (xp[k] ?? 0) + (p.xp[k] ?? 0);
    cost += id === 'sim' && freeSim ? 0 : p.cost;
    fatigue += p.fatigue;
    pressureRelief += p.pressureRelief ?? 0;
  }
  return { xp, cost, fatigue, pressureRelief, overtrained: !plan.includes('rest') && plan.length >= TRAINING_SLOTS };
}

/** 세션별 경기 XP(SPEC §4.2) */
export const SESSION_XP = {
  practice: { feedback: 12, tyre: 8 } as Partial<Stats>,
  quali: { pace: 16 } as Partial<Stats>,
  race: { racecraft: 16, consistency: 12, tyre: 8 } as Partial<Stats>,
  wet: { wet: 16 } as Partial<Stats>,
};

export function addXp(into: Partial<Stats>, add: Partial<Stats>, mult = 1): void {
  for (const k of STAT_KEYS) if (add[k]) into[k] = (into[k] ?? 0) + (add[k] ?? 0) * mult;
}

/** 다음 1점까지 필요한 XP. 잠재력에 가까울수록 급격히 커진다 */
export function xpNeeded(value: number, potential: number): number {
  // 잠재력을 넘는 성장은 거의 막는다(×25). 잠재력 8점 전부터 점점 느려진다
  const near = value >= potential ? 25 : value >= potential - 8 ? 1 + (value - (potential - 8)) * 0.6 : 1;
  return 40 * (1 + value / 50) * near;
}

/** XP를 반영한다. 돌려주는 raised는 오른 점수 */
export function applyXp(stats: Stats, bank: Stats, gains: Partial<Stats>, potential: number): Partial<Stats> {
  const raised: Partial<Stats> = {};
  for (const k of STAT_KEYS) {
    bank[k] += Math.round(gains[k] ?? 0);
    let need = xpNeeded(stats[k], potential);
    while (bank[k] >= need && stats[k] < 99) {
      bank[k] -= need;
      stats[k] += 1;
      raised[k] = (raised[k] ?? 0) + 1;
      need = xpNeeded(stats[k], potential);
    }
  }
  return raised;
}

/** 노화(SPEC §4.4): 전성기 종료 나이 이후 시즌마다 하락. 반응속도 계열이 먼저 떨어진다 */
export function applyAging(stats: Stats, age: number, hidden: Hidden, rng: Rng): Partial<Stats> {
  const drop: Partial<Stats> = {};
  if (age <= hidden.peakEnd) return drop;
  const years = age - hidden.peakEnd;
  for (const k of STAT_KEYS) {
    const fast = k === 'pace' || k === 'wet';
    const d = fast ? int(rng, 1, Math.min(4, 1 + years)) : int(rng, 0, Math.min(2, years));
    if (d > 0) {
      stats[k] = Math.max(20, stats[k] - d);
      drop[k] = d;
    }
  }
  return drop;
}
