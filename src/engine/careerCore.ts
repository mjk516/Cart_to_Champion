// 커리어 타입과 공통 규칙(SPEC §1·§2·§7): Career·SeasonRecord·Offer 타입, 캘린더, 홈 그랑프리, 가족 행동 계수.

import { type Helmet } from './creation';
import { PERSONALITIES } from './creation';
import { type FeedItem } from './feed';
import { type Manager } from './manager';
import { type CalendarChange, type CalendarSlot } from './calendar';
import { CALENDAR_2026, circuitById } from './data';
import { rngFor } from './rng';
import { type Hidden, type TrainingId } from './growth';
import { type Media } from './media';
import { type RaceCar, type RadioOptionId } from './race';
import { type SeriesId } from './series';
import { type TeamNews, type TeamWorld } from './teams';
import { STAT_KEYS, type Circuit, type Personality, type StatKey, type Stats, type WealthTier } from './types';

export const ENGINE_VERSION = '0.2.0';
export const PLAYER_ID = 'player';


// ── 타입 ─────────────────────────────────────────────────────────────
export interface CareerSetup {
  seed: number;
  name: string;
  nationality: string;
  wealthTier: WealthTier;
  personality: Personality;
  candidateIndex: number;
  reroll?: number;
  focus: StatKey[];
  startYear?: number;
  /** 차 번호(2~99, 실제 F1 번호와 겹치지 않음). 없으면 시드로 정한다 */
  number?: number;
  /** 헬멧 디자인 */
  helmet?: Helmet;
}

export interface Contract {
  series: SeriesId;
  team: string;
  teamId?: string;
  seat: 'race' | 'reserve';
  endYear: number;
  /** 유로/시즌, 받는 돈 */
  salary: number;
  /** 유로/시즌, 내는 돈(페이 시트) */
  seatCost: number;
  teamQuality: number;
  /** 시설 등급 0~1 (훈련 효율) */
  facility: number;
  /** 매니지먼트가 시트 비용을 대신 낸다(대가: 나중에 F1 연봉 일부) */
  management?: boolean;
}

export interface Offer extends Contract {
  id: string;
  /** 이 제안을 받으면 자리를 비워 주는 AI 드라이버 */
  displaceDriverId?: string;
  years: number;
  affordable: boolean;
  note: string;
}

export interface Offseason {
  year: number;
  offers: Offer[];
  /** 성격 문제 등으로 현재 팀이 방출을 통보했다 */
  released: boolean;
  academyOffer: string | null;
  notes: string[];
}

export interface OffseasonChoice {
  offerId: string | null;
  joinAcademy?: boolean;
  retire?: boolean;
}

export interface SeasonRecord {
  year: number;
  age: number;
  series: SeriesId;
  team: string | null;
  seat: 'race' | 'reserve' | 'none';
  races: number;
  wins: number;
  podiums: number;
  poles: number;
  points: number;
  position: number | null;
  fieldSize: number;
  champion: boolean;
  ovrStart: number;
  ovrEnd: number;
  growth: { training: number; racing: number; environment: number; aging: number };
  superLicence: number;
  income: number;
  expenses: number;
  fundsEnd: number;
  expectedAvg: number;
  actualAvg: number;
  teammateBeat: number;
  headline: string;
  notes: string[];
  /** 시즌을 마친 뒤의 세부 능력치(은퇴 화면 성장 곡선용). 이전 저장 파일에는 없을 수 있다 */
  statsEnd?: Stats;
  /** 언론·팬 반응(SPEC §6.1) */
  feed?: FeedItem[];
  /** F1 홈 그랑프리 우승 수(업적용). 이전 저장 파일에는 없을 수 있다 */
  homeWins?: number;
  /** 군 복무로 보낸 시즌(SPEC §2.4 v0.30) */
  military?: boolean;
  /** F1 시즌 최종 순위(드라이버·컨스트럭터, SPEC v0.34). F1 시즌에만 있다 */
  f1Standings?: F1Standings;
  /** 시즌 중 내구레이스 결과(SPEC v0.34) */
  endurance?: EnduranceResult;
}

export interface F1Standings {
  drivers: { id: string; name: string; teamId: string; points: number; wins: number }[];
  teams: { teamId: string; name: string; points: number }[];
}

export interface EnduranceResult {
  name: string;
  when: string;
  /** 종합 순위(1~3 포디움). 리타이어면 null */
  position: number | null;
  classCars: number;
  /** 포디움 보너스로 오른 능력치 */
  gains: Partial<Record<StatKey, number>>;
}

export interface F1Driver {
  id: string;
  code: string;
  name: string;
  nationality: string;
  birthYear: number;
  teamId: string | null;
  number: number;
  stats: Stats;
  real: boolean;
  contractEnd: number;
  retired: boolean;
  /** AI 성장 상한(OVR) */
  potential: number;
}

export interface F1World {
  teams: TeamWorld;
  drivers: F1Driver[];
  champions: Array<{ year: number; driverId: string; name: string; teamId: string }>;
  news: TeamNews[];
  /** 이번 시즌 F1 캘린더(라운드 순서). 이전 저장 파일에는 없을 수 있다(그때는 2026 캘린더) */
  calendar?: CalendarSlot[];
  /** 지금까지의 캘린더 변화 */
  calendarLog?: CalendarChange[];
  /** 팀 대표 교체 기록(SPEC §2.1 v0.25) */
  principalLog?: Array<{ season: number; teamId: string; team: string; good: boolean; delta: number }>;
}

export const CALENDAR_2026_SLOTS: CalendarSlot[] = CALENDAR_2026.map((x) => ({ id: x.id, sprint: x.sprint }));

/** 팀 대표가 바뀔 확률(팀마다 시즌당) */
export const PRINCIPAL_CHANGE_CHANCE = 0.06;

/** 가족이 생기면(SPEC §6 v0.25) 레이스에서 덜 공격적이고 실수가 줄어든다 */
export const FAMILY_BEHAVIOR = { overtakeAttempt: 0.88, contactRisk: 0.7, mistake: 0.8, lapVariance: 0.9, fightback: 0.8 } as const;

export function playerBehavior(c: Career): RaceCar['behaviorMul'] {
  return c.family ? FAMILY_BEHAVIOR : undefined;
}

/** 대한민국 국적 드라이버가 커리어 중 군에 입대할 확률(한 번만 정한다) */
export const MILITARY_CHANCE = 0.01;
/** 복무 기간(시즌) */
export const MILITARY_SEASONS = 2;

/** 입대하는 나이. 대한민국 국적이 아니거나 이번 커리어에 입대가 없으면 null(시드로 정해진다) */
export function militaryDraftAge(c: Career): number | null {
  if (c.driver.nationality !== 'KR') return null;
  const r = rngFor(c.seed, 'military');
  if (r() >= MILITARY_CHANCE) return null;
  return 20 + Math.floor(r() * 8);
}

/** 이번 오프시즌이 끝나면 입대한다 */
export function draftedNext(c: Career): boolean {
  return !c.military && !c.retired && militaryDraftAge(c) === c.age + 1;
}

/** 이번 시즌이 복무 중인가 */
export function inMilitary(c: Career, year = c.year): boolean {
  return !!c.military && year >= c.military.start && year <= c.military.end;
}

/** 홈 그랑프리 시장 보너스(SPEC §3.1 v0.18): 캘린더에 자기 나라 그랑프리가 있으면 F1 팀의 평가에 더한다 */
export const HOME_MARKET_BONUS = 5;
/** 신인 보장 기준: F2 이 순위 안(홈 시장이 있으면 더 넓다) */
export const ROOKIE_GUARANTEE_POS = 5;
export const ROOKIE_GUARANTEE_POS_HOME = 10;
/** 홈 그랑프리 능력치 상승(일관성 제외) */
export const HOME_GP_BOOST = 2;

/** 이번 시즌 캘린더에 이 나라의 그랑프리가 있는가 */
export function hasHomeGp(c: Career, nationality = c.driver.nationality): boolean {
  return f1Calendar(c).some((x) => x.country === nationality);
}

export interface HomeGpEffect { boost: number; mental: number; line: string }

/** 이 서킷이 플레이어의 홈 그랑프리면 그 효과(SPEC §5.6). 능력치는 조금 오르고, 일관성은 성격에 따라 오르거나 내린다 */
export function homeGpEffect(c: Career, circuit: Circuit): HomeGpEffect | null {
  if (circuit.country !== c.driver.nationality) return null;
  const p = PERSONALITIES[c.driver.personality];
  return { boost: HOME_GP_BOOST, mental: p.homeMental, line: p.homeLine };
}

export function withHomeGp(stats: Stats, e: HomeGpEffect): Stats {
  const out = { ...stats };
  for (const k of STAT_KEYS) out[k] = Math.min(99, Math.max(1, out[k] + (k === 'consistency' ? e.mental : e.boost)));
  return out;
}

/** 이번 시즌 F1 캘린더(SPEC §2.1 v0.17) */
export function f1Calendar(c: Career): Circuit[] {
  return (c.world.calendar ?? CALENDAR_2026_SLOTS).map((s) => ({ ...circuitById(s.id), sprint: s.sprint }));
}

export type ChoiceLogEntry =
  | { year: number; kind: 'training'; plan: TrainingId[]; radio?: Record<string, RadioOptionId>; endurance?: boolean }
  | { year: number; kind: 'event'; eventId: string; optionId: string }
  | { year: number; kind: 'offseason'; choice: OffseasonChoice };

export interface EventLogEntry {
  year: number;
  id: string;
  title: string;
  option: string;
  text: string;
  summary: string[];
}

export interface Career {
  schemaVersion: 1;
  engineVersion: string;
  seed: number;
  setup: CareerSetup;
  driver: {
    name: string;
    code: string;
    nationality: string;
    personality: Personality;
    wealthTier: WealthTier;
    focus: StatKey[];
    /** 차 번호. 이전 저장 파일에는 없을 수 있다 */
    number?: number;
    helmet?: Helmet;
    stats: Stats;
    xp: Stats;
    hidden: Hidden;
  };
  year: number;
  age: number;
  funds: number;
  media: Media;
  contract: Contract | null;
  academy: string | null;
  /** 매니지먼트 후원 계약: F1 데뷔 후 years년 동안 연봉의 share를 가져간다 */
  management: { share: number; years: number; startYear: number | null } | null;
  kartSeasons: number;
  f1Debut: number | null;
  noSeatSeasons: number;
  history: SeasonRecord[];
  choiceLog: ChoiceLogEntry[];
  world: F1World;
  retired: boolean;
  /** 이번 오프시즌에 처리해야 할 전환점 이벤트(SPEC §6) */
  pendingEvents?: string[];
  /** 지금까지 겪은 이벤트와 결과 */
  eventLog?: EventLogEntry[];
  /** 다음 오프시즌까지 유지되는 플래그(scoutBonus, releaseRisk) */
  flags?: Record<string, number>;
  /** 선수 매니저(오프시즌 조언). 이전 저장 파일에는 없을 수 있다 */
  manager?: Manager;
  /** 가정을 꾸린 해(SPEC §6 v0.25): 멘탈은 안정되고 레이스 공격성은 줄어든다 */
  family?: { since: number };
  /** 군 복무 기간(SPEC §2.4 v0.30): start~end 시즌은 레이스를 하지 않는다 */
  military?: { start: number; end: number };
  totals: {
    f1Titles: number;
    f1Starts: number;
    f1Wins: number;
    f1Podiums: number;
    f1Poles: number;
    juniorTitles: string[];
    earnings: number;
    releases: number;
    bestOvr: number;
  };
}
