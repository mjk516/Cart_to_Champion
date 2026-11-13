// 성장과 노화(SPEC §4). 능력치마다 XP가 쌓이고 기준치를 넘으면 1씩 오른다.
// ⚠️ 수치는 초기값. scripts/balance.ts로 조정한다.

import { PERSONALITIES } from './creation';
import { int, normal, rngFor, weightedPick, type Rng } from './rng';
import { STAT_KEYS, type Difficulty, type Personality, type StatKey, type Stats } from './types';

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

/** 난이도별 잠재력 보정(SPEC v0.45): 쉬움 +2~3(반반, 시드로), 어려움 −2, 보통은 그대로. 1점 차이가 챔피언 확률을 크게 바꿔서 쉬움은 반반으로 맞춘다 */
export const DIFFICULTY_INFO: Record<Difficulty, { label: string; desc: string; champion: string }> = {
  easy: { label: '쉬움', desc: '키울 수 있는 능력치가 높다. 월드 챔피언의 꿈을 맛보고 싶다면', champion: '약 45%' },
  normal: { label: '보통', desc: '기본 밸런스. 노력과 운, 좋은 팀이 모두 맞아야 챔피언', champion: '약 20%' },
  hard: { label: '어려움', desc: '어떤 훈련을 하느냐에 따라 성장이 크게 갈린다. 실제 F1처럼 챔피언은 극소수만', champion: '약 6%' },
};

/** 커리어의 난이도(이전 저장 파일은 보통) */
export function difficultyOf(c: { setup?: { difficulty?: Difficulty } }): Difficulty {
  return c.setup?.difficulty ?? 'normal';
}

export function difficultyPotential(seed: number, difficulty: Difficulty): number {
  // v0.46: 쉬움·보통은 키울 수 있는 능력치를 올렸다(보통 +1, 쉬움 +3~4)
  if (difficulty === 'easy') return rngFor(seed, 'difficulty')() < 0.5 ? 3 : 4;
  return difficulty === 'hard' ? -1 : 1;
}

export function generateHidden(seed: number, personality: Personality, difficulty: Difficulty = 'normal'): Hidden {
  const r = rngFor(seed, 'hidden');
  // 기질에 따라 잠재력 분포가 다르다(SPEC §3.4 v0.11): 좋은 성격은 좁고 낮은 상한, 나쁜 성격은 넓고 높은 상한
  const t = PERSONALITIES[personality].temperament;
  // v0.40: 성격별 챔피언 확률 차이를 줄이려고 평균을 맞추고 나쁜 기질의 상한을 낮췄다(넓은 분포는 그대로)
  const potential = t === 'good'
    ? clamp(Math.round(82.5 + normal(r) * 2.5), 78, 88)
    : t === 'bad'
      ? clamp(Math.round(82.5 + normal(r) * 4), 75, 90)
      : clamp(Math.round(82 + normal(r) * 3), 77, 88);
  const growthType = weightedPick<GrowthType>(r, ['early', 'standard', 'late', 'longevity'], (g) =>
    g === 'early' ? (personality === 'instinctive' ? 0.4 : 0.25)
      : g === 'standard' ? 0.4
        : g === 'late' ? 0.2
          : personality === 'analytical' ? 0.3 : 0.15,
  );
  // 전성기는 37세까지 유지되고 38세부터 능력치가 떨어진다(SPEC §4.4 v0.14). 장기 유지형은 1~2년 더 버틴다
  const peakEnd = growthType === 'longevity' ? 38 + int(r, 0, 1) : 37;
  // v0.40: 쇼맨형의 압박 내성 감점(−15)을 없앴다(성격별 챔피언 확률 맞춤)
  const pressureBonus = personality === 'calm' || personality === 'fighter' ? 15 : 0;
  return {
    potential: potential + difficultyPotential(seed, difficulty),
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
  /** 화면 설명: 어떤 훈련이고 어디에 좋은가 */
  desc: string;
}

export const TRAINING: Record<TrainingId, TrainingProgram> = {
  sim: { id: 'sim', label: '시뮬레이터 세션', xp: { pace: 70, feedback: 50 }, cost: 20_000, fatigue: 1, desc: '가상 주행으로 한계 속도를 다듬는다. 피드백도 함께 는다' },
  longrun: { id: 'longrun', label: '레이스 시뮬레이션(롱런)', xp: { tyre: 60, consistency: 50 }, cost: 0, fatigue: 1, desc: '레이스 거리를 그대로 달려 타이어를 아끼는 법과 꾸준함을 익힌다' },
  physical: { id: 'physical', label: '피지컬 트레이닝', xp: { consistency: 70 }, cost: 10_000, fatigue: 1.5, desc: '체력이 받쳐 줘야 끝까지 실수 없이 달린다' },
  wet: { id: 'wet', label: '우천 테스트', xp: { wet: 110 }, cost: 40_000, fatigue: 1, desc: '젖은 트랙만 골라 달린다. 비 오는 레이스에서 차이가 난다' },
  kart: { id: 'kart', label: '카트 복귀 훈련', xp: { racecraft: 100 }, cost: 15_000, fatigue: 1, desc: '바퀴를 맞대는 카트로 돌아가 추월·방어 감각을 되살린다' },
  data: { id: 'data', label: '엔지니어 데이터 분석', xp: { feedback: 100 }, cost: 0, fatigue: 0.5, desc: '엔지니어와 데이터를 보며 차 세팅을 말로 설명하는 힘을 기른다' },
  mental: { id: 'mental', label: '멘탈 코칭', xp: {}, cost: 30_000, fatigue: 0, pressureRelief: 15, desc: '능력치는 오르지 않지만 언론 압박을 크게 줄인다' },
  rest: { id: 'rest', label: '휴식', xp: {}, cost: 0, fatigue: -3, desc: '능력치는 오르지 않지만 컨디션을 되찾고 부상 위험을 낮춘다' },
};

export const TRAINING_SLOTS = 6;
export const TRAINING_SLOTS_RESERVE = 8;

/**
 * 한 해 훈련 3번(SPEC v0.46): 시즌 전 + 시즌 중 1번(여름 휴식기 전) + 시즌 후.
 * 시즌 계획(6칸, 리저브 8칸) 중 마지막 2칸이 시즌 중 훈련이다. 시즌 후 훈련은 비용 없는 프로그램만 2칸.
 */
export const MID_SLOTS = 2;
export const POST_SLOTS = 2;
export const POST_TRAINING_IDS: TrainingId[] = ['data', 'mental', 'longrun', 'rest'];
export function preSlotsOf(slots: number): number { return slots - MID_SLOTS; }
/** F1 레이스 시즌의 시즌 중 훈련(SPEC v0.48): 시즌 계획 6칸과 따로 2칸, 그랑프리 사이 훈련 세션에서 한다 */
export const F1_MID_SLOTS = 2;
/** 시즌 계획 안에 시즌 중 칸이 있는가: F1 레이스 시즌은 따로(0), 그 밖은 계획의 마지막 2칸 */
export function inPlanMidSlots(f1Race: boolean): number { return f1Race ? 0 : MID_SLOTS; }
/** 시즌 중 훈련을 바꿀 수 있는 라운드(캘린더 30% 무렵, 여름 휴식기 전) */
export function midTrainingRound(rounds: number): number { return Math.max(1, Math.round(rounds * 0.3)); }

/** 어려움(SPEC v0.46): 어떤 훈련을 하느냐에 따라 효과 차이가 크다. 평균보다 낮은 능력치를 키우면 ×1.4, 높은 능력치는 ×0.3 */
export function trainEffect(stats: Stats, k: StatKey, difficulty: Difficulty): number {
  if (difficulty !== 'hard') return 1;
  const mean = STAT_KEYS.reduce((a, s) => a + stats[s], 0) / STAT_KEYS.length;
  return stats[k] < mean ? 1.4 : 0.3;
}

/** 시즌 후 훈련 결과(비용 없음, 멘탈 코칭도 이때는 무료) */
export function postTrainingOutcome(plan: TrainingId[]): { xp: Partial<Stats>; pressureRelief: number; fatigue: number } {
  const xp: Partial<Stats> = {};
  let pressureRelief = 0;
  let fatigue = 0;
  for (const id of plan.filter((p) => POST_TRAINING_IDS.includes(p)).slice(0, POST_SLOTS)) {
    const p = TRAINING[id];
    for (const k of STAT_KEYS) if (p.xp[k]) xp[k] = (xp[k] ?? 0) + (p.xp[k] ?? 0);
    pressureRelief += p.pressureRelief ?? 0;
    fatigue += p.fatigue;
  }
  return { xp, pressureRelief, fatigue };
}

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

export function trainingOutcome(plan: TrainingId[], freeSim: boolean, preCount?: number): TrainingResult {
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
  // 과훈련은 시즌 전 계획으로 판단한다(시즌 중 훈련을 바꿔도 이미 치른 레이스가 달라지지 않게, SPEC v0.46)
  const pre = plan.slice(0, preCount ?? preSlotsOf(Math.max(plan.length, TRAINING_SLOTS)));
  return { xp, cost, fatigue, pressureRelief, overtrained: !pre.includes('rest') && plan.length >= TRAINING_SLOTS };
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
export function xpNeeded(value: number, potential: number, window = 8): number {
  // 잠재력을 넘는 성장은 거의 막는다(×25). 잠재력 window점 전부터 점점 느려진다(어려움은 16점 전부터, SPEC v0.46)
  const near = value >= potential ? 25 : value >= potential - window ? 1 + (value - (potential - window)) * (4.8 / window) : 1;
  return 40 * (1 + value / 50) * near;
}

/** XP를 반영한다. 돌려주는 raised는 오른 점수 */
/** 난이도별 성장 둔화 구간(어려움은 잠재력 16점 전부터 느려져 훈련량이 최종 능력치를 크게 좌우한다) */
export function growthWindow(difficulty: Difficulty): number { return difficulty === 'hard' ? 16 : 8; }

export function applyXp(stats: Stats, bank: Stats, gains: Partial<Stats>, potential: number, window = 8): Partial<Stats> {
  const raised: Partial<Stats> = {};
  for (const k of STAT_KEYS) {
    bank[k] += Math.round(gains[k] ?? 0);
    let need = xpNeeded(stats[k], potential, window);
    while (bank[k] >= need && stats[k] < 99) {
      bank[k] -= need;
      stats[k] += 1;
      raised[k] = (raised[k] ?? 0) + 1;
      need = xpNeeded(stats[k], potential, window);
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
