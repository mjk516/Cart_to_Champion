// 타이어·날씨·레이스 전략(SPEC v0.40).
// - 서킷별 실제 F1 데이터(2023~2025 결승에서 가장 많이 쓴 출발 타이어, 비 올 때 폭우 비율)를 어림해 둔다.
// - 팀 전략 회의: 팀 추천 전략 + 대안 + 성격별 전략(공격형·본능형은 도박, 분석형·침착형은 데이터)을 낸다.
// race.ts가 이 파일의 타이어 상수와 전략을 쓴다(이 파일은 race.ts를 가져오지 않는다).

import { rngFor, int } from './rng';
import type { Circuit, Compound, Personality } from './types';

// ── 타이어 상수 ─────────────────────────────────────────────────────
/** 랩타임 차이(초, 소프트 기준) */
export const COMPOUND_OFFSET: Record<Compound, number> = { S: 0, M: 0.35, H: 0.7, I: 0, W: 0 };
/** 랩당 마모로 느려지는 정도 */
export const DEG: Record<Compound, number> = { S: 0.085, M: 0.055, H: 0.038, I: 0.03, W: 0.025 };
/** 수명(랩, 마모 1.0 서킷 기준) */
export const LIFE: Record<Compound, number> = { S: 18, M: 28, H: 40, I: 35, W: 40 };
export const TYRE_NAME: Record<Compound, string> = { S: '소프트', M: '미디엄', H: '하드', I: '인터미디어트', W: '풀웻' };
export const isWetTyre = (c: Compound): boolean => c === 'I' || c === 'W';

export function tyreLife(c: Compound, circuit: Circuit): number {
  return Math.round(LIFE[c] / circuit.deg);
}

// ── 서킷별 실제 데이터(어림) ─────────────────────────────────────────
interface CircuitTyreData {
  /** 결승에서 가장 많은 차가 고른 출발 타이어(맑은 날) */
  start: Compound;
  /** 스프린트 출발 타이어 */
  sprintStart: Compound;
  /** 비가 올 때 폭우(풀웻이 필요한 비)일 확률 */
  heavyRain: number;
}
const TYRE_DATA: Record<string, CircuitTyreData> = {
  australia: { start: 'M', sprintStart: 'M', heavyRain: 0.35 },
  china: { start: 'M', sprintStart: 'M', heavyRain: 0.35 },
  japan: { start: 'M', sprintStart: 'M', heavyRain: 0.5 },
  bahrain: { start: 'S', sprintStart: 'S', heavyRain: 0.1 },
  saudi_arabia: { start: 'M', sprintStart: 'M', heavyRain: 0.1 },
  miami: { start: 'M', sprintStart: 'M', heavyRain: 0.45 },
  canada: { start: 'M', sprintStart: 'M', heavyRain: 0.4 },
  monaco: { start: 'M', sprintStart: 'S', heavyRain: 0.4 },
  barcelona: { start: 'S', sprintStart: 'S', heavyRain: 0.25 },
  austria: { start: 'M', sprintStart: 'S', heavyRain: 0.35 },
  britain: { start: 'M', sprintStart: 'M', heavyRain: 0.35 },
  belgium: { start: 'M', sprintStart: 'M', heavyRain: 0.5 },
  hungary: { start: 'M', sprintStart: 'M', heavyRain: 0.3 },
  netherlands: { start: 'M', sprintStart: 'M', heavyRain: 0.35 },
  italy: { start: 'M', sprintStart: 'M', heavyRain: 0.3 },
  madrid: { start: 'M', sprintStart: 'M', heavyRain: 0.2 },
  azerbaijan: { start: 'M', sprintStart: 'M', heavyRain: 0.2 },
  singapore: { start: 'M', sprintStart: 'M', heavyRain: 0.55 },
  usa: { start: 'M', sprintStart: 'M', heavyRain: 0.35 },
  mexico: { start: 'M', sprintStart: 'M', heavyRain: 0.3 },
  brazil: { start: 'M', sprintStart: 'M', heavyRain: 0.55 },
  las_vegas: { start: 'M', sprintStart: 'M', heavyRain: 0.1 },
  qatar: { start: 'M', sprintStart: 'S', heavyRain: 0.1 },
  abu_dhabi: { start: 'M', sprintStart: 'M', heavyRain: 0.1 },
  imola: { start: 'M', sprintStart: 'M', heavyRain: 0.4 },
  portimao: { start: 'M', sprintStart: 'M', heavyRain: 0.25 },
  istanbul: { start: 'M', sprintStart: 'M', heavyRain: 0.4 },
  sepang: { start: 'M', sprintStart: 'M', heavyRain: 0.65 },
  hockenheim: { start: 'M', sprintStart: 'M', heavyRain: 0.4 },
  nurburgring: { start: 'M', sprintStart: 'M', heavyRain: 0.45 },
  paul_ricard: { start: 'M', sprintStart: 'M', heavyRain: 0.3 },
  magny_cours: { start: 'M', sprintStart: 'M', heavyRain: 0.3 },
  mugello: { start: 'M', sprintStart: 'M', heavyRain: 0.3 },
  indianapolis: { start: 'M', sprintStart: 'M', heavyRain: 0.3 },
};
const DEFAULT_DATA: CircuitTyreData = { start: 'M', sprintStart: 'M', heavyRain: 0.3 };
export function circuitTyreData(id: string): CircuitTyreData {
  return TYRE_DATA[id] ?? DEFAULT_DATA;
}

// ── 날씨 ────────────────────────────────────────────────────────────
export interface Weather {
  /** 비가 시작하는 랩(1이면 젖은 트랙에서 출발) */
  start: number;
  /** 비가 그치는 랩 */
  end: number;
  /** 폭우(풀웻이 필요한 비) */
  heavy: boolean;
}

/**
 * 레이스 날씨. 서킷의 실제 비 확률(rainChance)로 비가 올지, 서킷 데이터로 폭우일지 정한다.
 * 비 오는 레이스의 35%는 처음부터 젖은 트랙에서 출발한다.
 */
export function weatherPlan(seed: number, circuit: Circuit, totalLaps: number): Weather | null {
  const r = rngFor(seed, 'weather', circuit.id, totalLaps);
  if (r() >= circuit.rainChance) return null;
  const midStart = Math.max(2, Math.floor(totalLaps * (0.15 + 0.6 * r())));
  const length = int(r, 6, 22);
  const wr = rngFor(seed, 'weather-kind', circuit.id, totalLaps);
  const wetStart = wr() < 0.35;
  const heavy = wr() < circuitTyreData(circuit.id).heavyRain;
  const start = wetStart ? 1 : midStart;
  const end = Math.min(totalLaps + 1, start + length + (wetStart ? int(wr, 2, 10) : 0));
  return { start, end, heavy };
}

/** 전략 회의에서 보여 주는 예보(팀이 아는 정도: 비가 오는지, 대략 언제, 얼마나 세게) */
export interface WeatherForecast {
  rain: boolean;
  wetStart: boolean;
  heavy: boolean;
  /** 비가 시작할 것으로 보는 랩 범위 */
  from: number;
  to: number;
  text: string;
}
export function raceForecast(seed: number, circuit: Circuit, totalLaps: number): WeatherForecast {
  const w = weatherPlan(seed, circuit, totalLaps);
  if (!w) return { rain: false, wetStart: false, heavy: false, from: 0, to: 0, text: `맑음. 레이스 중 비 소식은 없다(이 서킷의 비 확률 ${Math.round(circuit.rainChance * 100)}%).` };
  const from = Math.max(1, w.start - 2);
  const to = Math.min(totalLaps, w.start + 3);
  const kind = w.heavy ? '폭우' : '약한 비';
  return {
    rain: true, wetStart: w.start <= 1, heavy: w.heavy, from, to,
    text: w.start <= 1 ? `출발 전부터 ${kind}. 젖은 트랙에서 출발한다.` : `L${from}~L${to} 무렵 ${kind} 예보.`,
  };
}

// ── 팀 전략 회의 ─────────────────────────────────────────────────────
export type StrategyStyle = 'team' | 'alt' | 'gamble' | 'data';

export interface StrategyOption {
  id: string;
  label: string;
  desc: string;
  style: StrategyStyle;
  /** 출발 타이어 */
  start: Compound;
  /** 계획한 피트 랩 */
  stops: number[];
  /** 피트에서 갈아 끼울 타이어(순서대로) */
  next: Compound[];
  recommended: boolean;
}

/** 성격별 전략 성향: 공격형·본능형은 도박, 분석형·침착형은 데이터 */
export function strategyStyleOf(p: Personality | undefined): 'gamble' | 'data' | null {
  if (p === 'aggressive' || p === 'instinctive') return 'gamble';
  if (p === 'analytical' || p === 'calm') return 'data';
  return null;
}

/** 1스톱 최적 피트 랩: 두 스틴트가 각 타이어 수명에 비례하도록 나눈다 */
function optimalOneStop(L: number, a: Compound, b: Compound, circuit: Circuit): number {
  const la = tyreLife(a, circuit);
  const lb = tyreLife(b, circuit);
  return Math.max(4, Math.min(L - 4, Math.round(L * (la / (la + lb)))));
}

/**
 * 이 레이스의 전략 선택지. 팀 추천(★)이 맨 앞, 이어서 대안, 성격 전략.
 * 스프린트·젖은 출발은 의무 피트스톱이 없어 피트 계획이 비어 있다.
 */
export function teamStrategies(circuit: Circuit, kind: 'race' | 'sprint', L: number, forecast: WeatherForecast, personality?: Personality): StrategyOption[] {
  const data = circuitTyreData(circuit.id);
  const style = strategyStyleOf(personality);
  const out: StrategyOption[] = [];
  const push = (o: Omit<StrategyOption, 'recommended'>) => out.push({ ...o, recommended: out.length === 0 });
  if (forecast.wetStart) {
    const wet: Compound = forecast.heavy ? 'W' : 'I';
    const other: Compound = wet === 'W' ? 'I' : 'W';
    push({ id: 'wet', label: `${TYRE_NAME[wet]}로 출발`, desc: `${forecast.heavy ? '폭우' : '비'} 속 출발. 트랙이 마르면 슬릭으로 바꾼다(젖은 레이스는 의무 피트스톱 규칙이 없다).`, style: 'team', start: wet, stops: [], next: [] });
    push({ id: 'wet_alt', label: `${TYRE_NAME[other]}로 출발`, desc: other === 'I' ? '비가 금방 약해진다고 보고 인터로 출발한다. 비가 세면 크게 잃는다.' : '안전하게 풀웻으로 출발한다. 비가 약하면 느리다.', style: 'alt', start: other, stops: [], next: [] });
    if (style === 'gamble') push({ id: 'gamble_slicks', label: '도박: 슬릭(미디엄)으로 출발', desc: '비가 곧 그친다는 데 건다. 맞으면 한 번에 수십 초를 벌고, 틀리면 초반에 크게 밀린다.', style: 'gamble', start: 'M', stops: [], next: [] });
    if (style === 'data') push({ id: 'data_wet', label: `데이터: ${TYRE_NAME[wet]} 출발, 레이더로 교체 시점 계산`, desc: `강우 레이더상 비는 약 ${Math.max(1, forecast.to)}랩까지. 그 뒤 트랙이 마르는 속도를 보고 슬릭 교체 랩을 정한다.`, style: 'data', start: wet, stops: [], next: [] });
    return out;
  }
  if (kind === 'sprint') {
    const s = data.sprintStart;
    const alt: Compound = s === 'S' ? 'M' : 'S';
    push({ id: 'sprint', label: `${TYRE_NAME[s]}로 끝까지`, desc: `실제 F1 스프린트에서 이 서킷 출발 타이어로 가장 많이 쓴 ${TYRE_NAME[s]}. 피트 없이 달린다.`, style: 'team', start: s, stops: [], next: [] });
    push({ id: 'sprint_alt', label: `${TYRE_NAME[alt]}로 끝까지`, desc: alt === 'S' ? '초반이 빠르지만 막판에 타이어가 떨어질 수 있다.' : '초반엔 밀리지만 막판에 타이어가 남는다.', style: 'alt', start: alt, stops: [], next: [] });
    if (style === 'gamble') {
      push(s === 'S'
        ? { id: 'gamble_sprint', label: '도박: 하드로 끝까지, 막판에 몰아친다', desc: '모두 소프트로 나갈 때 혼자 하드. 초반엔 밀리지만 막판에 남들 타이어가 떨어지면 줄줄이 추월한다.', style: 'gamble', start: 'H', stops: [], next: [] }
        : { id: 'gamble_sprint', label: '도박: 소프트로 1랩부터 몰아친다', desc: '스타트에서 최대한 자리를 따낸다. 막판 타이어가 버틸지는 운이다.', style: 'gamble', start: 'S', stops: [], next: [] });
    }
    if (style === 'data') push({ id: 'data_sprint', label: `데이터: ${tyreLife('S', circuit) >= L ? '소프트' : '미디엄'}로 끝까지`, desc: `스프린트 ${L}랩, 소프트 수명 약 ${tyreLife('S', circuit)}랩. 수명 안에 들어오는 가장 빠른 타이어.`, style: 'data', start: tyreLife('S', circuit) >= L ? 'S' : 'M', stops: [], next: [] });
    return out;
  }
  const start = data.start;
  const twoStop = circuit.deg >= 1.2;
  if (twoStop) {
    const a = Math.round(L * 0.3);
    const b = Math.round(L * 0.64);
    push({ id: 'team', label: `2스톱: ${TYRE_NAME[start]} → 하드 → 미디엄`, desc: `타이어가 많이 닳는 서킷이라 팀은 두 번 들어간다. L${a}, L${b} 무렵. 출발 타이어는 실제 F1에서 가장 많이 쓴 ${TYRE_NAME[start]}.`, style: 'team', start, stops: [a, b], next: ['H', 'M'] });
    const one = optimalOneStop(L, 'M', 'H', circuit);
    push({ id: 'one_stop', label: `1스톱: 미디엄 → 하드 (L${one})`, desc: '한 번만 들어가 피트 시간을 아낀다. 두 번째 스틴트 막판에 타이어가 버틸지가 관건.', style: 'alt', start: 'M', stops: [one], next: ['H'] });
  } else {
    const p = optimalOneStop(L, start, 'H', circuit);
    push({ id: 'team', label: `1스톱: ${TYRE_NAME[start]} → 하드 (L${p})`, desc: `팀 추천. 출발 타이어는 실제 F1 결승에서 이 서킷에 가장 많이 쓴 ${TYRE_NAME[start]}, L${p} 무렵 하드로 바꾼다.`, style: 'team', start, stops: [p], next: ['H'] });
    const h = Math.round(L * 0.6);
    push({ id: 'hard_first', label: `1스톱: 하드 → 미디엄 (L${h})`, desc: '하드로 길게 달리다 막판 미디엄으로 몰아친다. 초반엔 자리를 잃을 수 있다.', style: 'alt', start: 'H', stops: [h], next: ['M'] });
  }
  const s1 = Math.round(L * 0.25);
  const s2 = Math.round(L * 0.6);
  push({ id: 'two_soft', label: `2스톱: 소프트 → 미디엄 → 소프트`, desc: `소프트로 빠르게 달리고 두 번 들어간다(L${s1}, L${s2}). 피트 시간만큼 추월이 필요하다.`, style: 'alt', start: 'S', stops: [s1, s2], next: ['M', 'S'] });
  if (style === 'gamble') {
    const late = Math.round(L * 0.78);
    push({ id: 'gamble_long', label: `도박: 하드로 끝까지 버티다 L${late}에 소프트`, desc: '남들이 다 들어갈 때 버틴다. 세이프티카가 늦게 나오면 공짜 피트스톱으로 크게 번다. 안 나오면 막판에 밀린다.', style: 'gamble', start: 'H', stops: [late], next: ['S'] });
  }
  if (style === 'data') {
    const lifeS = tyreLife('S', circuit);
    const lifeM = tyreLife('M', circuit);
    const lifeH = tyreLife('H', circuit);
    const p = optimalOneStop(L, 'M', 'H', circuit);
    push({ id: 'data_opt', label: `데이터: 미디엄 → 하드, 최적 피트 L${p}`, desc: `타이어 수명 모델(소프트 ${lifeS}·미디엄 ${lifeM}·하드 ${lifeH}랩)로 두 스틴트가 수명에 비례하게 나눈 최적 랩.`, style: 'data', start: 'M', stops: [p], next: ['H'] });
  }
  return out;
}

/** 전략 회의에서 고른 것(라운드:종류 → 선택). 시즌 선택 기록에 남아 재생된다 */
export interface RaceStrategyChoice {
  /** teamStrategies 선택지 id */
  plan?: string;
  /** 출발 타이어(전략의 출발 타이어와 다르게 고를 때) */
  tyre?: Compound;
}
export type StrategyMap = Record<string, RaceStrategyChoice>;
export const strategyKey = (round: number, kind: 'race' | 'sprint'): string => `${round}:${kind}`;
