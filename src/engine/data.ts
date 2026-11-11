// 2026 시즌 시작 데이터.
// 드라이버 능력치: scripts/rate-drivers.ts가 2024~2026 공개 기록으로 계산해 쓴 값(기준값 data/drivers/baseline.json과 섞음, SPEC §2.2).
// 팀 성능: 2026 컨스트럭터 순위 순서에 맞춘 값(메르세데스 > 페라리 > 레드불 > 맥라렌 > 레이싱 불스 > 알핀 > 하스 > 아우디 > 윌리엄스 > 애스턴 마틴 > 캐딜락).
// 2026년 11월 대조 완료: 라인업·차 번호(22명), 캘린더(실제 23라운드), 스프린트 6곳, 랩 수, 2027 공식 캘린더. 출처는 SPEC §2.2 데이터 확인.

import { RETURNING_CIRCUITS } from './calendar';
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
  { id: 'mclaren', name: 'McLaren', color: '#FF8000', quality: 0.916, reliability: 0.93, ops: 0.92, budget: 0.95, manufacturer: false },
  { id: 'mercedes', name: 'Mercedes', color: '#27F4D2', quality: 0.935, reliability: 0.92, ops: 0.9, budget: 0.95, manufacturer: true },
  { id: 'red_bull', name: 'Red Bull Racing', color: '#3671C6', quality: 0.92, reliability: 0.88, ops: 0.94, budget: 0.95, manufacturer: false },
  { id: 'ferrari', name: 'Ferrari', color: '#E8002D', quality: 0.925, reliability: 0.9, ops: 0.85, budget: 0.95, manufacturer: true },
  { id: 'williams', name: 'Williams', color: '#64C4FF', quality: 0.868, reliability: 0.88, ops: 0.84, budget: 0.75, manufacturer: false },
  { id: 'aston_martin', name: 'Aston Martin', color: '#229971', quality: 0.864, reliability: 0.85, ops: 0.85, budget: 0.9, manufacturer: false },
  { id: 'racing_bulls', name: 'Racing Bulls', color: '#6692FF', quality: 0.884, reliability: 0.87, ops: 0.86, budget: 0.7, manufacturer: false },
  { id: 'haas', name: 'Haas', color: '#B6BABD', quality: 0.874, reliability: 0.87, ops: 0.82, budget: 0.6, manufacturer: false },
  { id: 'alpine', name: 'Alpine', color: '#0093CC', quality: 0.878, reliability: 0.86, ops: 0.8, budget: 0.75, manufacturer: false },
  { id: 'audi', name: 'Audi', color: '#BB0A30', quality: 0.871, reliability: 0.84, ops: 0.82, budget: 0.85, manufacturer: true },
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
  d('NOR', 'Lando Norris', 'GB', 1999, 'mclaren', 1, [88, 89, 88, 88, 88, 86]),
  d('PIA', 'Oscar Piastri', 'AU', 2001, 'mclaren', 81, [86, 89, 87, 88, 84, 82]),
  d('RUS', 'George Russell', 'GB', 1998, 'mercedes', 63, [92, 83, 87, 89, 89, 87]),
  d('ANT', 'Kimi Antonelli', 'IT', 2006, 'mercedes', 12, [89, 83, 81, 81, 84, 78]),
  d('VER', 'Max Verstappen', 'NL', 1997, 'red_bull', 3, [98, 92, 97, 93, 96, 90]),
  d('HAD', 'Isack Hadjar', 'FR', 2004, 'red_bull', 6, [92, 84, 84, 84, 80, 76]),
  d('LEC', 'Charles Leclerc', 'MC', 1997, 'ferrari', 16, [91, 87, 87, 86, 87, 87]),
  d('HAM', 'Lewis Hamilton', 'GB', 1985, 'ferrari', 44, [88, 90, 90, 89, 93, 94]),
  d('ALB', 'Alexander Albon', 'TH', 1996, 'williams', 23, [85, 85, 87, 85, 85, 85]),
  d('SAI', 'Carlos Sainz', 'ES', 1994, 'williams', 55, [89, 85, 88, 87, 88, 90]),
  d('ALO', 'Fernando Alonso', 'ES', 1981, 'aston_martin', 14, [90, 92, 92, 91, 93, 95]),
  d('STR', 'Lance Stroll', 'CA', 1998, 'aston_martin', 18, [80, 82, 81, 81, 80, 86]),
  d('LAW', 'Liam Lawson', 'NZ', 2002, 'racing_bulls', 30, [88, 84, 82, 82, 80, 80]),
  d('LIN', 'Arvid Lindblad', 'GB', 2007, 'racing_bulls', 41, [85, 82, 78, 78, 77, 75]),
  d('OCO', 'Esteban Ocon', 'FR', 1996, 'haas', 31, [87, 85, 86, 86, 86, 87]),
  d('BEA', 'Oliver Bearman', 'GB', 2005, 'haas', 87, [91, 85, 84, 83, 81, 79]),
  d('GAS', 'Pierre Gasly', 'FR', 1996, 'alpine', 10, [88, 87, 87, 87, 86, 87]),
  d('COL', 'Franco Colapinto', 'AR', 2003, 'alpine', 43, [80, 85, 80, 79, 78, 78]),
  d('HUL', 'Nico Hülkenberg', 'DE', 1987, 'audi', 27, [85, 86, 86, 82, 85, 91]),
  d('BOR', 'Gabriel Bortoleto', 'BR', 2004, 'audi', 5, [84, 83, 81, 79, 81, 76]),
  d('PER', 'Sergio Pérez', 'MX', 1990, 'cadillac', 11, [85, 85, 89, 83, 84, 90]),
  d('BOT', 'Valtteri Bottas', 'FI', 1989, 'cadillac', 77, [81, 81, 85, 84, 84, 90]),
];

function c(
  id: string, name: string, country: string, laps: number, lengthKm: number, baseLap: number,
  overtakeEase: number, street: boolean, rainChance: number, pitLoss: number, deg: number, sprint = false,
): Circuit {
  return { id, name, country, laps, lengthKm, baseLap, overtakeEase, street, rainChance, pitLoss, deg, sprint };
}

/** F1 서킷 정의(2026 시즌 계획 24곳). 바레인·사우디는 2026년에 열리지 못했지만 2027년에 돌아온다 */
const F1_CIRCUITS: Circuit[] = [
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

/** F1 캘린더에 들어갈 수 있는 모든 서킷: 2026 시즌 계획 24곳 + 21세기 복귀 후보 */
export const ALL_F1_CIRCUITS: Circuit[] = [...F1_CIRCUITS, ...RETURNING_CIRCUITS];

const byId = (id: string, sprint = false): Circuit => {
  const t = ALL_F1_CIRCUITS.find((x) => x.id === id);
  if (!t) throw new Error(`unknown circuit ${id}`);
  return { ...t, sprint };
};

/**
 * 실제로 치러진 2026 시즌 23라운드(순서대로). 중동 정세로 사우디 GP는 취소, 바레인 GP는 10월 세팡에서 열렸다.
 * 스프린트 6개: 중국, 마이애미, 캐나다, 영국, 네덜란드, 싱가포르
 */
export const CALENDAR_2026: Circuit[] = [
  byId('australia'), byId('china', true), byId('japan'), byId('miami', true), byId('canada', true), byId('monaco'),
  byId('barcelona'), byId('austria'), byId('britain', true), byId('belgium'), byId('hungary'), byId('netherlands', true),
  byId('italy'), byId('madrid'), byId('azerbaijan'), byId('sepang'), byId('singapore', true), byId('usa'),
  byId('mexico'), byId('brazil'), byId('las_vegas'), byId('qatar'), byId('abu_dhabi'),
];

/**
 * 공식 발표된 2027 캘린더 24라운드(2026년 9월 발표). 바레인·사우디 복귀, 포르티망이 바르셀로나 자리, 이스탄불 복귀(서킷 승인 조건),
 * 잔드보르트 제외. 스프린트 10개: 바레인, 호주, 일본, 캐나다, 모나코, 영국, 이탈리아, 브라질, 카타르, 아부다비
 */
export const CALENDAR_2027_SLOTS: Array<{ id: string; sprint: boolean }> = [
  ['bahrain', true], ['saudi_arabia', false], ['australia', true], ['japan', true], ['china', false], ['miami', false],
  ['canada', true], ['monaco', true], ['portimao', false], ['britain', true], ['austria', false], ['belgium', false],
  ['hungary', false], ['italy', true], ['madrid', false], ['azerbaijan', false], ['istanbul', false], ['singapore', false],
  ['usa', false], ['mexico', false], ['brazil', true], ['las_vegas', false], ['qatar', true], ['abu_dhabi', true],
].map(([id, sprint]) => ({ id: id as string, sprint: sprint as boolean }));

export function circuitById(id: string): Circuit {
  const t = ALL_F1_CIRCUITS.find((x) => x.id === id);
  if (!t) throw new Error(`unknown circuit ${id}`);
  return t;
}
