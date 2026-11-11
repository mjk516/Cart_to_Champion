// 커리어 사다리 시리즈 정의(SPEC §2, §5.3).
// ⚠️ 잠정값: 주말 형식, 슈퍼 라이선스 포인트표, 시트 비용, 하부 리그 팀 목록은 출시 전 최신 규정·자료와 대조한다.

import { circuitById } from './data';
import { rngFor } from './rng';
import type { Circuit } from './types';

export type SeriesId = 'kart' | 'f4' | 'freca' | 'f3' | 'f2' | 'f1';
export const LADDER: SeriesId[] = ['kart', 'f4', 'freca', 'f3', 'f2', 'f1'];

export interface RaceFormat {
  label: string;
  kind: 'race' | 'sprint';
  laps: number;
  mandatoryStop: boolean;
  points: readonly number[];
  /** 퀄리 상위 N명을 뒤집어 출발(리버스 그리드) */
  reverseTop?: number;
}

export interface SeriesDef {
  id: SeriesId;
  label: string;
  fieldSize: number;
  rounds: number;
  /** 라운드마다 치르는 레이스 */
  races: RaceFormat[];
  carWeight: number;
  /** 시트 비용(유로/시즌): 하위 팀 → 상위 팀 */
  seatCost: [number, number];
  /** 슈퍼 라이선스 포인트(챔피언십 순위별) */
  superLicence: readonly number[];
  /** AI 드라이버 OVR 범위 */
  aiOvr: [number, number];
  minAge: number;
  /** 시즌 성적에 따른 스폰서 기본액(유로) */
  sponsorBase: number;
  /** 팀 목록(팀당 드라이버 수 = fieldSize / teams.length) */
  teams: string[];
  circuits: (year: number) => Circuit[];
}

const P25 = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const;
const P_F2_SPRINT = [10, 8, 6, 5, 4, 3, 2, 1] as const;
const P_F3_SPRINT = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const;

/** 실제 레이아웃 데이터가 없는 하부 리그 서킷용 일반 서킷(SPEC §5.5: 서킷 ID로 시드를 고정해 항상 같은 모양) */
export function genericCircuit(name: string): Circuit {
  const r = rngFor('generic-circuit', name);
  const lengthKm = 3.6 + r() * 2.2;
  return {
    id: `gen_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    name,
    country: '',
    laps: 20,
    lengthKm,
    baseLap: 70 + lengthKm * 5 + r() * 6,
    overtakeEase: 0.3 + r() * 0.35,
    street: false,
    rainChance: 0.1 + r() * 0.2,
    pitLoss: 22,
    deg: 0.9 + r() * 0.3,
    sprint: false,
  };
}

const F4_TRACKS = ['Misano', 'Vallelunga', 'Imola', 'Mugello', 'Monza', 'Paul Ricard', 'Barcelona'];
const FRECA_TRACKS = ['Misano', 'Spa', 'Zandvoort', 'Hungaroring', 'Imola', 'Red Bull Ring', 'Barcelona', 'Mugello', 'Paul Ricard', 'Monza'];
const F3_CIRCUITS = ['australia', 'bahrain', 'monaco', 'barcelona', 'austria', 'britain', 'belgium', 'hungary', 'italy', 'madrid'];
const F2_CIRCUITS = ['australia', 'bahrain', 'saudi_arabia', 'monaco', 'barcelona', 'austria', 'britain', 'belgium', 'hungary', 'italy', 'azerbaijan', 'madrid', 'qatar', 'abu_dhabi'];

export const SERIES: Record<Exclude<SeriesId, 'f1'>, SeriesDef> = {
  kart: {
    id: 'kart', label: '카트', fieldSize: 30, rounds: 8, races: [], carWeight: 0.35,
    seatCost: [40_000, 220_000], superLicence: [], aiOvr: [36, 62], minAge: 12, sponsorBase: 60_000,
    teams: ['Tony Kart', 'CRG', 'Kart Republic', 'Birel ART', 'Sodikart', 'Exprit', 'Parolin', 'Energy Corse', 'Praga', 'KR Junior'],
    circuits: () => [],
  },
  f4: {
    id: 'f4', label: 'F4', fieldSize: 30, rounds: 7, carWeight: 0.3,
    races: [
      { label: '레이스 1', kind: 'race', laps: 16, mandatoryStop: false, points: P25 },
      { label: '레이스 2', kind: 'race', laps: 16, mandatoryStop: false, points: P25, reverseTop: 8 },
      { label: '레이스 3', kind: 'race', laps: 16, mandatoryStop: false, points: P25 },
    ],
    seatCost: [250_000, 400_000], superLicence: [12, 10, 7, 5, 3, 2, 1], aiOvr: [42, 59], minAge: 15, sponsorBase: 150_000,
    teams: ['Prema', 'US Racing', 'Van Amersfoort', 'R-ace GP', 'Jenzer', 'AKM Motorsport', 'Cram', 'BVM', 'Iron Lynx', 'Mucke'],
    circuits: () => F4_TRACKS.map(genericCircuit),
  },
  freca: {
    id: 'freca', label: 'FRECA', fieldSize: 30, rounds: 10, carWeight: 0.3,
    races: [
      { label: '레이스 1', kind: 'race', laps: 22, mandatoryStop: false, points: P25 },
      { label: '레이스 2', kind: 'race', laps: 22, mandatoryStop: false, points: P25 },
    ],
    seatCost: [550_000, 800_000], superLicence: [25, 20, 15, 10, 8, 6, 5, 3, 2, 1], aiOvr: [48, 63], minAge: 15, sponsorBase: 250_000,
    teams: ['Prema', 'ART Grand Prix', 'R-ace GP', 'Van Amersfoort', 'MP Motorsport', 'KIC', 'RPM', 'Trident', 'Saintéloc', 'G4 Racing'],
    circuits: () => FRECA_TRACKS.map(genericCircuit),
  },
  f3: {
    id: 'f3', label: 'FIA F3', fieldSize: 30, rounds: 10, carWeight: 0.3,
    races: [
      { label: '스프린트', kind: 'sprint', laps: 18, mandatoryStop: false, points: P_F3_SPRINT, reverseTop: 12 },
      { label: '피처', kind: 'race', laps: 24, mandatoryStop: false, points: P25 },
    ],
    seatCost: [900_000, 1_500_000], superLicence: [30, 25, 20, 15, 12, 9, 7, 5, 3, 2], aiOvr: [53, 68], minAge: 16, sponsorBase: 400_000,
    teams: ['Prema', 'Trident', 'ART Grand Prix', 'Hitech', 'MP Motorsport', 'Campos', 'Rodin', 'Van Amersfoort', 'Jenzer', 'AIX'],
    circuits: () => F3_CIRCUITS.map(circuitById),
  },
  f2: {
    id: 'f2', label: 'FIA F2', fieldSize: 22, rounds: 14, carWeight: 0.25,
    races: [
      { label: '스프린트', kind: 'sprint', laps: 24, mandatoryStop: false, points: P_F2_SPRINT, reverseTop: 10 },
      { label: '피처', kind: 'race', laps: 32, mandatoryStop: true, points: P25 },
    ],
    seatCost: [1_800_000, 3_000_000], superLicence: [40, 40, 40, 30, 20, 10, 8, 6, 4, 3], aiOvr: [58, 74], minAge: 17, sponsorBase: 700_000,
    teams: ['Campos', 'MP Motorsport', 'Prema', 'ART Grand Prix', 'Hitech', 'Rodin', 'DAMS', 'Invicta', 'Van Amersfoort', 'Trident', 'AIX'],
    circuits: () => F2_CIRCUITS.map(circuitById),
  },
};

/** 실제 드라이버 아카데미(SPEC §2). F1 팀 우선권 연결 */
export const ACADEMIES: Array<{ name: string; teamIds: string[] }> = [
  { name: 'Red Bull Junior Team', teamIds: ['red_bull', 'racing_bulls'] },
  { name: 'Ferrari Driver Academy', teamIds: ['ferrari', 'haas'] },
  { name: 'Mercedes Junior', teamIds: ['mercedes', 'williams'] },
  { name: 'McLaren Driver Development', teamIds: ['mclaren'] },
  { name: 'Alpine Academy', teamIds: ['alpine'] },
  { name: 'Williams Driver Academy', teamIds: ['williams'] },
];

export const SUPER_LICENCE_REQUIRED = 40;
export const SUPER_LICENCE_MIN_AGE = 18;

export function nextSeries(id: SeriesId): SeriesId | null {
  const i = LADDER.indexOf(id);
  return i >= 0 && i < LADDER.length - 1 ? (LADDER[i + 1] as SeriesId) : null;
}

export function seriesLabel(id: SeriesId): string {
  return id === 'f1' ? 'F1' : SERIES[id].label;
}
