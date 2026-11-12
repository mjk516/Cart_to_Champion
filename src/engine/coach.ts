// 트레이너·코치(SPEC v0.34): 드라이빙 코치와 피지컬 트레이너가 훈련 계획을 조언한다.
// 조언대로 계획을 짜면 손해를 보지 않는다: 과훈련·자금 부족으로 인한 훈련 축소·압박 실수가 없고, 코치 실력만큼 훈련 효과가 붙는다.

import { type Career } from './careerCore';
import { WEALTH_TIERS } from './creation';
import { recommendedPlan, TRAINING, TRAINING_SLOTS, TRAINING_SLOTS_RESERVE, type TrainingId } from './growth';
import { fictionalName } from './names';
import { rngFor } from './rng';
import { STAT_KEYS, type StatKey } from './types';

export interface Coach {
  name: string;
  nationality: string;
  /** 1~5 */
  skill: number;
}

export interface CoachStaff {
  coach: Coach;
  trainer: Coach;
  /** "팀 소속", "아카데미 소속", "가족이 고용" 같은 설명 */
  source: string;
}

export interface CoachAdvice {
  staff: CoachStaff;
  plan: TrainingId[];
  /** 코치·트레이너가 하는 말 */
  coachLines: string[];
  trainerLines: string[];
  /** 조언대로 하면 붙는 훈련 효과 배율(1.04 = +4%) */
  bonus: number;
}

const STAT_KO: Record<StatKey, string> = {
  pace: '페이스', racecraft: '레이스크래프트', consistency: '일관성', wet: '우천', tyre: '타이어 관리', feedback: '피드백',
};

/** 지금 팀(또는 아카데미·가족)이 붙여 주는 코치진. 팀이 바뀌면 사람도 바뀐다 */
export function coachStaff(c: Career): CoachStaff {
  const k = c.contract;
  const key = k ? `${k.series}:${k.team}` : `none:${c.academy ?? ''}`;
  const r = rngFor(c.seed, 'coach-staff', key);
  const fac = k?.facility ?? 0.4;
  const top = k?.series === 'f1' ? 5 : c.academy ? 4 : 3;
  const base = Math.max(1, Math.min(top, Math.round(1 + fac * 4)));
  const roll = (): number => Math.max(1, Math.min(top, base + (r() < 0.3 ? 1 : r() < 0.3 ? -1 : 0)));
  const a = fictionalName(r);
  const b = fictionalName(r, new Set([a.first]));
  const source = k?.series === 'f1' ? `${k.team} 소속` : c.academy ? `${c.academy} 소속` : k ? `${k.team}에서 소개` : '가족이 고용';
  return {
    coach: { name: a.name, nationality: a.nationality, skill: roll() },
    trainer: { name: b.name, nationality: b.nationality, skill: roll() },
    source,
  };
}

function slotsOf(c: Career): number {
  return c.contract?.seat === 'race' ? TRAINING_SLOTS : TRAINING_SLOTS_RESERVE;
}

function freeSimOf(c: Career): boolean {
  return !!c.academy || c.contract?.series === 'f1' || (c.contract?.facility ?? 0) >= 0.8;
}

/** 훈련에 쓸 수 있는 돈(시즌 시작 때 확실히 들어오고 나가는 것만) */
export function trainingBudget(c: Career): number {
  const k = c.contract;
  let money = c.funds;
  if (k && k.seatCost > 0) {
    const covered = (!!c.academy && k.series !== 'f1') || k.management;
    if (!covered) money -= k.seatCost;
  }
  if (c.age < 21 && c.f1Debut === null) money += WEALTH_TIERS[c.driver.wealthTier].familySupport;
  return money;
}

function planCost(plan: TrainingId[], freeSim: boolean): number {
  return plan.reduce((a, id) => a + (id === 'sim' && freeSim ? 0 : TRAINING[id].cost), 0);
}

/** 코치·트레이너 조언. plan은 손해 없이 짤 수 있는 계획이다 */
export function coachAdvice(c: Career): CoachAdvice {
  const staff = coachStaff(c);
  const slots = slotsOf(c);
  const freeSim = freeSimOf(c);
  const s = c.driver.stats;
  const plan = recommendedPlan(s, 'weakness', slots, c.driver.focus);
  const coachLines: string[] = [];
  const trainerLines: string[] = [];
  const sorted = [...STAT_KEYS].sort((a, b) => s[a] - s[b]);
  const weak = sorted.slice(0, 2);
  coachLines.push(`${STAT_KO[weak[0]!]}(${s[weak[0]!]})와 ${STAT_KO[weak[1]!]}(${s[weak[1]!]})가 제일 아쉬워. 이번 시즌은 여기부터 메우자.`);
  const strong = sorted[sorted.length - 1]!;
  coachLines.push(`${STAT_KO[strong]}(${s[strong]})는 이미 강점이니 경기에서 쓰면 돼. 훈련 칸을 더 쓸 필요는 없어.`);

  // 압박이 한계에 가까우면 멘탈 코칭 한 칸
  const nearLimit = c.media.pressure > c.driver.hidden.pressureResist - 10;
  if (nearLimit && !plan.includes('mental')) {
    const i = plan.length - 1;
    if (i > 0) plan[i] = 'mental';
    trainerLines.push('요즘 표정이 굳어 있어. 멘탈 코칭을 한 칸 넣자. 압박 때문에 실수하는 일은 내가 막아 줄게.');
  }
  trainerLines.push('휴식은 한 칸 꼭 남겨 둬. 쉬지 않으면 시즌 후반에 몸이 버티지 못해.');

  // 돈이 모자라면 유료 프로그램을 무료(롱런·데이터 분석)로 바꾼다
  const budget = Math.max(0, trainingBudget(c));
  let changed = false;
  const free: TrainingId[] = ['longrun', 'data'];
  for (let guard = 0; planCost(plan, freeSim) > budget && guard < plan.length * 2; guard++) {
    let idx = -1;
    let worst = 0;
    plan.forEach((id, i) => {
      const cost = id === 'sim' && freeSim ? 0 : TRAINING[id].cost;
      if (cost > worst) { worst = cost; idx = i; }
    });
    if (idx < 0) break;
    plan[idx] = free[guard % 2]!;
    changed = true;
  }
  if (changed) trainerLines.push('지금 자금으로는 유료 프로그램을 다 못 해. 무료 롱런과 데이터 분석으로 바꿔 놨어.');

  const bonus = 1 + 0.02 * (staff.coach.skill + staff.trainer.skill) / 2;
  return { staff, plan, coachLines, trainerLines, bonus: Math.round(bonus * 1000) / 1000 };
}

/** 계획이 코치 조언과 같은가(칸 순서는 상관없다) */
export function followsCoach(c: Career, plan: TrainingId[]): boolean {
  const want = coachAdvice(c).plan;
  const p = plan.slice(0, slotsOf(c));
  if (p.length !== want.length) return false;
  const a = [...p].sort().join(',');
  const b = [...want].sort().join(',');
  return a === b;
}
