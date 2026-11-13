// 랩 단위 레이스 엔진(SPEC §5.1, §5.5).
// - 모든 난수는 시드에서 나온다. 같은 입력 + 같은 무전 선택이면 결과가 항상 같다.
// - 무전 지점에서 선택이 없으면 'pending'을 돌려준다. 선택을 넣고 다시 호출하면 처음부터 같은 흐름으로 다시 계산해 이어진다.
// - postSeed는 예측용: 지정한 랩부터 난수 스트림만 바꿔 "이후가 어떻게 될 수 있는지"를 여러 번 돌린다.

import { NEUTRAL_RACE, PERSONALITIES } from './creation';
import { CAR_WEIGHT, ovr, POINTS_RACE, POINTS_SPRINT } from './data';
import { hashSeed, int, normal, rngFor, weightedPick, type Rng } from './rng';
import type { Circuit, Compound, Driver, Personality, Stats, Team } from './types';
import { circuitTyreData, COMPOUND_OFFSET, DEG, isWetTyre, LIFE, raceForecast, strategyStyleOf, teamStrategies, TYRE_NAME, weatherPlan, type Weather } from './strategy';

export type Phase = 'green' | 'sc' | 'vsc' | 'red';
export type RadioTrigger = 'sc' | 'vsc' | 'rain_start' | 'rain_stop' | 'pit_window' | 'red_flag';
export type RadioOptionId =
  | 'pit_hard' | 'pit_medium' | 'stay_out' | 'pit'
  | 'inters_now' | 'one_more_lap' | 'stay_slicks'
  | 'slicks_now' | 'stay_inters'
  // v0.40: 풀웻, 피트 창(계획한 피트스톱 2랩 전), 성격 전략(도박·데이터)
  | 'wets_now' | 'pit_plan' | 'pit_now' | 'extend' | 'gamble_soft' | 'data_optimal' | 'pit_soft' | 'pit_data' | 'radar_wait' | 'slicks_soft'
  // v0.46: 레드 플래그 중 무료 타이어 교체
  | 'rf_S' | 'rf_M' | 'rf_H' | 'rf_I' | 'rf_W';

export interface RadioOption {
  id: RadioOptionId; label: string; recommended: boolean;
  /** 엔지니어가 짚어 주는 이 선택의 장단점(숫자 예상 대신, SPEC §5.5 v0.31) */
  note?: string;
}
/**
 * 세이프티카·VSC·레드 플래그 상황 정보(SPEC §5.5 v0.30): 사고 지점, 크기, 예상 시간.
 * 실제 시간은 발령 다음 랩에 정해져서, 예상보다 짧거나 길게 끝날 수 있다(무전 선택 뒤의 운).
 */
export interface Neutralization {
  phase: Exclude<Phase, 'green'>;
  /** 사고 지점(랩 비율 0~1, 출발선 기준) */
  at: number;
  severity: 'S' | 'M' | 'L';
  /** 예상 랩 수 */
  expectedLaps: number;
  /** 예상보다 짧게(1랩 덜) 끝날 확률 */
  shorter: number;
  /** 예상보다 길게(1~2랩 더) 끝날 확률 */
  longer: number;
  /** 사고 차(잔해면 없음) */
  car?: string;
}
export interface RadioDecision {
  id: string; lap: number; trigger: RadioTrigger; options: RadioOption[]; neutral?: Neutralization;
  /** 엔지니어 한마디: 지금 상황과 추천 이유 */
  advice?: string;
  /** 급박한 상황: 드라이버에게 묻지 않고 팀이 바로 정한다(그 이유) */
  urgent?: string;
}

export interface RaceCar {
  id: string;
  code: string;
  teamId: string;
  stats: Stats;
  personality?: Personality;
  /** 성격 행동 계수에 곱하는 값(예: 가족이 생기면 공격성이 줄어든다, SPEC §6 v0.25) */
  behaviorMul?: Partial<Behavior>;
  teamQuality: number;
  reliability: number;
  ops: number;
}

export interface RaceInput {
  seed: number;
  circuit: Circuit;
  cars: RaceCar[];
  /** 출발 순서(차 id) */
  grid: string[];
  kind: 'race' | 'sprint';
  carWeight?: number;
  myCarId?: string;
  /** 무전 선택: decision.id → 선택지 */
  radio?: Partial<Record<string, RadioOptionId>>;
  /** 선택이 없으면 엔지니어 추천을 따른다(자동 진행·건너뛰기·예측) */
  autoRadio?: boolean;
  postSeed?: { fromLap: number; seed: number };
  /** 하부 리그용 덮어쓰기: 랩 수, 의무 피트 여부, 포인트표 */
  laps?: number;
  mandatoryStop?: boolean;
  points?: readonly number[];
  /** 결과 규칙(F1): 우승 가능한 팀, 팀별 최고 순위 제한(신생팀) */
  rules?: ResultRules;
  /** 내 차 전략(전략 회의, SPEC v0.40): teamStrategies의 선택지 id. 없으면 예전처럼 팀이 알아서 */
  myPlan?: string;
  /** 내 차 출발 타이어(없으면 고른 전략의 출발 타이어) */
  myStart?: Compound;
}

export interface ResultRules {
  /** 레이스 우승이 가능한 팀 id. 비어 있으면 제한 없음 */
  winnerTeams?: readonly string[];
  /** 팀별로 오를 수 있는 가장 높은 순위. 예: 11 = 포인트 없음, 4 = 포디움 없음 */
  bestPosition?: Readonly<Record<string, number>>;
  /** 우승 가능 팀이 아닌 차가 1위로 들어왔을 때 우승을 인정할 확률(이변). 0이면 절대 인정하지 않는다 */
  upsetChance?: number;
}

/**
 * 결과 규칙을 적용해 순서를 다시 정한다(SPEC §5.1 v0.11).
 * 1) 앞에서부터 보며 최고 순위 제한에 걸린 차를 허용된 자리로 내린다.
 * 2) 1위가 우승 가능 팀이 아니면, 우승 가능 팀 중 가장 앞선 차를 1위로 올린다.
 */
export function enforceOrder<T>(order: readonly T[], teamOf: (t: T) => string, rules?: ResultRules, roll = 1): T[] {
  if (!rules) return [...order];
  // 순위를 앞에서부터 채운다: 그 순위에 올 수 있는 차 중 원래 가장 앞선 차를 고른다.
  // 올 수 있는 차가 없으면(완주자가 제한 순위보다 적을 때) 남은 차 중 가장 앞선 차. 항상 끝난다.
  const queue = [...order];
  const out: T[] = [];
  while (queue.length) {
    const pos = out.length + 1;
    let k = queue.findIndex((t) => (rules.bestPosition?.[teamOf(t)] ?? 1) <= pos);
    if (k < 0) k = 0;
    out.push(...queue.splice(k, 1));
  }
  const winners = rules.winnerTeams;
  const upset = roll < (rules.upsetChance ?? 0);
  if (winners && winners.length && out[0] && !winners.includes(teamOf(out[0])) && !upset) {
    const j = out.findIndex((t) => winners.includes(teamOf(t)));
    if (j > 0) out.unshift(...out.splice(j, 1));
  }
  return out;
}

export type Incident =
  | { type: 'overtake'; lap: number; by: string; on: string; position: number }
  | { type: 'lead_change'; lap: number; leader: string }
  | { type: 'crash' | 'mech_dnf'; lap: number; car: string; neutralization: Phase | 'none' }
  | { type: 'debris'; lap: number }
  | { type: 'sc_deploy' | 'vsc_deploy' | 'red_flag'; lap: number; info?: Neutralization }
  | { type: 'sc_end' | 'vsc_end'; lap: number; /** 실제 − 예상 랩 수 */ vsExpected?: number }
  | { type: 'restart'; lap: number }
  | { type: 'neutral_update'; lap: number; delta: number; phase: Exclude<Phase, 'green'> }
  | { type: 'pit'; lap: number; car: string; compound: Compound; under: Phase }
  | { type: 'rain_start' | 'rain_stop'; lap: number }
  | { type: 'radio'; lap: number; decisionId: string; choice: RadioOptionId; /** 팀이 급박해서 바로 정했다 */ forced?: string };

export interface LapEntry { id: string; gap: number; compound: Compound; stops: number }
export interface LapRecord { lap: number; phase: Phase; wet: boolean; order: LapEntry[] }

export interface Classified {
  id: string;
  code: string;
  position: number;
  status: 'finished' | 'dnf';
  laps: number;
  /** 1위와의 차이(초), 완주자만 */
  gap?: number;
  points: number;
  grid: number;
  stops: number;
  reason?: string;
}

export type RaceOutcome =
  | { status: 'finished'; totalLaps: number; laps: LapRecord[]; incidents: Incident[]; classification: Classified[] }
  | { status: 'pending'; totalLaps: number; decision: RadioDecision; laps: LapRecord[]; incidents: Incident[] };

// ── 상수(초기값, 밸런스 스크립트로 조정) ─────────────────────────────
/** 레이스당 기대 발생 횟수 λ (SPEC §5.5: SC 45%, VSC 30%, 레드 8% 안팎이 목표) */
const HAZARD = { red: 0.1, sc: 0.5, vsc: 0.3, crash: 0.3, mech: 0.45 };
const PACE_SPREAD = 0.11;
/** 사고 크기별 예상 랩 수와 짧게/길게 끝날 확률 */
const NEUTRAL_PLAN: Record<'sc' | 'vsc', Record<'S' | 'M' | 'L', { laps: number; shorter: number; longer: number }>> = {
  sc: { S: { laps: 3, shorter: 0.3, longer: 0.15 }, M: { laps: 4, shorter: 0.22, longer: 0.3 }, L: { laps: 5, shorter: 0.15, longer: 0.4 } },
  vsc: { S: { laps: 1, shorter: 0, longer: 0.25 }, M: { laps: 2, shorter: 0.3, longer: 0.3 }, L: { laps: 2, shorter: 0.15, longer: 0.45 } },
};
/** 예상보다 짧게 끝나면 그 사이 피트에 들어간 차가 잃는 시간, 길게 끝나면 버는 시간(초) */
const NEUTRAL_SHORT_PENALTY = 2.2;
const NEUTRAL_LONG_BONUS = 1.6;

export interface Behavior { overtakeAttempt: number; contactRisk: number; mistake: number; lapVariance: number; fightback: number }

interface CarState {
  car: RaceCar;
  beh: Behavior;
  grid: number;
  time: number;
  compound: Compound;
  tyreAge: number;
  stops: number;
  dryUsed: Set<Compound>;
  planned: number[];
  out: boolean;
  lapsDone: number;
  reason?: string;
  lastPitLap: number;
  pitThisLap: Compound | null;
  pitNextLap: Compound | null;
  radioLap: number;
  /** 레드 플래그 때 플레이어가 고른 타이어(SPEC v0.46) */
  redTyre?: Compound;
  holdRain: boolean;
  holdDryUntil: number;
  lostPositionLap: number;
  /** 젖은 타이어(인터·풀웻)를 썼다: 의무 피트스톱(두 컴파운드) 규칙이 없어진다 */
  usedWet: boolean;
  /** 계획한 피트에서 끼울 타이어(순서대로, 내 차 전략) */
  nextQueue: Compound[];
  /** 이 랩에 들어와 이 타이어로(레이더 대기 등) */
  pitAt?: { lap: number; c: Compound };
  /** 피트 창 무전을 이미 물어본 스톱 번호 */
  windowStop?: number;
}

export function carFromDriver(driver: Driver, team: Team): RaceCar {
  return {
    id: driver.id,
    code: driver.code,
    teamId: team.id,
    stats: driver.stats,
    personality: driver.personality,
    teamQuality: team.quality,
    reliability: team.reliability,
    ops: team.ops,
  };
}

function behaviorOf(car: RaceCar): Behavior {
  const b = car.personality ? PERSONALITIES[car.personality].race : NEUTRAL_RACE;
  const m = car.behaviorMul;
  if (!m) return b;
  return {
    overtakeAttempt: b.overtakeAttempt * (m.overtakeAttempt ?? 1), contactRisk: b.contactRisk * (m.contactRisk ?? 1),
    mistake: b.mistake * (m.mistake ?? 1), lapVariance: b.lapVariance * (m.lapVariance ?? 1), fightback: b.fightback * (m.fightback ?? 1),
  };
}

export function raceLaps(circuit: Circuit, kind: 'race' | 'sprint'): number {
  return kind === 'race' ? circuit.laps : Math.ceil(100 / circuit.lengthKm);
}


function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

const RADIO_OPTIONS: Record<RadioTrigger, Array<{ id: RadioOptionId; label: string }>> = {
  pit_window: [
    { id: 'pit_plan', label: '계획대로 들어간다' },
    { id: 'pit_now', label: '지금 들어간다(언더컷)' },
    { id: 'extend', label: '3랩 더 버틴다(오버컷)' },
  ],
  sc: [
    { id: 'pit_hard', label: '피트 인 (하드)' },
    { id: 'pit_medium', label: '피트 인 (미디엄)' },
    { id: 'stay_out', label: '스테이 아웃' },
  ],
  vsc: [
    { id: 'pit', label: '피트 인' },
    { id: 'stay_out', label: '스테이 아웃' },
  ],
  rain_start: [
    { id: 'inters_now', label: '인터로 바로 교체' },
    { id: 'wets_now', label: '풀웻으로 바로 교체' },
    { id: 'one_more_lap', label: '한 랩 더 버티기' },
    { id: 'stay_slicks', label: '슬릭으로 끝까지' },
  ],
  rain_stop: [
    { id: 'slicks_now', label: '슬릭으로 교체' },
    { id: 'stay_inters', label: '인터 유지' },
  ],
  red_flag: [
    { id: 'rf_S', label: '소프트로 재출발' },
    { id: 'rf_M', label: '미디엄으로 재출발' },
    { id: 'rf_H', label: '하드로 재출발' },
    { id: 'rf_I', label: '인터미디어트로 재출발' },
    { id: 'rf_W', label: '풀웻으로 재출발' },
  ],
};

/** 성격 전략 선택지(공격형·본능형: 도박, 분석형·침착형: 데이터) */
const STYLE_OPTIONS: Record<'gamble' | 'data', Partial<Record<RadioTrigger, { id: RadioOptionId; label: string }>>> = {
  gamble: {
    sc: { id: 'pit_soft', label: '도박: 소프트로 갈아 끼우고 재시작 공격' },
    vsc: { id: 'pit_soft', label: '도박: 소프트로 갈아 끼우고 몰아친다' },
    pit_window: { id: 'gamble_soft', label: '도박: 지금 소프트로, 남은 랩은 몰아친다' },
    rain_stop: { id: 'slicks_soft', label: '도박: 바로 소프트로' },
  },
  data: {
    sc: { id: 'pit_data', label: '데이터: 남은 랩에 맞춘 타이어로 피트' },
    vsc: { id: 'pit_data', label: '데이터: 남은 랩에 맞춘 타이어로 피트' },
    pit_window: { id: 'data_optimal', label: '데이터: 타이어 수명 모델의 최적 랩에' },
    rain_start: { id: 'radar_wait', label: '데이터: 레이더 보고 2랩 뒤 교체' },
  },
};

export function runRace(input: RaceInput): RaceOutcome {
  const { circuit } = input;
  const L = input.laps ?? raceLaps(circuit, input.kind);
  const w = input.carWeight ?? CAR_WEIGHT.f1;
  const planSeed = input.postSeed && input.postSeed.fromLap <= 1 ? input.postSeed.seed : input.seed;
  const weather = weatherPlan(planSeed, circuit, L);
  const isWetLap = (lap: number) => !!weather && lap >= weather.start && lap < weather.end + 2;
  const isRainLap = (lap: number) => !!weather && lap >= weather.start && lap < weather.end;
  const isHeavyLap = (lap: number) => isRainLap(lap) && !!weather?.heavy;
  const wetTyre = (): Compound => (weather?.heavy ? 'W' : 'I');
  const mandatoryStop = input.mandatoryStop ?? input.kind === 'race';

  const byId = new Map(input.cars.map((c) => [c.id, c]));
  const states: CarState[] = input.grid.map((id, i) => {
    const car = byId.get(id);
    if (!car) throw new Error(`grid has unknown car ${id}`);
    const rs = rngFor(planSeed, 'strategy', circuit.id, input.kind, id);
    const twoStop = mandatoryStop && (circuit.deg >= 1.2 ? rs() < 0.6 : rs() < 0.15);
    const planned = twoStop
      ? [Math.round(L * (0.28 + 0.08 * rs())), Math.round(L * (0.6 + 0.08 * rs()))]
      : mandatoryStop
        ? [Math.round(L * (0.38 + 0.22 * rs()))]
        : [];
    const wetStart = !!weather && weather.start <= 1;
    let compound: Compound = wetStart ? wetTyre() : twoStop ? 'S' : circuitTyreData(circuit.id).start === 'S' && !mandatoryStop ? 'S' : 'M';
    let stops = wetStart ? [] : planned;
    let nextQueue: Compound[] = [];
    let holdRain = false;
    // 내 차: 전략 회의에서 고른 전략·출발 타이어
    if (id === input.myCarId && (input.myPlan || input.myStart)) {
      const opts = teamStrategies(circuit, input.kind, L, raceForecast(planSeed, circuit, L), car.personality);
      const plan = opts.find((o) => o.id === input.myPlan) ?? opts[0]!;
      compound = input.myStart ?? plan.start;
      stops = mandatoryStop ? [...plan.stops] : [];
      nextQueue = mandatoryStop ? [...plan.next] : [];
      // 출발 타이어를 바꿔서 계획한 타이어가 모두 같아지면 두 컴파운드 규칙에 맞게 하나를 바꾼다
      if (mandatoryStop && !isWetTyre(compound) && nextQueue.length && nextQueue.every((c) => c === compound)) nextQueue[0] = compound === 'H' ? 'M' : 'H';
      if (wetStart && !isWetTyre(compound)) holdRain = true; // 슬릭 도박
    }
    return {
      car, beh: behaviorOf(car), grid: i + 1, time: i * 0.22, compound, tyreAge: 0, stops: 0,
      dryUsed: new Set<Compound>(isWetTyre(compound) ? [] : [compound]), planned: stops, out: false, lapsDone: 0, lastPitLap: 0,
      pitThisLap: null, pitNextLap: null, radioLap: -1, holdRain, holdDryUntil: 0, lostPositionLap: -99,
      usedWet: isWetTyre(compound), nextQueue,
    };
  });
  if (states.length !== input.cars.length) throw new Error('grid and cars length differ');

  const laps: LapRecord[] = [];
  const incidents: Incident[] = [];
  // startPhase(클로저)에서도 바뀌므로 리터럴로 좁혀지지 않게 Phase로 단언한다
  let phase = 'green' as Phase;
  let phaseLapsLeft = 0;
  let pendingPhase: Phase | null = null;
  let order: CarState[] = [...states];
  let leaderId = order[0]?.car.id ?? '';
  const my = input.myCarId ? states.find((s) => s.car.id === input.myCarId) : undefined;

  const retire = (s: CarState, lap: number, kind: 'crash' | 'mech_dnf', neutralization: Phase | 'none') => {
    s.out = true;
    s.lapsDone = lap - 1;
    s.reason = kind === 'crash' ? '사고' : '기계 결함';
    incidents.push({ type: kind, lap, car: s.car.id, neutralization });
  };
  const crashWeight = (s: CarState) => (1.35 - s.car.stats.consistency / 100) * s.beh.mistake;
  const mechWeight = (s: CarState) => 1.05 - s.car.reliability;

  // 지금 상황(사고 지점·크기·예상 시간)과, 다음 랩에 정할 실제 시간
  let neutral = null as Neutralization | null;
  let neutralRollLap = 0;
  let neutralExpected = 0;
  let neutralDelta = 0;
  const lastIncidentCar = () => {
    const last = incidents[incidents.length - 1];
    return last && last.lap === laps.length + 1 && (last.type === 'crash' || last.type === 'mech_dnf') ? last : null;
  };
  const startPhase = (p: Exclude<Phase, 'green'>, lap: number, _rng: Rng) => {
    phase = p;
    const nr = rngFor(input.seed, 'neutral', lap);
    const cause = lastIncidentCar();
    let info: Neutralization;
    if (p === 'red') {
      phaseLapsLeft = 1;
      info = { phase: 'red', at: nr(), severity: 'L', expectedLaps: 1, shorter: 0, longer: 0, car: cause?.car };
    } else {
      // 사고는 크기가 크고, 기계 결함·잔해는 작은 편
      const roll = nr();
      const severity: 'S' | 'M' | 'L' = cause?.type === 'crash'
        ? (roll < 0.35 ? 'L' : roll < 0.8 ? 'M' : 'S')
        : (roll < 0.1 ? 'L' : roll < 0.45 ? 'M' : 'S');
      const plan = NEUTRAL_PLAN[p][severity];
      phaseLapsLeft = plan.laps;
      info = { phase: p, at: nr(), severity, expectedLaps: plan.laps, shorter: plan.shorter, longer: plan.longer, car: cause?.car };
      neutralRollLap = lap + 1;
      neutralExpected = plan.laps;
      neutralDelta = 0;
    }
    neutral = info;
    incidents.push({ type: p === 'sc' ? 'sc_deploy' : p === 'vsc' ? 'vsc_deploy' : 'red_flag', lap, info });
  };

  for (let lap = 1; lap <= L; lap++) {
    const rng = input.postSeed && lap >= input.postSeed.fromLap
      ? rngFor(input.postSeed.seed, 'lap', lap)
      : rngFor(input.seed, 'lap', lap);
    const wet = isWetLap(lap);
    const raining = isRainLap(lap);
    const heavy = isHeavyLap(lap);
    const rainStartNow = !!weather && lap === weather.start && weather.start > 1;
    const rainStopNow = !!weather && lap === weather.end;
    if (rainStartNow) incidents.push({ type: 'rain_start', lap });
    if (rainStopNow) {
      incidents.push({ type: 'rain_stop', lap });
      for (const s of states) s.holdRain = false;
    }
    for (const s of states) s.pitThisLap = null;

    // 세이프티카·VSC 실제 시간: 발령 다음 랩에 정한다(무전을 고른 뒤라 선택만으로는 피할 수 없는 운)
    if (neutral && neutral.phase !== 'red' && lap === neutralRollLap && phase === neutral.phase) {
      const dr = input.postSeed && lap >= input.postSeed.fromLap ? rngFor(input.postSeed.seed, 'neutral-len', lap) : rngFor(input.seed, 'neutral-len', lap);
      const x = dr();
      const delta = x < neutral.shorter ? -1 : x < neutral.shorter + neutral.longer ? (neutral.severity === 'L' && dr() < 0.4 ? 2 : 1) : 0;
      if (delta) {
        phaseLapsLeft = Math.max(0, phaseLapsLeft + delta);
        neutralDelta = delta;
        incidents.push({ type: 'neutral_update', lap, delta, phase: neutral.phase });
        // 피트에 들어간 차: 짧게 끝나면 줄 뒤에서 손해, 길게 끝나면 거의 공짜 스톱
        const deploy = lap - 1;
        for (const s of states) {
          if (s.out || s.lastPitLap < deploy) continue;
          s.time += delta < 0 ? NEUTRAL_SHORT_PENALTY * (neutral.phase === 'vsc' ? 1.3 : 1) : -NEUTRAL_LONG_BONUS * Math.min(delta, 2) * (neutral.phase === 'vsc' ? 1.3 : 1);
        }
      }
      if (phaseLapsLeft <= 0) {
        incidents.push({ type: phase === 'sc' ? 'sc_end' : 'vsc_end', lap: lap - 1, vsExpected: neutralDelta });
        if (phase === 'sc') incidents.push({ type: 'restart', lap });
        phase = 'green';
        neutral = null;
      }
    }

    // ── 1. 레이스 통제 / 리타이어 판정 ──
    let deployedNow: Phase | null = null;
    if (pendingPhase && phase === 'green') {
      startPhase(pendingPhase, lap, rng);
      deployedNow = pendingPhase;
    }
    pendingPhase = null;

    const running = () => states.filter((s) => !s.out);
    if (phase === 'green' && running().length > 1) {
      const mult = (circuit.street ? 1.5 : 1) * (wet ? 2 : 1) * (lap === 1 ? 3 : 1);
      const per = (lambda: number) => (lambda * mult) / L;
      const r = rng();
      let acc = 0;
      if (r < (acc += per(HAZARD.red))) {
        const victim = weightedPick(rng, running(), crashWeight);
        retire(victim, lap, 'crash', 'red');
        if (rng() < 0.3 && running().length > 1) retire(weightedPick(rng, running(), crashWeight), lap, 'crash', 'red');
        startPhase('red', lap, rng);
        deployedNow = 'red';
      } else if (r < (acc += per(HAZARD.sc))) {
        const cause = rng();
        // 세이프티카는 늘 누군가의 리타이어 때문에 나온다(사고 75%, 기계 결함으로 트랙에 멈춤 25%)
        if (cause < 0.75) retire(weightedPick(rng, running(), crashWeight), lap, 'crash', 'sc');
        else retire(weightedPick(rng, running(), mechWeight), lap, 'mech_dnf', 'sc');
        startPhase('sc', lap, rng);
        deployedNow = 'sc';
      } else if (r < (acc += per(HAZARD.vsc))) {
        if (rng() < 0.6) retire(weightedPick(rng, running(), mechWeight), lap, 'mech_dnf', 'vsc');
        else retire(weightedPick(rng, running(), crashWeight), lap, 'crash', 'vsc');
        startPhase('vsc', lap, rng);
        deployedNow = 'vsc';
      } else if (r < (acc += per(HAZARD.crash))) {
        retire(weightedPick(rng, running(), crashWeight), lap, 'crash', 'none');
      } else if (r < (acc += per(HAZARD.mech))) {
        retire(weightedPick(rng, running(), mechWeight), lap, 'mech_dnf', 'none');
      }
    }

    // ── 2. 무전(내 차만) ──
    if (my && !my.out && lap < L) {
      // 피트 창: 계획한 피트스톱 2랩 전에 한 번(스톱마다 한 번만 묻는다)
      const pitWindow = phase === 'green' && !deployedNow && !wet && !isWetTyre(my.compound) && my.planned[0] !== undefined
        && my.planned[0] - lap === 2 && lap - my.lastPitLap > 3 && !my.pitNextLap && my.windowStop !== my.stops;
      if (pitWindow) my.windowStop = my.stops;
      const trigger: RadioTrigger | null =
        deployedNow === 'red' ? 'red_flag' : deployedNow === 'sc' ? 'sc' : deployedNow === 'vsc' ? 'vsc'
          : rainStartNow ? 'rain_start' : rainStopNow && isWetTyre(my.compound) ? 'rain_stop' : pitWindow ? 'pit_window' : null;
      if (trigger) {
        const pos = Math.max(1, order.filter((x) => !x.out).indexOf(my) + 1);
        const decision = buildDecision(trigger, lap, my, L, mandatoryStop, circuit, pos, (trigger === 'sc' || trigger === 'vsc') ? neutral ?? undefined : undefined, !!weather?.heavy);
        const recommended = decision.options.find((o) => o.recommended)?.id;
        // 급박한 상황(의무 피트스톱이 코앞, 타이어가 한계를 넘음)이면 팀이 바로 부른다
        const choice = decision.urgent ? recommended : input.radio?.[decision.id] ?? (input.autoRadio ? recommended : undefined);
        if (!choice) {
          return { status: 'pending', totalLaps: L, decision, laps, incidents };
        }
        applyRadio(my, choice, lap, L, mandatoryStop, !!weather?.heavy, circuit);
        incidents.push(decision.urgent ? { type: 'radio', lap, decisionId: decision.id, choice, forced: decision.urgent } : { type: 'radio', lap, decisionId: decision.id, choice });
      }
    }

    // ── 3. 피트 판단(팀 AI) ──
    for (const s of running()) {
      if (s.pitNextLap && !s.pitThisLap) {
        s.pitThisLap = s.pitNextLap;
        s.pitNextLap = null;
      }
      if (s.pitAt && lap >= s.pitAt.lap && !s.pitThisLap) {
        s.pitThisLap = s.pitAt.c;
        s.pitAt = undefined;
        s.holdRain = false;
      }
      if (s.pitThisLap || s.radioLap === lap || phase === 'red') continue;
      s.pitThisLap = aiPit(s, lap, L, rng, { wet, raining, heavy, deployedNow, mandatoryStop, weather, circuit });
    }

    // 레드 플래그: 모든 차가 피트레인에서 무료로 타이어 교체
    if (phase === 'red') {
      for (const s of running()) {
        const remaining = L - lap;
        const next: Compound = s.redTyre ?? (wet ? (heavy ? 'W' : 'I') : pickDry(remaining, s, mandatoryStop));
        s.redTyre = undefined;
        s.compound = next;
        s.tyreAge = 0;
        if (isWetTyre(next)) s.usedWet = true; else s.dryUsed.add(next);
      }
    }

    // ── 4. 랩타임 ──
    const prevGapAhead = new Map<string, number>();
    for (let i = 1; i < order.length; i++) {
      const a = order[i - 1];
      const b = order[i];
      if (a && b && !a.out && !b.out) prevGapAhead.set(b.car.id, b.time - a.time);
    }
    const run = running();
    if (phase === 'green') {
      for (const s of run) {
        let t = paceLap(s, lap, L, wet, rng, w, circuit, heavy);
        if ((prevGapAhead.get(s.car.id) ?? 9) < 1.0) t += 0.2;
        s.time += t;
      }
    } else if (phase === 'vsc') {
      for (const s of run) s.time += circuit.baseLap * 1.35 + normal(rng) * 0.05;
    } else {
      // SC / 레드: 줄지어 모인다
      const sorted = [...run].sort((a, b) => a.time - b.time);
      const lead = (sorted[0]?.time ?? 0) + circuit.baseLap * 1.4;
      sorted.forEach((s, i) => { s.time = lead + i * 0.6; });
    }

    // ── 5. 피트스톱 ──
    for (const s of run) {
      if (!s.pitThisLap) continue;
      const factor = phase === 'sc' ? 0.5 : phase === 'vsc' ? 0.6 : 1;
      const stationary = 2.2 + (1 - s.car.ops) * 1.5 + Math.abs(normal(rng)) * 0.35 * (1.2 - s.car.ops);
      s.time += circuit.pitLoss * factor + stationary;
      s.compound = s.pitThisLap;
      if (isWetTyre(s.compound)) s.usedWet = true; else s.dryUsed.add(s.compound);
      s.tyreAge = 0;
      s.stops += 1;
      s.lastPitLap = lap;
      incidents.push({ type: 'pit', lap, car: s.car.id, compound: s.compound, under: phase });
    }

    // ── 6. 추월(그린 플래그만) ──
    const before = order.filter((s) => !s.out);
    if (phase === 'green') {
      const restartBoost = laps[laps.length - 1]?.phase === 'sc' ? 0.1 : 0;
      for (let i = 1; i < before.length; i++) {
        const att = before[i];
        const def = before[i - 1];
        if (!att || !def || att.out || def.out) continue;
        if (att.pitThisLap || def.pitThisLap) continue;
        if (att.time >= def.time) continue;
        const base = 0.12 + 0.4 * circuit.overtakeEase;
        const craft = (att.car.stats.racecraft - def.car.stats.racecraft) / 150;
        const adv = clamp((def.time - att.time) * 0.35, 0, 0.3);
        const fight = lap - att.lostPositionLap <= 3 ? att.beh.fightback : 0;
        const p = clamp((base + craft + adv + restartBoost + fight) * att.beh.overtakeAttempt, 0.05, 0.95);
        if (rng() < p) {
          before[i - 1] = att;
          before[i] = def;
          def.lostPositionLap = lap;
          incidents.push({ type: 'overtake', lap, by: att.car.id, on: def.car.id, position: i });
        } else {
          att.time = def.time + 0.15 + rng() * 0.25;
        }
        // 접촉
        if (rng() < 0.004 * att.beh.contactRisk * (1.4 - att.car.stats.consistency / 100)) {
          const victim = rng() < 0.6 ? att : def;
          const roll = rng();
          const neutral: Phase | 'none' = roll < 0.55 ? 'sc' : roll < 0.8 ? 'vsc' : 'none';
          retire(victim, lap, 'crash', neutral);
          if (neutral !== 'none') pendingPhase = neutral;
        }
      }
    }

    // ── 7. 랩 마무리 ──
    for (const s of running()) {
      s.tyreAge += 1;
      s.lapsDone = lap;
    }
    order = running().sort((a, b) => a.time - b.time);
    const leader = order[0];
    if (leader && leader.car.id !== leaderId) {
      leaderId = leader.car.id;
      if (lap > 1) incidents.push({ type: 'lead_change', lap, leader: leaderId });
    }
    const leadTime = leader?.time ?? 0;
    laps.push({
      lap,
      phase,
      wet,
      order: order.map((s) => ({ id: s.car.id, gap: s.time - leadTime, compound: s.compound, stops: s.stops })),
    });

    if (phase !== 'green') {
      phaseLapsLeft -= 1;
      if (phaseLapsLeft <= 0) {
        if (phase === 'red') {
          phase = 'sc';
          phaseLapsLeft = 1;
        } else {
          incidents.push({ type: phase === 'sc' ? 'sc_end' : 'vsc_end', lap, vsExpected: neutralExpected ? neutralDelta : undefined });
          if (phase === 'sc') incidents.push({ type: 'restart', lap: lap + 1 });
          phase = 'green';
          neutral = null;
          neutralExpected = 0;
        }
      }
    }
    if (order.length === 0) break;
  }

  // ── 순위 ──
  const upsetRoll = rngFor(input.seed, 'upset', circuit.id, input.kind)();
  const finishers = enforceOrder(states.filter((s) => !s.out).sort((a, b) => a.time - b.time), (s) => s.car.teamId, input.rules, upsetRoll);
  const dnfs = states.filter((s) => s.out).sort((a, b) => b.lapsDone - a.lapsDone || a.grid - b.grid);
  const table = input.points ?? (input.kind === 'race' ? POINTS_RACE : POINTS_SPRINT);
  const winnerTime = Math.min(...finishers.map((s) => s.time));
  // 규칙으로 순서가 바뀌었을 수 있으므로 간격은 앞차보다 항상 0.4초 이상 뒤로 맞춘다
  const gaps: number[] = [];
  finishers.forEach((s, i) => { gaps.push(i === 0 ? 0 : Math.max(s.time - winnerTime, (gaps[i - 1] ?? 0) + 0.4)); });
  const lastLap = laps[laps.length - 1];
  if (lastLap) {
    const byIdEntry = new Map(lastLap.order.map((e) => [e.id, e]));
    lastLap.order = finishers.map((s, i) => ({ ...(byIdEntry.get(s.car.id) ?? { id: s.car.id, compound: s.compound, stops: s.stops, gap: 0 }), gap: gaps[i] ?? 0 }));
  }
  const classification: Classified[] = [
    ...finishers.map((s, i) => ({
      id: s.car.id, code: s.car.code, position: i + 1, status: 'finished' as const, laps: s.lapsDone,
      gap: gaps[i] ?? 0, points: table[i] ?? 0, grid: s.grid, stops: s.stops,
    })),
    ...dnfs.map((s, i) => ({
      id: s.car.id, code: s.car.code, position: finishers.length + i + 1, status: 'dnf' as const, laps: s.lapsDone,
      points: 0, grid: s.grid, stops: s.stops, reason: s.reason,
    })),
  ];
  return { status: 'finished', totalLaps: L, laps, incidents, classification };
}

function paceLap(s: CarState, lap: number, L: number, wet: boolean, rng: Rng, w: number, circuit: Circuit, heavy = false): number {
  const st = s.car.stats;
  const perf = w * s.car.teamQuality + (1 - w) * (ovr(st) / 100);
  let t = circuit.baseLap * (1 + (1 - perf) * PACE_SPREAD);
  if (!isWetTyre(s.compound)) {
    const life = LIFE[s.compound] / circuit.deg;
    t += COMPOUND_OFFSET[s.compound];
    t += DEG[s.compound] * circuit.deg * s.tyreAge * (1.25 - (st.tyre / 100) * 0.5);
    if (s.tyreAge > life) t += (s.tyreAge - life) * 0.25;
  } else {
    t += DEG[s.compound] * s.tyreAge;
  }
  t += 1.6 * (1 - lap / L);
  const wetSkill = ((st.wet - 75) / 25) * 0.6;
  if (heavy) {
    // 폭우: 풀웻이 맞는 타이어, 인터는 물을 못 빼서 미끄럽고, 슬릭은 거의 못 달린다
    t += s.compound === 'W' ? 4.5 - wetSkill : s.compound === 'I' ? 6.5 - wetSkill * 0.6 : 12;
  } else if (wet) {
    t += s.compound === 'I' ? 3.5 - wetSkill : s.compound === 'W' ? 5 - wetSkill : 7;
  } else if (isWetTyre(s.compound)) t += s.compound === 'W' ? 7 : 4;
  t += normal(rng) * (0.15 + (100 - st.consistency) / 300) * s.beh.lapVariance;
  if (rng() < 0.004 * s.beh.mistake * (1.4 - st.consistency / 100) * (heavy ? 3.5 : wet ? 2.5 : 1)) t += 2 + rng() * 3;
  if (lap === 1) t += normal(rng) * 0.6 * (1.2 - st.racecraft / 100);
  return t;
}

function pickDry(remaining: number, s: CarState, mandatoryStop: boolean): Compound {
  let next: Compound = remaining > 26 ? 'H' : remaining > 12 ? 'M' : 'S';
  if (mandatoryStop && s.dryUsed.size < 2 && s.dryUsed.has(next)) {
    next = next === 'H' ? 'M' : next === 'M' ? (remaining > 18 ? 'H' : 'S') : 'M';
  }
  return next;
}

interface PitContext {
  wet: boolean;
  raining: boolean;
  heavy: boolean;
  deployedNow: Phase | null;
  mandatoryStop: boolean;
  weather: Weather | null;
  circuit: Circuit;
}

function aiPit(s: CarState, lap: number, L: number, rng: Rng, ctx: PitContext): Compound | null {
  const remaining = L - lap;
  // 비: 약한 비는 인터, 폭우는 풀웻
  const target: Compound = ctx.weather?.heavy ? 'W' : 'I';
  if (ctx.raining && !isWetTyre(s.compound)) {
    if (s.holdRain) return null;
    if (rng() < 0.45 || (ctx.weather && lap > ctx.weather.start + 2)) return target;
    return null;
  }
  if (ctx.raining && isWetTyre(s.compound) && s.compound !== target && lap - s.lastPitLap > 3) {
    return rng() < (target === 'W' ? 0.35 : 0.25) ? target : null;
  }
  if (!ctx.wet && isWetTyre(s.compound)) {
    if (lap < s.holdDryUntil) return null;
    if (rng() < 0.5 || (ctx.weather && lap > ctx.weather.end + 4)) return remaining > 20 ? 'M' : 'S';
    return null;
  }
  if (isWetTyre(s.compound)) return null;
  if (remaining <= 2) return null;

  const life = LIFE[s.compound] / ctx.circuit.deg;
  const needsCompound = ctx.mandatoryStop && !s.usedWet && s.dryUsed.size < 2;
  const nextDry = () => s.nextQueue.shift() ?? pickDry(remaining, s, ctx.mandatoryStop);
  const dropPlanned = () => { s.planned = s.planned.filter((p) => p > lap + 8); };

  if (ctx.deployedNow === 'sc' || ctx.deployedNow === 'vsc') {
    const next = s.planned[0];
    const worth = (next !== undefined && next - lap <= 12) || s.tyreAge > life * 0.6 || (needsCompound && remaining < 25);
    if (worth && lap - s.lastPitLap > 5 && remaining > 4) {
      dropPlanned();
      return pickDry(remaining, s, ctx.mandatoryStop);
    }
  }
  const plannedNow = s.planned[0];
  if (plannedNow !== undefined && lap >= plannedNow) {
    s.planned = s.planned.filter((p) => p > lap);
    return nextDry();
  }
  if (s.tyreAge > life && remaining > 5) {
    dropPlanned();
    return nextDry();
  }
  if (needsCompound && remaining === 3) return pickDry(remaining, s, ctx.mandatoryStop);
  return null;
}

function recommend(trigger: RadioTrigger, s: CarState, lap: number, L: number, mandatoryStop: boolean, heavy = false): RadioOptionId {
  const remaining = L - lap;
  const needsCompound = mandatoryStop && !s.usedWet && s.dryUsed.size < 2;
  switch (trigger) {
    case 'sc':
      if ((s.tyreAge >= 8 && remaining > 6) || (needsCompound && remaining < 30)) {
        return remaining > 22 ? 'pit_hard' : 'pit_medium';
      }
      return 'stay_out';
    case 'vsc':
      return (s.tyreAge >= 12 && remaining > 8) || (needsCompound && remaining < 25) ? 'pit' : 'stay_out';
    case 'rain_start':
      return heavy ? 'wets_now' : 'inters_now';
    case 'rain_stop':
      return 'slicks_now';
    case 'pit_window':
      return 'pit_plan';
    case 'red_flag': {
      const wetNow = isWetTyre(s.compound) || heavy;
      if (wetNow) return heavy ? 'rf_W' : 'rf_I';
      const c = pickDry(remaining, s, mandatoryStop);
      return c === 'S' ? 'rf_S' : c === 'M' ? 'rf_M' : 'rf_H';
    }
  }
}

/** 급박한 상황이면 그 이유. 이때는 드라이버에게 묻지 않고 팀이 바로 정한다 */
function urgency(trigger: RadioTrigger, s: CarState, lap: number, L: number, mandatoryStop: boolean, circuit: Circuit): string | undefined {
  if (trigger !== 'sc' && trigger !== 'vsc') return undefined;
  const remaining = L - lap;
  const needsCompound = mandatoryStop && !s.usedWet && s.dryUsed.size < 2;
  const life = LIFE[s.compound] / circuit.deg;
  if (needsCompound && remaining <= 20 && remaining > 2) return `의무 피트스톱이 남았는데 ${remaining}랩밖에 안 남았다. 팀이 바로 불러들였다`;
  if (!isWetTyre(s.compound) && s.tyreAge >= life * 0.95 && remaining > 4) return `타이어가 ${s.tyreAge}랩째로 수명이 다했다. 팀이 바로 불러들였다`;
  const planned = s.planned[0];
  if (planned !== undefined && planned - lap <= 2 && remaining > 4) return `원래 ${planned}랩에 들어올 계획이었다. 팀이 바로 불러들였다`;
  return undefined;
}


/** 데이터 전략의 최적 피트 랩: 타이어 수명의 90%에 맞춘다(지금부터 0~6랩 뒤) */
function dataOptimalLap(s: CarState, lap: number, circuit: Circuit): number {
  const life = LIFE[s.compound] / circuit.deg;
  return lap + Math.max(0, Math.min(6, Math.round(life * 0.9 - s.tyreAge)));
}

function buildDecision(trigger: RadioTrigger, lap: number, s: CarState, L: number, mandatoryStop: boolean, circuit?: Circuit, pos = 0, neutral?: Neutralization, heavy = false): RadioDecision {
  const rec = recommend(trigger, s, lap, L, mandatoryStop, heavy);
  const remaining = L - lap;
  const needsCompound = mandatoryStop && !s.usedWet && s.dryUsed.size < 2;
  const deg = circuit?.deg ?? 1;
  const life = Math.round(LIFE[s.compound] / deg);
  const lifeOf = (c: Compound) => Math.round(LIFE[c] / deg);
  const tyre = `${TYRE_NAME[s.compound]} ${s.tyreAge}랩째(수명 약 ${life}랩)`;
  const where = pos ? `지금 P${pos}, ` : '';
  const notes: Partial<Record<RadioOptionId, string>> = {};
  let advice = '';
  switch (trigger) {
    case 'sc':
    case 'vsc': {
      const cheap = trigger === 'sc' ? '세이프티카 중엔 피트 손실이 절반쯤이야' : 'VSC 중엔 피트 손실이 40%쯤 줄어';
      const odds = neutral ? [neutral.longer ? `길어질 확률 ${Math.round(neutral.longer * 100)}%` : '', neutral.shorter ? `짧아질 확률 ${Math.round(neutral.shorter * 100)}%` : ''].filter(Boolean).join(', ') : '';
      const len = neutral ? ` 예상 ${neutral.expectedLaps}랩${odds ? `, ${odds}` : ''}.` : '';
      advice = rec === 'stay_out'
        ? `${where}${tyre}. 타이어가 아직 괜찮아. 자리를 지키는 게 낫다고 봐.${len}`
        : `${where}${tyre}, 남은 ${remaining}랩. ${cheap}. 지금 들어가면 싸게 갈아 끼울 수 있어.${len}`;
      const fresh = (c: Compound) => (lifeOf(c) >= remaining ? `끝까지 버틴다(수명 약 ${lifeOf(c)}랩)` : `약 ${lifeOf(c)}랩이면 한 번 더 들어와야 한다`);
      const lose = pos > 1 ? `P${pos}에서 몇 자리 내려가고 다시 추월해야 한다` : '선두를 내줄 수 있다';
      notes.pit_hard = `하드: ${fresh('H')}. 느리지만 안정적. ${lose}`;
      notes.pit_medium = `미디엄: ${fresh('M')}. 하드보다 빠르다. ${lose}`;
      notes.pit = `새 타이어(${TYRE_NAME[pickDry(remaining, s, mandatoryStop)]}). ${lose}`;
      notes.pit_soft = `소프트(수명 약 ${lifeOf('S')}랩)로 재시작부터 몰아친다. ${lifeOf('S') < remaining ? '끝까지 못 버텨 한 번 더 들어와야 한다' : '끝까지 버틸 수 있다'}`;
      notes.pit_data = `남은 ${remaining}랩과 수명(소프트 ${lifeOf('S')}·미디엄 ${lifeOf('M')}·하드 ${lifeOf('H')}랩)으로 고른 ${TYRE_NAME[pickDry(remaining, s, mandatoryStop)]}`;
      notes.stay_out = needsCompound
        ? `자리는 지키지만 의무 피트스톱이 아직 남아 있다. 나중에 그린 플래그에서 들어가면 손해가 크다`
        : s.tyreAge + remaining > life
          ? `자리는 지키지만 이 타이어로 ${s.tyreAge + remaining}랩을 버텨야 한다. 막판에 밀릴 수 있다`
          : `자리를 지킨다. 이 타이어로 끝까지 갈 수 있다`;
      break;
    }
    case 'pit_window': {
      const planned = s.planned[0] ?? lap + 2;
      const nextC = s.nextQueue[0] ?? pickDry(remaining, s, mandatoryStop);
      advice = `${where}${tyre}. 계획한 피트스톱(L${planned})이 2랩 남았어. 다음 타이어는 ${TYRE_NAME[nextC]}.`;
      notes.pit_plan = `L${planned}에 ${TYRE_NAME[nextC]}로. 팀이 짠 계획 그대로`;
      notes.pit_now = '앞차보다 먼저 들어가 새 타이어로 따라잡는다(언더컷). 피트 뒤 트래픽에 걸릴 수 있다';
      notes.extend = s.tyreAge + 5 > life ? `타이어가 수명(약 ${life}랩)을 넘긴다. 막판 랩타임이 떨어진다` : '앞차가 먼저 들어가면 빈 트랙에서 시간을 번다(오버컷)';
      notes.gamble_soft = `소프트(수명 약 ${lifeOf('S')}랩)로 몰아친다. 남은 ${remaining}랩을 버티지 못하면 한 번 더 들어와야 한다`;
      notes.data_optimal = circuit ? `타이어 수명의 90% 지점 L${dataOptimalLap(s, lap, circuit)}. 랩타임 손실이 가장 적다` : '';
      break;
    }
    case 'rain_start':
      advice = heavy
        ? `${where}폭우다. 인터로는 물을 다 못 뺀다. 풀웻이 맞아.`
        : `${where}비가 시작됐다. 굵어지면 슬릭으론 못 버텨. 언제 바꿀지는 네가 정해.`;
      notes.wets_now = heavy ? '폭우엔 가장 빠르고 안전하다' : '약한 비에선 인터보다 느리다';
      notes.radar_wait = '레이더상 비가 굵어지는 2랩 뒤에 맞는 타이어로 들어간다. 그사이 슬릭으로 버틴다';
      notes.inters_now = heavy ? '폭우엔 미끄럽다. 풀웻보다 랩당 2초쯤 느리다' : '가장 안전하다. 비가 금방 그치면 다시 들어와야 한다';
      notes.one_more_lap = '한 랩 더 버티며 상황을 본다. 비가 굵어지면 그 랩에 크게 잃는다';
      notes.stay_slicks = '비가 금방 그친다는 데 거는 도박. 맞으면 크게 번다';
      break;
    case 'red_flag': {
      advice = `${where}레드 플래그! 세션이 중단됐다. 모두 피트레인에 서고, 재출발 전에 타이어를 공짜로 바꿀 수 있어. 남은 ${remaining}랩, 지금 ${tyre}.`;
      const fits = (c: Compound) => (lifeOf(c) >= remaining ? `끝까지 버틴다(수명 약 ${lifeOf(c)}랩)` : `약 ${lifeOf(c)}랩 뒤 한 번 더 들어와야 한다`);
      const rule = needsCompound ? ' 아직 다른 컴파운드를 안 썼으면 그 규칙도 채운다' : '';
      notes.rf_S = `가장 빠르다. ${fits('S')}.${needsCompound && s.compound !== 'S' ? rule : ''}`;
      notes.rf_M = `균형. ${fits('M')}.${needsCompound && s.compound !== 'M' ? rule : ''}`;
      notes.rf_H = `느리지만 오래 간다. ${fits('H')}.${needsCompound && s.compound !== 'H' ? rule : ''}`;
      notes.rf_I = heavy ? '폭우엔 미끄럽다. 풀웻보다 느리다' : '트랙이 젖어 있으면 가장 빠르다. 마른 트랙에선 랩당 4초쯤 손해';
      notes.rf_W = heavy ? '폭우엔 가장 빠르고 안전하다' : '마른 트랙에선 랩당 7초쯤 손해';
      break;
    }
    case 'rain_stop':
      advice = `${where}트랙이 마르고 있어. 라인이 생기면 슬릭이 훨씬 빠르다.`;
      notes.slicks_now = '먼저 바꾸면 크게 벌 수 있다. 다시 젖으면 위험';
      notes.slicks_soft = '가장 빠른 슬릭으로 바로. 남은 랩이 길면 한 번 더 들어와야 한다';
      notes.stay_inters = '몇 랩 더 지켜본다. 마르는 게 빠르면 손해';
      break;
  }
  return {
    id: `${trigger}@${lap}`,
    lap,
    trigger,
    options: [...RADIO_OPTIONS[trigger], ...(() => { const st = strategyStyleOf(s.car.personality); const extra = st ? STYLE_OPTIONS[st][trigger] : undefined; return extra ? [extra] : []; })()]
      .map((o) => ({ ...o, recommended: o.id === rec, note: notes[o.id] })),
    ...(neutral ? { neutral } : {}),
    advice,
    ...(circuit ? (() => { const u = urgency(trigger, s, lap, L, mandatoryStop, circuit); return u && rec !== 'stay_out' ? { urgent: u } : {}; })() : {}),
  };
}

function applyRadio(s: CarState, choice: RadioOptionId, lap: number, L: number, mandatoryStop: boolean, heavy = false, circuit?: Circuit): void {
  s.radioLap = lap;
  const remaining = L - lap;
  const pitDry = (c: Compound) => {
    s.pitThisLap = c;
    s.planned = s.planned.filter((p) => p > lap + 15);
  };
  switch (choice) {
    case 'pit_hard': pitDry('H'); break;
    case 'pit_medium': pitDry('M'); break;
    case 'pit': pitDry(pickDry(remaining, s, mandatoryStop)); break;
    case 'stay_out': break;
    case 'inters_now': s.pitThisLap = 'I'; break;
    case 'wets_now': s.pitThisLap = 'W'; break;
    case 'one_more_lap': s.pitNextLap = heavy ? 'W' : 'I'; break;
    case 'radar_wait': s.holdRain = true; s.pitAt = { lap: lap + 2, c: heavy ? 'W' : 'I' }; break;
    case 'slicks_soft': s.pitThisLap = 'S'; break;
    case 'pit_soft': pitDry('S'); break;
    case 'pit_data': pitDry(pickDry(remaining, s, mandatoryStop)); break;
    case 'pit_plan': break;
    case 'pit_now': s.pitThisLap = s.nextQueue.shift() ?? pickDry(remaining, s, mandatoryStop); s.planned = s.planned.slice(1); break;
    case 'extend': if (s.planned[0] !== undefined) s.planned[0] += 3; break;
    case 'gamble_soft': s.pitThisLap = 'S'; s.nextQueue.shift(); s.planned = s.planned.slice(1); break;
    case 'data_optimal': {
      const at = circuit ? dataOptimalLap(s, lap, circuit) : lap + 2;
      if (at <= lap) { s.pitThisLap = s.nextQueue.shift() ?? pickDry(remaining, s, mandatoryStop); s.planned = s.planned.slice(1); }
      else if (s.planned.length) s.planned[0] = at;
      break;
    }
    case 'stay_slicks': s.holdRain = true; break;
    case 'slicks_now': s.pitThisLap = remaining > 20 ? 'M' : 'S'; break;
    case 'stay_inters': s.holdDryUntil = lap + 3; break;
    case 'rf_S': s.redTyre = 'S'; break;
    case 'rf_M': s.redTyre = 'M'; break;
    case 'rf_H': s.redTyre = 'H'; break;
    case 'rf_I': s.redTyre = 'I'; break;
    case 'rf_W': s.redTyre = 'W'; break;
  }
}

// ── 예측(SPEC §5.4 예상 순위 범위, §5.5 무전 예상 변화) ─────────────────
export interface Forecast {
  runs: number;
  p10: number;
  p50: number;
  p90: number;
  mean: number;
  win: number;
  podium: number;
  points: number;
  dnf: number;
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[idx] as number;
}

/** fromLap부터 난수만 바꿔 n번 돌린 뒤 carId의 순위 분포를 낸다. 무전은 추천을 따른다. */
export function forecastFinish(input: RaceInput, carId: string, n = 200, fromLap = 1): Forecast {
  const positions: number[] = [];
  let dnf = 0;
  let win = 0;
  let podium = 0;
  let pts = 0;
  const pointsCut = (input.points ?? (input.kind === 'race' ? POINTS_RACE : POINTS_SPRINT)).length;
  for (let i = 0; i < n; i++) {
    const out = runRace({ ...input, autoRadio: true, postSeed: { fromLap, seed: hashSeed(input.seed, 'forecast', fromLap, i) } });
    if (out.status !== 'finished') continue;
    const row = out.classification.find((c) => c.id === carId);
    if (!row) continue;
    if (row.status === 'dnf') { dnf++; continue; }
    positions.push(row.position);
    if (row.position === 1) win++;
    if (row.position <= 3) podium++;
    if (row.position <= pointsCut) pts++;
  }
  positions.sort((a, b) => a - b);
  const mean = positions.reduce((a, b) => a + b, 0) / Math.max(1, positions.length);
  return {
    runs: n, p10: percentile(positions, 0.1), p50: percentile(positions, 0.5), p90: percentile(positions, 0.9),
    mean, win: win / n, podium: podium / n, points: pts / n, dnf: dnf / n,
  };
}

/** 무전 선택지 하나를 골랐을 때의 예상 순위(결정 다음 랩부터 난수만 바꿔 돌린다) */
export function forecastDecision(input: RaceInput, decision: RadioDecision, option: RadioOptionId, n = 100): Forecast {
  if (!input.myCarId) throw new Error('forecastDecision needs myCarId');
  return forecastFinish({ ...input, radio: { ...input.radio, [decision.id]: option } }, input.myCarId, n, decision.lap + 1);
}

// ── 퀄리파잉 ────────────────────────────────────────────────────────
export interface QualiResult {
  order: string[];
  times: Record<string, number>;
  /** 22대 기준 Q1 탈락 6명, Q2 탈락 6명 */
  eliminatedQ1: string[];
  eliminatedQ2: string[];
}

export function simulateQualifying(
  seed: number, circuit: Circuit, cars: RaceCar[], carWeight: number = CAR_WEIGHT.f1, session = 'Q',
): QualiResult {
  const rng = rngFor(seed, 'quali', session, circuit.id);
  const times: Record<string, number> = {};
  for (const car of cars) {
    const st = car.stats;
    const beh = behaviorOf(car);
    const skill = (0.6 * st.pace + 0.4 * ovr(st)) / 100;
    const perf = carWeight * car.teamQuality + (1 - carWeight) * skill;
    times[car.id] =
      circuit.baseLap * (1 + (1 - perf) * PACE_SPREAD) - 1.8 +
      normal(rng) * (0.1 + (100 - st.consistency) / 500) * beh.lapVariance;
  }
  const order = [...cars].map((c) => c.id).sort((a, b) => (times[a] ?? 0) - (times[b] ?? 0));
  const n = order.length;
  const q1Cut = Math.max(0, n - 6);
  const q2Cut = Math.max(0, q1Cut - 6);
  return { order, times, eliminatedQ1: order.slice(q1Cut), eliminatedQ2: order.slice(q2Cut, q1Cut) };
}
