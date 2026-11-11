// 2026 시즌 시작 데이터.
// ⚠️ 잠정값: 팀 성능·드라이버 능력치는 rate-drivers 스크립트(SPEC §2.2, PRD WD-3)가 나오기 전까지 쓰는 임시 추정치다.
// ⚠️ 차 번호, 라인업, 캘린더(개최 여부·랩 수)는 출시 전 공식 자료와 대조한다.

import type { Circuit, Driver, Stats, Team } from './types';

export const OVR_WEIGHTS: Stats = {
  pace: 0.25,
  racecraft: 0.2,
  tyre: 0.15,
  consistency: 0.2,
  wet: 0.1,
  feedback: 0.1,
};

/** 가중 평균 OVR. 가중치 합이 1이라 모든 능력치가 같으면 OVR도 그 값이다. */
export function ovr(s: Stats): number {
  return (
    s.pace * OVR_WEIGHTS.pace +
    s.racecraft * OVR_WEIGHTS.racecraft +
    s.tyre * OVR_WEIGHTS.tyre +
    s.consistency * OVR_WEIGHTS.consistency +
    s.wet * OVR_WEIGHTS.wet +
    s.feedback * OVR_WEIGHTS.feedback
  );
}

export const POINTS_RACE = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const;
export const POINTS_SPRINT = [8, 7, 6, 5, 4, 3, 2, 1] as const;

/** F1에서 레이스 우승이 가능한 팀(SPEC §5.1 v0.11). 다른 팀은 포디움까지만 오른다 */
export const F1_WINNER_TEAMS = ['ferrari', 'mclaren', 'mercedes', 'red_bull'] as const;

/** 시리즈별 차 비중 w (SPEC §5.1) */
export const CAR_WEIGHT = { kart: 0.35, f4: 0.3, freca: 0.3, f3: 0.3, f2: 0.25, f1: 0.7 } as const;

export const TEAMS_2026: Team[] = [
  { id: 'mclaren', name: 'McLaren', color: '#FF8000', quality: 0.93, reliability: 0.93, ops: 0.92, budget: 0.95, manufacturer: false },
  { id: 'mercedes', name: 'Mercedes', color: '#27F4D2', quality: 0.925, reliability: 0.92, ops: 0.9, budget: 0.95, manufacturer: true },
  { id: 'red_bull', name: 'Red Bull Racing', color: '#3671C6', quality: 0.919, reliability: 0.88, ops: 0.94, budget: 0.95, manufacturer: false },
  { id: 'ferrari', name: 'Ferrari', color: '#E8002D', quality: 0.915, reliability: 0.9, ops: 0.85, budget: 0.95, manufacturer: true },
  { id: 'williams', name: 'Williams', color: '#64C4FF', quality: 0.884, reliability: 0.88, ops: 0.84, budget: 0.75, manufacturer: false },
  { id: 'aston_martin', name: 'Aston Martin', color: '#229971', quality: 0.879, reliability: 0.85, ops: 0.85, budget: 0.9, manufacturer: false },
  { id: 'racing_bulls', name: 'Racing Bulls', color: '#6692FF', quality: 0.879, reliability: 0.87, ops: 0.86, budget: 0.7, manufacturer: false },
  { id: 'haas', name: 'Haas', color: '#B6BABD', quality: 0.873, reliability: 0.87, ops: 0.82, budget: 0.6, manufacturer: false },
  { id: 'alpine', name: 'Alpine', color: '#0093CC', quality: 0.867, reliability: 0.86, ops: 0.8, budget: 0.75, manufacturer: false },
  { id: 'audi', name: 'Audi', color: '#BB0A30', quality: 0.867, reliability: 0.84, ops: 0.82, budget: 0.85, manufacturer: true },
  { id: 'cadillac', name: 'Cadillac', color: '#C9B37E', quality: 0.855, reliability: 0.82, ops: 0.78, budget: 0.7, manufacturer: true, debutYear: 2026 },
];

type StatTuple = [pace: number, racecraft: number, tyre: number, consistency: number, wet: number, feedback: number];
function st([pace, racecraft, tyre, consistency, wet, feedback]: StatTuple): Stats {
  return { pace, racecraft, tyre, consistency, wet, feedback };
}
function d(code: string, name: string, nationality: string, birthYear: number, teamId: string, number: number, stats: StatTuple): Driver {
  return { id: code.toLowerCase(), code, name, nationality, birthYear, teamId, number, stats: st(stats), real: true };
}

// 실존 드라이버에게는 성격(personality)을 붙이지 않는다(중립). SPEC §2.2.
export const DRIVERS_2026: Driver[] = [
  d('NOR', 'Lando Norris', 'GB', 1999, 'mclaren', 1, [94, 90, 90, 89, 88, 88]),
  d('PIA', 'Oscar Piastri', 'AU', 2001, 'mclaren', 81, [93, 89, 91, 90, 85, 86]),
  d('RUS', 'George Russell', 'GB', 1998, 'mercedes', 63, [93, 87, 88, 89, 88, 89]),
  d('ANT', 'Kimi Antonelli', 'IT', 2006, 'mercedes', 12, [88, 84, 80, 78, 84, 78]),
  d('VER', 'Max Verstappen', 'NL', 1997, 'red_bull', 3, [97, 96, 92, 93, 96, 92]),
  d('HAD', 'Isack Hadjar', 'FR', 2004, 'red_bull', 6, [86, 83, 80, 80, 80, 79]),
  d('LEC', 'Charles Leclerc', 'MC', 1997, 'ferrari', 16, [96, 90, 87, 86, 88, 88]),
  d('HAM', 'Lewis Hamilton', 'GB', 1985, 'ferrari', 44, [91, 92, 93, 90, 95, 95]),
  d('ALB', 'Alexander Albon', 'TH', 1996, 'williams', 23, [87, 86, 87, 88, 85, 87]),
  d('SAI', 'Carlos Sainz', 'ES', 1994, 'williams', 55, [89, 88, 91, 89, 88, 92]),
  d('ALO', 'Fernando Alonso', 'ES', 1981, 'aston_martin', 14, [89, 94, 94, 92, 93, 96]),
  d('STR', 'Lance Stroll', 'CA', 1998, 'aston_martin', 18, [80, 79, 82, 80, 80, 80]),
  d('LAW', 'Liam Lawson', 'NZ', 2002, 'racing_bulls', 30, [83, 82, 80, 79, 80, 78]),
  d('LIN', 'Arvid Lindblad', 'GB', 2007, 'racing_bulls', 41, [82, 80, 77, 76, 77, 75]),
  d('OCO', 'Esteban Ocon', 'FR', 1996, 'haas', 31, [85, 84, 86, 85, 86, 85]),
  d('BEA', 'Oliver Bearman', 'GB', 2005, 'haas', 87, [85, 84, 81, 82, 80, 79]),
  d('GAS', 'Pierre Gasly', 'FR', 1996, 'alpine', 10, [86, 85, 86, 86, 86, 86]),
  d('COL', 'Franco Colapinto', 'AR', 2003, 'alpine', 43, [80, 81, 78, 76, 78, 76]),
  d('HUL', 'Nico Hülkenberg', 'DE', 1987, 'audi', 27, [85, 84, 86, 88, 85, 90]),
  d('BOR', 'Gabriel Bortoleto', 'BR', 2004, 'audi', 5, [84, 82, 80, 82, 81, 79]),
  d('PER', 'Sergio Pérez', 'MX', 1990, 'cadillac', 11, [85, 85, 90, 82, 84, 86]),
  d('BOT', 'Valtteri Bottas', 'FI', 1989, 'cadillac', 77, [86, 82, 87, 87, 84, 88]),
];

function c(
  id: string, name: string, country: string, laps: number, lengthKm: number, baseLap: number,
  overtakeEase: number, street: boolean, rainChance: number, pitLoss: number, deg: number, sprint = false,
): Circuit {
  return { id, name, country, laps, lengthKm, baseLap, overtakeEase, street, rainChance, pitLoss, deg, sprint };
}

/** 2026 캘린더 24라운드(순서대로). 스프린트 6개: 중국, 마이애미, 캐나다, 영국, 네덜란드, 싱가포르 */
export const CALENDAR_2026: Circuit[] = [
  c('australia', 'Albert Park', 'AU', 58, 5.278, 80.5, 0.45, false, 0.2, 19, 1.0),
  c('china', 'Shanghai', 'CN', 56, 5.451, 95, 0.6, false, 0.2, 22, 1.1, true),
  c('japan', 'Suzuka', 'JP', 53, 5.807, 91, 0.35, false, 0.25, 22, 1.2),
  c('bahrain', 'Sakhir', 'BH', 57, 5.412, 93, 0.7, false, 0.02, 23, 1.3),
  c('saudi_arabia', 'Jeddah', 'SA', 50, 6.174, 90, 0.5, true, 0.02, 20, 0.8),
  c('miami', 'Miami', 'US', 57, 5.412, 90, 0.5, false, 0.25, 19, 1.0, true),
  c('canada', 'Gilles Villeneuve', 'CA', 70, 4.361, 74, 0.6, false, 0.3, 18, 0.9, true),
  c('monaco', 'Monaco', 'MC', 78, 3.337, 73, 0.05, true, 0.15, 20, 0.6),
  c('barcelona', 'Barcelona-Catalunya', 'ES', 66, 4.657, 76, 0.35, false, 0.1, 22, 1.3),
  c('austria', 'Red Bull Ring', 'AT', 71, 4.318, 66, 0.65, false, 0.25, 20, 1.0),
  c('britain', 'Silverstone', 'GB', 52, 5.891, 88, 0.55, false, 0.35, 20, 1.2, true),
  c('belgium', 'Spa-Francorchamps', 'BE', 44, 7.004, 105, 0.7, false, 0.4, 18, 1.0),
  c('hungary', 'Hungaroring', 'HU', 70, 4.381, 78, 0.2, false, 0.15, 20, 1.1),
  c('netherlands', 'Zandvoort', 'NL', 72, 4.259, 72, 0.2, false, 0.3, 21, 1.1, true),
  c('italy', 'Monza', 'IT', 53, 5.793, 82, 0.6, false, 0.15, 24, 0.8),
  c('madrid', 'Madring', 'ES', 57, 5.47, 88, 0.45, true, 0.1, 20, 1.0),
  c('azerbaijan', 'Baku', 'AZ', 51, 6.003, 104, 0.55, true, 0.05, 20, 0.8),
  c('singapore', 'Marina Bay', 'SG', 62, 4.94, 93, 0.2, true, 0.35, 28, 1.0, true),
  c('usa', 'Circuit of the Americas', 'US', 56, 5.513, 96, 0.55, false, 0.1, 20, 1.2),
  c('mexico', 'Hermanos Rodríguez', 'MX', 71, 4.304, 79, 0.45, false, 0.1, 22, 0.8),
  c('brazil', 'Interlagos', 'BR', 71, 4.309, 72, 0.6, false, 0.4, 21, 1.0),
  c('las_vegas', 'Las Vegas', 'US', 50, 6.201, 94, 0.65, true, 0.02, 21, 0.8),
  c('qatar', 'Lusail', 'QA', 57, 5.419, 83, 0.4, false, 0.02, 26, 1.4),
  c('abu_dhabi', 'Yas Marina', 'AE', 58, 5.281, 85, 0.4, false, 0.02, 21, 0.9),
];

export function teamById(id: string): Team {
  const t = TEAMS_2026.find((x) => x.id === id);
  if (!t) throw new Error(`unknown team ${id}`);
  return t;
}

export function circuitById(id: string): Circuit {
  const t = CALENDAR_2026.find((x) => x.id === id);
  if (!t) throw new Error(`unknown circuit ${id}`);
  return t;
}
