// 커리어 루프(SPEC §1, §2, §4, §6.1, §7, §8, §9).
// 흐름: createCareer → [runSeason → getOffseason → applyOffseason] 반복 → 은퇴.
// 모든 난수는 커리어 시드에서 나오고, 플레이어의 선택은 choiceLog에 남는다(랭킹 검증 §9).

import { generateCandidates, WEALTH_TIERS } from './creation';
import { PERSONALITIES } from './creation';
import { applyEventChoice, EVENT_BY_ID, eventCard, pickEvents, type EventCard } from './events';
import { seasonFeed, type FeedItem } from './feed';
import { CALENDAR_2026, CAR_WEIGHT, DRIVERS_2026, F1_WINNER_TEAMS, ovr, POINTS_RACE, TEAMS_2026 } from './data';
import { teamForm } from './form';
import {
  addXp, ageCurve, applyAging, applyXp, generateHidden, recommendedPlan, SESSION_XP, TRAINING, trainingOutcome,
  TRAINING_SLOTS, TRAINING_SLOTS_RESERVE, type Hidden, type TrainingId,
} from './growth';
import { initialMedia, updateMediaSeason, type Media } from './media';
import { fictionalName } from './names';
import { enforceOrder, runRace, simulateQualifying, type RaceCar, type ResultRules } from './race';
import { hashSeed, int, normal, pick, rngFor, type Rng } from './rng';
import {
  ACADEMIES, LADDER, nextSeries, SERIES, seriesLabel, SUPER_LICENCE_MIN_AGE, SUPER_LICENCE_REQUIRED, type SeriesId,
} from './series';
import { initialWorld, runOffseason, type TeamNews, type TeamWorld } from './teams';
import { STAT_KEYS, type Personality, type StatKey, type Stats, type WealthTier } from './types';

export const ENGINE_VERSION = '0.2.0';
export const PLAYER_ID = 'player';

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

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
}

export type ChoiceLogEntry =
  | { year: number; kind: 'training'; plan: TrainingId[] }
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

// ── 생성 ─────────────────────────────────────────────────────────────
const zeroStats = (): Stats => ({ pace: 0, racecraft: 0, tyre: 0, consistency: 0, wet: 0, feedback: 0 });

function statsAround(rng: Rng, target: number, spread = 5): Stats {
  const s = zeroStats();
  for (const k of STAT_KEYS) s[k] = clamp(Math.round(target + normal(rng) * spread), 20, 97);
  return s;
}

function juniorTeams(series: Exclude<SeriesId, 'f1'>, year: number, seed: number): Array<{ name: string; quality: number; facility: number }> {
  const r = rngFor(seed, 'junior-teams', series, year);
  return SERIES[series].teams.map((name, i) => {
    const q = clamp(0.93 - i * 0.022 + normal(r) * 0.015, 0.65, 0.97);
    return { name, quality: q, facility: clamp(q - 0.05 + normal(r) * 0.03, 0.4, 0.98) };
  });
}

export function createCareer(setup: CareerSetup): Career {
  const startYear = setup.startYear ?? 2026;
  const cands = generateCandidates(setup.seed, setup.personality, setup.reroll ?? 0);
  const cand = cands[setup.candidateIndex];
  if (!cand) throw new Error(`candidateIndex ${setup.candidateIndex} out of range`);
  const wealth = WEALTH_TIERS[setup.wealthTier];
  const kartTeams = juniorTeams('kart', startYear, setup.seed);
  // 자산 규모로 감당할 수 있는 가장 좋은 카트 팀(국내 카트는 하위 팀 비용)
  const affordable = kartTeams
    .map((t, i) => ({ ...t, cost: lerp(SERIES.kart.seatCost[1], SERIES.kart.seatCost[0], i / (kartTeams.length - 1)) * 0.4 }))
    .filter((t) => t.cost <= wealth.startFunds + wealth.familySupport);
  const team = affordable[0] ?? { ...kartTeams[kartTeams.length - 1]!, cost: SERIES.kart.seatCost[0] * 0.4 };

  const rw = rngFor(setup.seed, 'world-init');
  const world: F1World = {
    teams: initialWorld(TEAMS_2026, startYear),
    drivers: DRIVERS_2026.map((d) => ({
      id: d.id, code: d.code, name: d.name, nationality: d.nationality, birthYear: d.birthYear, teamId: d.teamId,
      number: d.number, stats: { ...d.stats }, real: true, contractEnd: startYear + int(rw, 0, 2), retired: false,
      potential: Math.round(ovr(d.stats) + (startYear - d.birthYear <= 24 ? 3 + rw() * 4 : 0)),
    })),
    champions: [],
    news: [],
  };

  return {
    schemaVersion: 1,
    engineVersion: ENGINE_VERSION,
    seed: setup.seed,
    setup,
    driver: {
      name: setup.name,
      code: setup.name.replace(/[^A-Za-z가-힣]/g, '').slice(0, 3).toUpperCase() || 'YOU',
      nationality: setup.nationality,
      personality: setup.personality,
      wealthTier: setup.wealthTier,
      focus: setup.focus.slice(0, 2),
      stats: { ...cand.stats },
      xp: zeroStats(),
      hidden: generateHidden(setup.seed, setup.personality),
    },
    year: startYear,
    age: 12,
    funds: wealth.startFunds,
    media: initialMedia(),
    contract: {
      series: 'kart', team: team.name, seat: 'race', endYear: startYear, salary: 0, seatCost: Math.round(team.cost),
      teamQuality: team.quality, facility: team.facility,
    },
    academy: null,
    management: null,
    kartSeasons: 0,
    f1Debut: null,
    noSeatSeasons: 0,
    history: [],
    choiceLog: [],
    world,
    retired: false,
    pendingEvents: [],
    eventLog: [],
    flags: {},
    totals: { f1Titles: 0, f1Starts: 0, f1Wins: 0, f1Podiums: 0, f1Poles: 0, juniorTitles: [], earnings: 0, releases: 0, bestOvr: Math.round(ovr(cand.stats)) },
  };
}

// ── 시즌 ─────────────────────────────────────────────────────────────
interface SeasonSim {
  races: number;
  wins: number;
  podiums: number;
  poles: number;
  points: number;
  position: number | null;
  fieldSize: number;
  champion: boolean;
  expectedAvg: number;
  actualAvg: number;
  teammateBeat: number;
  raceXp: Partial<Stats>;
  prize: number;
}

const emptySim = (fieldSize: number): SeasonSim => ({
  races: 0, wins: 0, podiums: 0, poles: 0, points: 0, position: null, fieldSize, champion: false,
  expectedAvg: 0, actualAvg: 0, teammateBeat: 0, raceXp: {}, prize: 0,
});

function perfOf(stats: Stats, teamQ: number, w: number): number {
  return w * teamQ + (1 - w) * (ovr(stats) / 100);
}

function expectedRank(cars: RaceCar[], w: number, id: string): number {
  const sorted = [...cars].sort((a, b) => perfOf(b.stats, b.teamQuality, w) - perfOf(a.stats, a.teamQuality, w));
  return sorted.findIndex((c) => c.id === id) + 1;
}

function standingsOf(points: Map<string, number>, best: Map<string, number>): string[] {
  return [...points.keys()].sort((a, b) => (points.get(b) ?? 0) - (points.get(a) ?? 0) || (best.get(a) ?? 99) - (best.get(b) ?? 99));
}

function racePerfMult(expected: number, actual: number): number {
  return clamp(1 + (expected - actual) / 10, 0.8, 1.5);
}

function simulateKart(c: Career, stats: Stats, seed: number): SeasonSim {
  const contract = c.contract!;
  const intl = c.kartSeasons > 0;
  const range: [number, number] = intl ? [40, 62] : [32, 55];
  const r = rngFor(seed, 'kart', c.year);
  const w = SERIES.kart.carWeight;
  const field = Array.from({ length: SERIES.kart.fieldSize - 1 }, (_, i) => ({
    id: `k${i}`, stats: statsAround(r, lerp(range[0], range[1], r()), 4), q: 0.7 + r() * 0.25,
  }));
  field.push({ id: PLAYER_ID, stats, q: contract.teamQuality });
  const points = new Map<string, number>(field.map((f) => [f.id, 0]));
  const best = new Map<string, number>();
  const sim = emptySim(field.length);
  const exp = [...field].sort((a, b) => perfOf(b.stats, b.q, w) - perfOf(a.stats, a.q, w)).findIndex((f) => f.id === PLAYER_ID) + 1;
  let finishSum = 0;
  for (let e = 0; e < SERIES.kart.rounds; e++) {
    const order = field
      .map((f) => ({ id: f.id, score: perfOf(f.stats, f.q, w) + normal(r) * (0.025 + (100 - f.stats.consistency) / 2500) }))
      .sort((a, b) => b.score - a.score);
    order.forEach((o, i) => {
      points.set(o.id, (points.get(o.id) ?? 0) + ([25, 18, 15, 12, 10, 8, 6, 4, 2, 1][i] ?? 0));
      best.set(o.id, Math.min(best.get(o.id) ?? 99, i + 1));
    });
    const pos = order.findIndex((o) => o.id === PLAYER_ID) + 1;
    sim.races++;
    finishSum += pos;
    if (pos === 1) sim.wins++;
    if (pos <= 3) sim.podiums++;
    addXp(sim.raceXp, { racecraft: 25, pace: 20, consistency: 15, tyre: 10 }, racePerfMult(exp, pos));
  }
  const table = standingsOf(points, best);
  sim.position = table.indexOf(PLAYER_ID) + 1;
  sim.points = points.get(PLAYER_ID) ?? 0;
  sim.champion = sim.position === 1;
  sim.expectedAvg = exp;
  sim.actualAvg = finishSum / Math.max(1, sim.races);
  sim.teammateBeat = 0.5;
  return sim;
}

function simulateJunior(c: Career, stats: Stats, seed: number): SeasonSim {
  const contract = c.contract!;
  const series = contract.series as Exclude<SeriesId, 'f1' | 'kart'>;
  const def = SERIES[series];
  const w = def.carWeight;
  const teams = juniorTeams(series, c.year, seed);
  if (!teams.some((t) => t.name === contract.team)) teams.push({ name: contract.team, quality: contract.teamQuality, facility: contract.facility });
  const perTeam = Math.max(1, Math.round(def.fieldSize / def.teams.length));
  const r = rngFor(seed, 'junior-field', series, c.year);
  const cars: RaceCar[] = [];
  let teammateId: string | null = null;
  for (const t of teams) {
    for (let s = 0; s < perTeam; s++) {
      if (t.name === contract.team && s === 0) {
        cars.push({ id: PLAYER_ID, code: c.driver.code, teamId: t.name, stats, personality: c.driver.personality, teamQuality: contract.teamQuality, reliability: 0.9, ops: contract.teamQuality });
        continue;
      }
      const nm = fictionalName(r);
      const id = `${series}_${c.year}_${cars.length}`;
      if (t.name === contract.team && !teammateId) teammateId = id;
      cars.push({ id, code: nm.code, teamId: t.name, stats: statsAround(r, lerp(def.aiOvr[0], def.aiOvr[1], r()), 4), teamQuality: t.quality, reliability: 0.88, ops: t.quality });
    }
  }
  const sim = emptySim(cars.length);
  const exp = expectedRank(cars, w, PLAYER_ID);
  const points = new Map<string, number>(cars.map((x) => [x.id, 0]));
  const best = new Map<string, number>();
  let finishSum = 0;
  let finished = 0;
  let beat = 0;
  let duels = 0;
  def.circuits(c.year).slice(0, def.rounds).forEach((circuit, round) => {
    const q = simulateQualifying(hashSeed(seed, c.year, series, round), circuit, cars, w);
    if (q.order[0] === PLAYER_ID) sim.poles++;
    addXp(sim.raceXp, SESSION_XP.quali);
    if (series !== 'f4') addXp(sim.raceXp, SESSION_XP.practice);
    def.races.forEach((f, fi) => {
      const n = f.reverseTop ?? 0;
      const grid = n > 0 ? [...q.order.slice(0, n).reverse(), ...q.order.slice(n)] : q.order;
      const out = runRace({
        seed: hashSeed(seed, c.year, series, round, fi), circuit, cars, grid, kind: f.kind, carWeight: w,
        myCarId: PLAYER_ID, autoRadio: true, laps: f.laps, mandatoryStop: f.mandatoryStop, points: f.points,
      });
      if (out.status !== 'finished') return;
      for (const row of out.classification) {
        points.set(row.id, (points.get(row.id) ?? 0) + row.points);
        best.set(row.id, Math.min(best.get(row.id) ?? 99, row.position));
      }
      const me = out.classification.find((x) => x.id === PLAYER_ID);
      if (!me) return;
      sim.races++;
      if (me.status === 'finished') {
        finishSum += me.position;
        finished++;
        if (me.position === 1) sim.wins++;
        if (me.position <= 3) sim.podiums++;
      }
      const mate = teammateId ? out.classification.find((x) => x.id === teammateId) : undefined;
      if (mate) { duels++; if (me.position < mate.position) beat++; }
      const mult = racePerfMult(exp, me.status === 'finished' ? me.position : exp + 3);
      addXp(sim.raceXp, SESSION_XP.race, mult * (me.status === 'finished' ? 1 : 0.5));
      if (out.laps.some((l) => l.wet)) addXp(sim.raceXp, SESSION_XP.wet);
    });
  });
  const table = standingsOf(points, best);
  sim.position = table.indexOf(PLAYER_ID) + 1;
  sim.points = points.get(PLAYER_ID) ?? 0;
  sim.champion = sim.position === 1;
  sim.expectedAvg = exp;
  sim.actualAvg = finished ? finishSum / finished : exp + 5;
  sim.teammateBeat = duels ? beat / duels : 0.5;
  return sim;
}

function newRookie(rng: Rng, year: number, idx: number, used: Set<number>): F1Driver {
  const nm = fictionalName(rng);
  let number = int(rng, 2, 99);
  while (used.has(number)) number = number >= 99 ? 2 : number + 1;
  used.add(number);
  return {
    id: `gen_${year}_${idx}`, code: nm.code, name: nm.name, nationality: nm.nationality, birthYear: year - int(rng, 19, 22),
    teamId: null, number, stats: statsAround(rng, 78 + rng() * 6, 3), real: false, contractEnd: year, retired: false,
    potential: Math.round(84 + rng() * 11),
  };
}

function f1Cars(c: Career, stats: Stats): RaceCar[] {
  const cars: RaceCar[] = [];
  const playerTeam = c.contract?.series === 'f1' && c.contract.seat === 'race' ? c.contract.teamId : undefined;
  for (const t of c.world.teams.teams) {
    const ds = c.world.drivers.filter((d) => d.teamId === t.id && !d.retired);
    const seats = playerTeam === t.id ? 1 : 2;
    if (ds.length < seats) throw new Error(`team ${t.id} has ${ds.length} drivers, needs ${seats}`);
    for (const d of ds.slice(0, seats)) {
      cars.push({ id: d.id, code: d.code, teamId: t.id, stats: d.stats, teamQuality: t.quality, reliability: t.reliability, ops: t.ops });
    }
    if (playerTeam === t.id) {
      cars.push({ id: PLAYER_ID, code: c.driver.code, teamId: t.id, stats, personality: c.driver.personality, teamQuality: t.quality, reliability: t.reliability, ops: t.ops });
    }
  }
  return cars;
}

/** F1 결과 규칙: 우승은 4팀만, 신생팀은 데뷔 1년 차 포인트 없음·2~3년 차 포디움 없음 */
export const F1_UPSET_CHANCE = 0.7;
/** 메이저 4팀 차 성능 하한과 나머지 팀 상한(SPEC §5.1 v0.13) */
export const MAJOR_FLOOR = 0.915;
export const OTHERS_CAP = 0.885;

export function f1Rules(c: Career): ResultRules {
  const bestPosition: Record<string, number> = {};
  for (const t of c.world.teams.teams) {
    const age = c.year - t.founded;
    if (age <= 0) bestPosition[t.id] = 11;
    else if (age <= 2) bestPosition[t.id] = 4;
  }
  const present = c.world.teams.teams.map((t) => t.id);
  // 이변 인정 확률: 4팀이 아닌 차가 1위로 들어와도 대부분 4팀에 우승을 넘기고, 가끔만 인정한다(시즌 우승의 5% 미만 목표)
  return { winnerTeams: F1_WINNER_TEAMS.filter((id) => present.includes(id)), bestPosition, upsetChance: F1_UPSET_CHANCE };
}

function simulateF1(c: Career, stats: Stats, seed: number): SeasonSim {
  const rules = f1Rules(c);
  const racing = c.contract?.series === 'f1' && c.contract.seat === 'race';
  const cars = f1Cars(c, stats);
  const w = CAR_WEIGHT.f1;
  const sim = emptySim(cars.length);
  const points = new Map<string, number>(cars.map((x) => [x.id, 0]));
  const best = new Map<string, number>();
  const exp = racing ? expectedRank(cars, w, PLAYER_ID) : 0;
  const mateId = racing ? cars.find((x) => x.teamId === c.contract!.teamId && x.id !== PLAYER_ID)?.id : undefined;
  let finishSum = 0;
  let finished = 0;
  let beat = 0;
  let duels = 0;
  CALENDAR_2026.forEach((circuit, round) => {
    // 서킷 유형·시즌 중 개발에 따른 팀 폼
    const roundCars = cars.map((car) => ({ ...car, teamQuality: car.teamQuality + teamForm(c.seed, c.year, car.teamId, circuit, round, CALENDAR_2026.length) }));
    const weekend: Array<{ kind: 'race' | 'sprint'; session: string }> = circuit.sprint
      ? [{ kind: 'sprint', session: 'SQ' }, { kind: 'race', session: 'Q' }]
      : [{ kind: 'race', session: 'Q' }];
    addXp(sim.raceXp, SESSION_XP.practice, (circuit.sprint ? 1 : 3) * (racing ? 1 : 0.4));
    for (const wk of weekend) {
      const q = simulateQualifying(hashSeed(seed, c.year, 'f1', round, wk.session), circuit, roundCars, w, wk.session);
      if (racing) {
        addXp(sim.raceXp, SESSION_XP.quali);
        if (wk.kind === 'race' && q.order[0] === PLAYER_ID) sim.poles++;
      }
      const out = runRace({ seed: hashSeed(seed, c.year, 'f1', round, wk.kind), circuit, cars: roundCars, grid: q.order, kind: wk.kind, carWeight: w, rules, myCarId: racing ? PLAYER_ID : undefined, autoRadio: true });
      if (out.status !== 'finished') continue;
      for (const row of out.classification) {
        points.set(row.id, (points.get(row.id) ?? 0) + row.points);
        best.set(row.id, Math.min(best.get(row.id) ?? 99, row.position));
      }
      if (!racing) continue;
      const me = out.classification.find((x) => x.id === PLAYER_ID)!;
      if (wk.kind === 'race') {
        sim.races++;
        if (me.status === 'finished') {
          finishSum += me.position;
          finished++;
          if (me.position === 1) sim.wins++;
          if (me.position <= 3) sim.podiums++;
        }
        const mate = mateId ? out.classification.find((x) => x.id === mateId) : undefined;
        if (mate) { duels++; if (me.position < mate.position) beat++; }
      }
      const mult = racePerfMult(exp, me.status === 'finished' ? me.position : exp + 3);
      addXp(sim.raceXp, SESSION_XP.race, mult * (me.status === 'finished' ? 1 : 0.5));
      if (out.laps.some((l) => l.wet)) addXp(sim.raceXp, SESSION_XP.wet);
    }
  });
  const table = standingsOf(points, best);
  const champId = table[0];
  if (champId) {
    const name = champId === PLAYER_ID ? c.driver.name : c.world.drivers.find((d) => d.id === champId)?.name ?? champId;
    c.world.champions.push({ year: c.year, driverId: champId, name, teamId: cars.find((x) => x.id === champId)?.teamId ?? '' });
  }
  // 컨스트럭터 순위 → 팀 진입·철수 판정용
  const teamPts = new Map<string, number>();
  for (const car of cars) teamPts.set(car.teamId, (teamPts.get(car.teamId) ?? 0) + (points.get(car.id) ?? 0));
  const teamOrder = [...teamPts.keys()].sort((a, b) => (teamPts.get(b) ?? 0) - (teamPts.get(a) ?? 0));
  for (const t of c.world.teams.teams) t.standings.push(teamOrder.indexOf(t.id) + 1);

  if (racing) {
    sim.position = table.indexOf(PLAYER_ID) + 1;
    sim.points = points.get(PLAYER_ID) ?? 0;
    sim.champion = sim.position === 1;
    sim.expectedAvg = exp;
    sim.actualAvg = finished ? finishSum / finished : exp + 5;
    sim.teammateBeat = duels ? beat / duels : 0.5;
    sim.prize = sim.points * 40_000;
  }
  return sim;
}

/** 플레이어가 F1에 없을 때 F1 세계를 빠르게 한 시즌 돌린다(순위·챔피언만) */
function quickF1World(c: Career, seed: number): void {
  const rules = f1Rules(c);
  // 레이스 24개를 간단한 모델로 돌린다: 팀 폼 + 드라이버 실력 + 레이스 변수(DNF 8%)
  const r = rngFor(seed, 'quick-f1', c.year);
  const entries = c.world.drivers
    .filter((d) => d.teamId && !d.retired)
    .map((d) => ({ d, teamId: d.teamId as string, q: c.world.teams.teams.find((t) => t.id === d.teamId)?.quality ?? 0.87 }));
  const pts = new Map<string, number>();
  const teamPts = new Map<string, number>();
  const w = CAR_WEIGHT.f1;
  CALENDAR_2026.forEach((circuit, round) => {
    const raw = entries
      .map((e) => ({ e, s: w * (e.q + teamForm(c.seed, c.year, e.teamId, circuit, round, CALENDAR_2026.length)) + (1 - w) * (ovr(e.d.stats) / 100) + normal(r) * 0.008, dnf: r() < 0.08 }))
      .filter((x) => !x.dnf)
      .sort((a, b) => b.s - a.s);
    const order = enforceOrder(raw, (x) => x.e.teamId, rules, r());
    order.forEach((x, i) => {
      const p = POINTS_RACE[i] ?? 0;
      pts.set(x.e.d.id, (pts.get(x.e.d.id) ?? 0) + p);
      teamPts.set(x.e.teamId, (teamPts.get(x.e.teamId) ?? 0) + p);
    });
  });
  const teamOrder = c.world.teams.teams.map((t) => t.id).sort((a, b) => (teamPts.get(b) ?? 0) - (teamPts.get(a) ?? 0));
  for (const t of c.world.teams.teams) t.standings.push(teamOrder.indexOf(t.id) + 1);
  const champ = entries.map((e) => e.d).sort((a, b) => (pts.get(b.id) ?? 0) - (pts.get(a.id) ?? 0))[0];
  if (champ) c.world.champions.push({ year: c.year, driverId: champ.id, name: champ.name, teamId: champ.teamId ?? '' });
}

export function superLicencePoints(c: Career, uptoYear = c.year): number {
  return c.history.filter((h) => h.year > uptoYear - 3 && h.year <= uptoYear).reduce((a, h) => a + h.superLicence, 0);
}

/** 훈련 계획을 받아 한 시즌을 진행한다. 입력 career는 바꾸지 않는다 */
export function runSeason(input: Career, plan: TrainingId[]): { career: Career; record: SeasonRecord } {
  if (input.retired) throw new Error('career is retired');
  const c: Career = structuredClone(input);
  const seed = hashSeed(c.seed, 'season', c.year);
  const contract = c.contract;
  const series: SeriesId = contract?.series ?? (c.history[c.history.length - 1]?.series ?? 'kart');
  const seat = contract?.seat ?? 'none';
  const slots = seat === 'race' ? TRAINING_SLOTS : TRAINING_SLOTS_RESERVE;
  const cleanPlan = plan.slice(0, slots);
  c.choiceLog.push({ year: c.year, kind: 'training', plan: cleanPlan });

  const notes: string[] = [];
  let expenses = 0;
  let income = 0;
  const wealth = WEALTH_TIERS[c.driver.wealthTier];

  // 시즌 시작: 시트 비용(아카데미가 하부 리그 비용을 대신 낸다), 가족 지원
  if (contract && contract.seatCost > 0) {
    const byAcademy = !!c.academy && contract.series !== 'f1';
    const covered = byAcademy || contract.management ? contract.seatCost : 0;
    expenses += contract.seatCost - covered;
    if (covered) notes.push(byAcademy ? `${c.academy}가 시트 비용을 지원했다` : '매니지먼트가 시트 비용을 지원했다');
  }
  if (c.age < 21 && c.f1Debut === null) income += wealth.familySupport;

  // 훈련(돈이 모자라면 유료 프로그램을 무료 롱런으로 바꾼다)
  const freeSim = !!c.academy || series === 'f1' || (contract?.facility ?? 0) >= 0.8;
  let training = trainingOutcome(cleanPlan, freeSim);
  if (c.funds + income - expenses - training.cost < 0) {
    const downgraded = cleanPlan.map((id) => (TRAINING[id].cost > 0 && !(id === 'sim' && freeSim) ? 'longrun' : id));
    training = trainingOutcome(downgraded, freeSim);
    notes.push('자금이 부족해 유료 훈련을 줄였다');
  }
  expenses += training.cost;

  // 압박이 압박 내성보다 높으면 이번 시즌 Consistency −3
  const seasonStats = { ...c.driver.stats };
  if (c.media.pressure > c.driver.hidden.pressureResist) {
    seasonStats.consistency = Math.max(20, seasonStats.consistency - 3);
    notes.push('압박 속에 실수가 늘었다');
  }
  if (training.overtrained) {
    seasonStats.consistency = Math.max(20, seasonStats.consistency - 2);
    notes.push('휴식 없는 훈련으로 컨디션이 떨어졌다');
  }

  const ovrStart = ovr(c.driver.stats);
  let sim: SeasonSim;
  if (!contract) {
    sim = emptySim(0);
    if (c.world.teams.teams.length) quickF1World(c, seed);
  } else if (series === 'kart') {
    sim = simulateKart(c, seasonStats, seed);
    quickF1World(c, seed);
  } else if (series === 'f1') {
    sim = simulateF1(c, seasonStats, seed);
  } else {
    sim = simulateJunior(c, seasonStats, seed);
    quickF1World(c, seed);
  }
  if (!contract || seat === 'none') addXp(sim.raceXp, { racecraft: 60, pace: 40, consistency: 40 }, 0.15);

  // XP 반영: 훈련·경기·팀 환경으로 나눠 기록
  const eff = ageCurve(c.age, c.driver.hidden.growthType) * (1 + wealth.growthBonus);
  const envMult = 0.8 + 0.5 * (contract?.facility ?? 0.5);
  const focusMult = (k: StatKey) => (c.driver.focus.includes(k) ? 1.2 : 1);
  const trainGain: Partial<Stats> = {};
  const raceGain: Partial<Stats> = {};
  for (const k of STAT_KEYS) {
    trainGain[k] = (training.xp[k] ?? 0) * eff * envMult * focusMult(k);
    raceGain[k] = (sim.raceXp[k] ?? 0) * eff * focusMult(k);
  }
  const total: Partial<Stats> = {};
  addXp(total, trainGain);
  addXp(total, raceGain);
  const before = { ...c.driver.stats };
  applyXp(c.driver.stats, c.driver.xp, total, c.driver.hidden.potential);
  const grownOvr = ovr(c.driver.stats) - ovr(before);
  const tSum = STAT_KEYS.reduce((a, k) => a + (trainGain[k] ?? 0), 0);
  const rSum = STAT_KEYS.reduce((a, k) => a + (raceGain[k] ?? 0), 0);
  const envShare = (envMult - 1) / envMult;
  const trainShare = tSum / Math.max(1, tSum + rSum);
  const aging = applyAging(c.driver.stats, c.age, c.driver.hidden, rngFor(seed, 'aging'));
  const agingOvr = ovr(c.driver.stats) - ovr(before) - grownOvr;

  // 돈
  if (contract?.salary) {
    income += contract.salary;
    const m = c.management;
    if (m && m.startYear !== null && c.year < m.startYear + m.years && contract.series === 'f1') {
      const cut = Math.round(contract.salary * m.share);
      expenses += cut;
      notes.push(`매니지먼트 몫 €${(cut / 1e6).toFixed(2)}M`);
    }
  }
  income += sim.prize;
  const pct = sim.position ? 1 - (sim.position - 1) / Math.max(1, sim.fieldSize) : 0;
  const sponsorBase = series === 'f1' ? 1_500_000 : SERIES[series].sponsorBase;
  const resultFactor = sim.champion ? 3 : pct >= 0.9 ? 2 : pct >= 0.75 ? 1.2 : pct >= 0.5 ? 0.6 : 0.25;
  const sponsor = Math.round((seat === 'race' ? sponsorBase * resultFactor : sponsorBase * 0.2) * (1 + wealth.sponsorBonus) + Math.min(c.media.followers, 5_000_000) * 0.2);
  income += sponsor;
  expenses += c.age >= 18 ? (series === 'f1' ? 300_000 : 25_000) : 0;
  c.funds += income - expenses;
  c.totals.earnings += income;

  // 언론·팬
  const perfDelta = sim.races ? sim.expectedAvg - sim.actualAvg : 0;
  const mediaOut = updateMediaSeason(c.media, {
    series, seriesLabel: seriesLabel(series), name: c.driver.name, position: sim.position, fieldSize: sim.fieldSize || 1,
    wins: sim.wins, podiums: sim.podiums, champion: sim.champion, perfDelta, personality: c.driver.personality,
    wealthTier: c.driver.wealthTier, raced: seat === 'race', pressureRelief: training.pressureRelief,
  });
  c.media = mediaOut.media;

  // 슈퍼 라이선스, 기록
  const sl = seat === 'race' && series !== 'f1' && series !== 'kart' && sim.position ? SERIES[series].superLicence[sim.position - 1] ?? 0 : 0;
  if (sim.champion && series !== 'f1') c.totals.juniorTitles.push(`${c.year} ${seriesLabel(series)}`);
  if (series === 'f1' && seat === 'race') {
    c.totals.f1Starts += sim.races;
    c.totals.f1Wins += sim.wins;
    c.totals.f1Podiums += sim.podiums;
    c.totals.f1Poles += sim.poles;
    if (sim.champion) c.totals.f1Titles += 1;
  }
  if (series === 'kart') c.kartSeasons += 1;
  c.totals.bestOvr = Math.max(c.totals.bestOvr, Math.round(ovr(c.driver.stats)));
  if (Object.keys(aging).length) notes.push('나이가 들며 반응 속도가 떨어지기 시작했다');

  const record: SeasonRecord = {
    year: c.year, age: c.age, series, team: contract?.team ?? null, seat, races: sim.races, wins: sim.wins,
    podiums: sim.podiums, poles: sim.poles, points: sim.points, position: sim.position, fieldSize: sim.fieldSize,
    champion: sim.champion, ovrStart: Math.round(ovrStart * 10) / 10, ovrEnd: Math.round(ovr(c.driver.stats) * 10) / 10,
    growth: {
      training: Math.round(grownOvr * trainShare * (1 - envShare) * 10) / 10,
      racing: Math.round(grownOvr * (1 - trainShare) * 10) / 10,
      environment: Math.round(grownOvr * trainShare * envShare * 10) / 10,
      aging: Math.round(agingOvr * 10) / 10,
    },
    superLicence: sl, income, expenses, fundsEnd: c.funds, expectedAvg: Math.round(sim.expectedAvg * 10) / 10,
    actualAvg: Math.round(sim.actualAvg * 10) / 10, teammateBeat: Math.round(sim.teammateBeat * 100) / 100,
    headline: mediaOut.headline, notes, statsEnd: { ...c.driver.stats },
  };
  record.feed = seasonFeed(c, record);
  c.history.push(record);
  // 이번 오프시즌 전환점 이벤트(0~2개). 오프시즌 제안을 받기 전에 처리한다
  c.pendingEvents = pickEvents(c, record);
  if (seat === 'race') c.noSeatSeasons = 0;
  else c.noSeatSeasons += 1;
  return { career: c, record };
}

// ── 오프시즌 ────────────────────────────────────────────────────────
interface SeatPlan {
  /** 이번 오프시즌에 은퇴하는 AI 드라이버 */
  retiring: string[];
  /** 계약 만료 후 재계약하지 않는 AI 드라이버(자리가 빈다) */
  released: string[];
  /** 팀별 빈자리 수 */
  open: Map<string, number>;
}

/**
 * 팀이 드라이버에게 요구하는 OVR. 고정값이 아니라 현재 그리드 분포를 따른다:
 * 차 성능 1위 팀은 그리드 OVR 최상위권, 하위 팀은 20위 근처 수준을 원한다.
 */
function teamRequirement(c: Career, teamId: string): number {
  const grid = c.world.drivers.filter((d) => d.teamId && !d.retired).map((d) => ovr(d.stats)).sort((a, b) => b - a);
  const teams = [...c.world.teams.teams].sort((a, b) => b.quality - a.quality);
  const idx = Math.max(0, teams.findIndex((t) => t.id === teamId));
  // 우승 가능 4팀(차 성능 상위)은 그리드 최상위 2~3명 수준을 요구한다
  const at = Math.min(grid.length - 1, Math.round(idx < 4 ? idx * 0.8 + 1 : idx * 1.8 + 1));
  return (grid[at] ?? 80) - 0.5;
}

function seatPlan(c: Career): SeatPlan {
  const r = rngFor(c.seed, 'seat-plan', c.year);
  const nextYear = c.year + 1;
  const retiring: string[] = [];
  const released: string[] = [];
  const open = new Map<string, number>();
  for (const d of c.world.drivers) {
    if (d.retired || !d.teamId) continue;
    const team = c.world.teams.teams.find((t) => t.id === d.teamId);
    if (!team) continue;
    const age = nextYear - d.birthYear;
    const o = ovr(d.stats);
    const retire = age >= 42 || (age >= 38 && r() < 0.25 * (age - 37)) || (age >= 31 && o < 76 && d.contractEnd <= c.year);
    if (retire) {
      retiring.push(d.id);
      open.set(d.teamId, (open.get(d.teamId) ?? 0) + 1);
      continue;
    }
    if (d.contractEnd <= c.year) {
      const keep = o >= teamRequirement(c, team.id) - 3 + normal(r) * 1.5;
      if (!keep) {
        released.push(d.id);
        open.set(d.teamId, (open.get(d.teamId) ?? 0) + 1);
      }
    }
  }
  // 플레이어 F1 계약이 끝나면 그 자리도 빈다
  if (c.contract?.series === 'f1' && c.contract.seat === 'race' && c.contract.teamId && c.contract.endYear <= c.year) {
    open.set(c.contract.teamId, (open.get(c.contract.teamId) ?? 0) + 1);
  }
  return { retiring, released, open };
}

function maxYears(age: number): number {
  return age >= 39 ? 1 : age >= 36 ? 2 : 3;
}

/** 오프시즌 제안 목록. 같은 career면 항상 같은 목록을 돌려준다 */
export function getOffseason(c: Career): Offseason {
  const last = c.history[c.history.length - 1];
  if (!last || last.year !== c.year) throw new Error('run the season before the offseason');
  const r = rngFor(c.seed, 'offers', c.year);
  const nextYear = c.year + 1;
  const nextAge = c.age + 1;
  const wealth = WEALTH_TIERS[c.driver.wealthTier];
  const notes: string[] = [];
  const offers: Offer[] = [];
  const pct = last.position ? 1 - (last.position - 1) / Math.max(1, last.fieldSize) : 0;
  const perf = last.races ? clamp(last.expectedAvg - last.actualAvg, -10, 10) / 10 : -0.3;
  const scout = clamp(pct * 0.6 + perf * 0.2 + (c.media.reputation / 100) * 0.2 + (c.flags?.scoutBonus ?? 0), 0, 1);
  const budget = c.funds + (nextAge < 21 && c.f1Debut === null ? wealth.familySupport : 0);
  const academyCovers = (s: SeriesId) => !!c.academy && s !== 'f1';
  const affordable = (s: SeriesId, cost: number) => academyCovers(s) || cost <= budget;

  const current = last.series;
  // 계약이 남아 있으면 "계약 유지"
  if (c.contract && c.contract.endYear > c.year) {
    offers.push({ ...c.contract, id: 'stay', years: c.contract.endYear - c.year, affordable: affordable(c.contract.series, c.contract.seatCost), note: '현 계약 유지' });
  }

  // 하부 리그 제안
  const juniorOffers = (s: Exclude<SeriesId, 'f1'>, strength: number, label: string) => {
    if (nextAge < SERIES[s].minAge) return;
    const teams = juniorTeams(s, nextYear, c.seed);
    const n = teams.length;
    const picked: number[] = [];
    teams.forEach((_t, i) => {
      if (picked.length >= 3) return;
      const minScout = 0.85 - (i / (n - 1)) * 0.75;
      if (strength + normal(r) * 0.08 >= minScout) picked.push(i);
    });
    // 하위 2팀은 언제나 자리를 내준다(페이 시트, 돈이 없으면 매니지먼트 후원)
    for (const i of [n - 2, n - 1]) if (i >= 0 && !picked.includes(i)) picked.push(i);
    for (const i of picked) {
      const t = teams[i]!;
      // 재능 할인: 스카우트 점수가 높으면 팀이 시트 비용을 깎아 준다(최대 80%)
      const discount = clamp((strength - 0.5) * 1.6, 0, 0.8);
      const cost = Math.round(lerp(SERIES[s].seatCost[1], SERIES[s].seatCost[0], i / (n - 1)) * (1 - discount));
      const own = affordable(s, cost);
      const mgmt = !own && nextAge <= 22;
      offers.push({
        id: `${s}:${t.name}`, series: s, team: t.name, seat: 'race', endYear: nextYear, salary: 0, seatCost: cost,
        teamQuality: t.quality, facility: t.facility, years: 1, affordable: own || mgmt, management: mgmt || undefined,
        note: mgmt ? `${label} · ${SERIES[s].label} · 매니지먼트 후원(F1 연봉 15%, 8년)` : `${label} · ${SERIES[s].label}`,
      });
    }
  };

  const next = nextSeries(current);
  if (current === 'kart') {
    if (nextAge >= SERIES.f4.minAge) juniorOffers('f4', scout - 0.1, '승격');
    else juniorOffers('kart', scout + 0.15, '인터내셔널 카트');
  } else if (current !== 'f1' && next) {
    // F2·F3 챔피언은 규정상 같은 시리즈에 다시 나갈 수 없다
    const championBarred = last.champion && (current === 'f2' || current === 'f3');
    if (championBarred) notes.push(`${seriesLabel(current)} 챔피언은 같은 시리즈에 다시 출전할 수 없다`);
    else juniorOffers(current as Exclude<SeriesId, 'f1'>, scout + 0.1, '잔류');
    if (next !== 'f1') juniorOffers(next as Exclude<SeriesId, 'f1'>, scout - 0.12, '승격');
    const skip = next !== 'f1' ? nextSeries(next) : null;
    if (last.champion && skip && skip !== 'f1') juniorOffers(skip as Exclude<SeriesId, 'f1'>, scout - 0.25, '월반');
  } else if (current === 'f1' && last.seat !== 'race' && nextAge <= 26 && !c.totals.juniorTitles.some((t) => t.endsWith('FIA F2'))) {
    // 리저브·무소속에서 F2로 돌아가 다시 레이스 시트를 노릴 수 있다
    juniorOffers('f2', scout + 0.1, 'F2 복귀');
  }

  // F1 제안
  const sl = superLicencePoints(c);
  const inF1Race = c.contract?.series === 'f1' && c.contract.seat === 'race';
  const f1Eligible = inF1Race || c.f1Debut !== null || (sl >= SUPER_LICENCE_REQUIRED && nextAge >= SUPER_LICENCE_MIN_AGE);
  if (current === 'f2' || current === 'f3' || current === 'f1') {
    if (!f1Eligible) notes.push(`슈퍼 라이선스 포인트 부족(${sl}/${SUPER_LICENCE_REQUIRED})`);
    const plan = seatPlan(c);
    const academyTeams = ACADEMIES.find((a) => a.name === c.academy)?.teamIds ?? [];
    const f1Perf = current === 'f1' && last.seat === 'race' ? clamp(last.expectedAvg - last.actualAvg, -6, 6) * 0.3 + (last.teammateBeat - 0.5) * 3 : perf * 2 + (pct - 0.7) * 5;
    // F2 상위권 졸업생 보너스, 36세 이후 나이 감점(전성기는 37세까지)
    const graduate = current === 'f2' && last.seat === 'race' ? (last.champion ? 4 : (last.position ?? 99) <= 3 ? 2 : 0) : 0;
    const agePenalty = Math.max(0, nextAge - 36) * 1.0;
    const rating = ovr(c.driver.stats) + f1Perf + c.media.reputation / 40 + graduate - agePenalty;
    const sortedTeams = [...c.world.teams.teams].sort((a, b) => b.quality - a.quality);
    for (const t of sortedTeams) {
      const openSeats = plan.open.get(t.id) ?? 0;
      // 상위 4팀은 F1 경험이 없는 신인에게 더 높은 기준을 둔다(아카데미 소속이면 완화)
      const top4 = sortedTeams.indexOf(t) < 4;
      const rookiePenalty = c.f1Debut === null && top4 && !academyTeams.includes(t.id) ? 4 : 0;
      // 하위 6팀은 신인에게 기준을 낮춘다(신인은 보통 하위 팀에서 시작)
      const rookieRelax = c.f1Debut === null && sortedTeams.indexOf(t) >= sortedTeams.length - 6 ? 3 : 0;
      const req = teamRequirement(c, t.id) + rookiePenalty - rookieRelax - (academyTeams.includes(t.id) ? 2 : 0);
      const isMyTeam = inF1Race && c.contract?.teamId === t.id;
      const years = Math.max(1, Math.min(maxYears(nextAge), int(r, 1, 3)));
      if (f1Eligible && openSeats > 0 && rating + normal(r) * 1.5 >= req - (isMyTeam ? 3 : 0)) {
        const salary = Math.round(clamp(1_000_000 + (rating - 76) * 1_400_000, 800_000, 45_000_000) * (0.6 + t.budget * 0.6));
        offers.push({
          id: `f1:${t.id}`, series: 'f1', team: t.name, teamId: t.id, seat: 'race', endYear: c.year + years, salary, seatCost: 0,
          teamQuality: t.quality, facility: t.budget, years, affordable: true, note: isMyTeam ? '재계약' : 'F1 레이스 시트',
        });
        continue;
      }
      const bottom3 = sortedTeams.indexOf(t) >= sortedTeams.length - 3;
      if (f1Eligible && openSeats > 0 && bottom3 && !isMyTeam && (c.driver.wealthTier >= 4 || c.funds >= 8_000_000) && rating >= req - 8) {
        const cost = Math.round(5_000_000 + (t.quality - 0.75) * 50_000_000);
        offers.push({
          id: `f1pay:${t.id}`, series: 'f1', team: t.name, teamId: t.id, seat: 'race', endYear: nextYear, salary: 0, seatCost: cost,
          teamQuality: t.quality, facility: t.budget, years: 1, affordable: cost <= c.funds, note: '페이 시트(스폰서 자금으로 시트 확보)',
        });
        continue;
      }
      const reserveCandidate = current === 'f1' || (current === 'f2' && (pct >= 0.6 || !!c.academy));
      if (reserveCandidate && sortedTeams.indexOf(t) < 5 && !isMyTeam && rating >= req - 7 && nextAge <= 28 && r() < 0.5) {
        offers.push({
          id: `f1res:${t.id}`, series: 'f1', team: t.name, teamId: t.id, seat: 'reserve', endYear: nextYear, salary: 300_000, seatCost: 0,
          teamQuality: t.quality, facility: t.budget, years: 1, affordable: true, note: '리저브·테스트 드라이버',
        });
      }
    }
    // 신인 보장: F2 상위 5위(또는 리저브)이고 슈퍼 라이선스를 채웠는데 레이스 제안이 없으면,
    // 하위 4팀 중 한 팀이 가장 약한 드라이버를 내보내고 자리를 내준다
    const hasRaceOffer = offers.some((o) => o.series === 'f1' && o.seat === 'race' && o.id !== 'stay');
    const rookieGuarantee =
      f1Eligible && !inF1Race && nextAge <= 25 &&
      ((current === 'f2' && last.seat === 'race' && (last.position ?? 99) <= 5) || (current === 'f1' && last.seat === 'reserve'));
    if (rookieGuarantee && !hasRaceOffer) {
      const bottom = sortedTeams.slice(-4);
      const target = bottom
        .flatMap((t) => c.world.drivers.filter((d) => d.teamId === t.id && !d.retired && !plan.retiring.includes(d.id) && !plan.released.includes(d.id)).map((d) => ({ t, d })))
        .sort((a, b) => ovr(a.d.stats) - ovr(b.d.stats))[0];
      if (target) {
        const years = Math.max(1, Math.min(maxYears(nextAge), 2));
        offers.push({
          id: `f1:${target.t.id}`, series: 'f1', team: target.t.name, teamId: target.t.id, seat: 'race', endYear: c.year + years,
          salary: Math.round(900_000 + target.t.budget * 600_000), seatCost: 0, teamQuality: target.t.quality, facility: target.t.budget,
          years, affordable: true, displaceDriverId: target.d.id, note: `F1 레이스 시트 · ${target.t.name}가 신인을 위해 ${target.d.name}의 자리를 비웠다`,
        });
      }
    }
  }

  // 아카데미
  let academyOffer: string | null = null;
  if (!c.academy && (current === 'kart' || current === 'f4' || current === 'freca' || current === 'f3') && pct >= 0.8) {
    if (r() < 0.5 * (1 + wealth.academyInterest) * pct) academyOffer = pick(r, ACADEMIES).name;
  }
  if (c.academy && (current === 'f3' || current === 'f2') && (last.position ?? 99) > 10) {
    notes.push(`${c.academy}에서 방출됐다`);
  }

  // 방출: 성격이 나쁠수록 계약이 남아 있어도 팀이 내보낼 수 있다(SPEC §3.4 v0.11)
  let released = false;
  const pdef = PERSONALITIES[c.driver.personality];
  if (c.contract && c.contract.seat === 'race' && last.seat === 'race') {
    const conflict = (last.teammateBeat < 0.4 ? 1.5 : 1) * (perf < 0 ? 1.3 : 1);
    if (rngFor(c.seed, 'release', c.year)() < Math.max(0, pdef.releaseRisk * conflict + (c.flags?.releaseRisk ?? 0))) {
      released = true;
      const team = c.contract.team;
      for (let i = offers.length - 1; i >= 0; i--) if (offers[i]!.team === team) offers.splice(i, 1);
      notes.push(`${team}, ${c.driver.name}에게 방출 통보(${pdef.releaseReason})`);
    }
  }

  return { year: c.year, offers, released, academyOffer, notes };
}

function fillOpenSeats(c: Career, r: Rng, nextYear: number): void {
  const used = new Set(c.world.drivers.filter((d) => !d.retired && d.teamId).map((d) => d.number));
  let rookieIdx = 0;
  for (const t of c.world.teams.teams) {
    const playerHere = c.contract?.series === 'f1' && c.contract.seat === 'race' && c.contract.teamId === t.id ? 1 : 0;
    let have = c.world.drivers.filter((d) => d.teamId === t.id && !d.retired).length + playerHere;
    while (have < 2) {
      const free = c.world.drivers
        .filter((d) => !d.retired && !d.teamId && nextYear - d.birthYear < 36)
        .sort((a, b) => ovr(b.stats) - ovr(a.stats))[0];
      const pickFree = free && ovr(free.stats) >= teamRequirement(c, t.id) - 4;
      const d = pickFree ? free : newRookie(r, nextYear, rookieIdx++, used);
      if (!pickFree) c.world.drivers.push(d);
      d.teamId = t.id;
      d.contractEnd = nextYear + int(r, 0, 2);
      have++;
    }
  }
}

function ageWorldDrivers(c: Career, r: Rng, nextYear: number): void {
  for (const d of c.world.drivers) {
    if (d.retired) continue;
    const age = nextYear - d.birthYear;
    if (age <= 27 && ovr(d.stats) < d.potential) {
      // 잠재력까지 해마다 OVR +1~1.5 정도
      for (const k of STAT_KEYS) d.stats[k] = Math.min(97, d.stats[k] + int(r, 0, 2));
    } else if (age >= 38) {
      // AI도 플레이어와 같다: 37세까지 유지, 38세부터 하락
      for (const k of STAT_KEYS) {
        const fast = k === 'pace' || k === 'wet';
        d.stats[k] = Math.max(40, d.stats[k] - int(r, 0, Math.min(2, age - 37) + (fast ? 1 : 0)));
      }
    }
  }
  // 5년마다 규정 변경: 팀 판도가 크게 흔들린다
  const regReset = nextYear % 5 === 1;
  for (const t of c.world.teams.teams) {
    const shake = regReset ? normal(r) * 0.03 : normal(r) * 0.012;
    // 평균으로 끌어당기는 힘을 키워 한 팀이 오래 독주하지 못하게 한다
    const q = t.quality + shake + (t.budget - 0.8) * 0.006 - (t.quality - 0.89) * 0.2;
    // 신생팀 추격 개발: 2~3년 차 시즌(teamAge 1~2)에만 +0.004.
    // 4년 차(teamAge 3)부터는 보너스 없이 다른 중위권 팀과 똑같이 평균 회귀·상한 규칙만 받는다
    const teamAge = nextYear - t.founded;
    // 데뷔하는 해에는 출발 조건(NEW_TEAM_START) 그대로 둔다: 모든 신생팀이 캐딜락과 같은 성능으로 첫 시즌을 치른다
    if (teamAge <= 0) continue;
    const catchUp = teamAge >= 1 && teamAge <= 2 ? 0.004 : 0;
    // 우승 가능 4팀은 늘 선두권(0.90 이상), 나머지는 0.915 이하: 포디움은 가능하지만 시즌 챔피언 경쟁은 4팀 몫
    const top = (F1_WINNER_TEAMS as readonly string[]).includes(t.id);
    // 메이저 4팀(0.915 이상)과 나머지(0.885 이하)가 겹치지 않게: 메이저 팀 레이스 시트면 챔피언십 8위 안이 거의 보장된다
    t.quality = top ? clamp(q, MAJOR_FLOOR, 0.95) : clamp(q + catchUp, 0.83, OTHERS_CAP);
  }
}

/** 오프시즌 선택을 반영하고 다음 해로 넘어간다 */
export function applyOffseason(input: Career, choice: OffseasonChoice): Career {
  if (input.pendingEvents?.length) throw new Error(`resolve events first: ${input.pendingEvents.join(', ')}`);
  const c: Career = structuredClone(input);
  const off = getOffseason(input);
  c.choiceLog.push({ year: c.year, kind: 'offseason', choice });
  const nextYear = c.year + 1;
  const r = rngFor(c.seed, 'offseason-apply', c.year);

  if (choice.retire) {
    c.retired = true;
    if (c.contract?.series === 'f1' && c.contract.seat === 'race') c.contract = null;
    return c;
  }

  if (choice.joinAcademy && off.academyOffer) c.academy = off.academyOffer;
  if (off.released) {
    c.totals.releases += 1;
    c.media.pressure = Math.min(100, c.media.pressure + 15);
    c.media.reputation = Math.max(0, c.media.reputation - 5);
  }
  if (off.notes.some((n) => n.includes('방출'))) c.academy = null;

  // 세계: 은퇴·방출 확정
  const plan = seatPlan(input);
  for (const d of c.world.drivers) {
    if (plan.retiring.includes(d.id)) { d.retired = true; d.teamId = null; }
    if (plan.released.includes(d.id)) d.teamId = null;
  }

  const offer = choice.offerId ? off.offers.find((o) => o.id === choice.offerId) : undefined;
  if (choice.offerId && !offer) throw new Error(`unknown offer ${choice.offerId}`);
  if (offer && !offer.affordable) throw new Error(`offer ${offer.id} is not affordable`);
  if (offer) {
    const { id: _id, years: _y, affordable: _a, note: _n, displaceDriverId, ...contract } = offer;
    c.contract = contract;
    if (offer.management && !c.management) c.management = { share: 0.15, years: 8, startYear: null };
    if (displaceDriverId) {
      const d = c.world.drivers.find((x) => x.id === displaceDriverId);
      if (d) d.teamId = null;
    }
    if (offer.series === 'f1' && offer.seat === 'race' && c.f1Debut === null) {
      c.f1Debut = nextYear;
      if (c.management && c.management.startYear === null) c.management.startYear = nextYear;
    }
  } else {
    c.contract = null;
  }

  // 팀 진입·철수
  const teamOut = runOffseason(c.world.teams, nextYear, c.seed);
  const removed = c.world.teams.teams.filter((t) => !teamOut.world.teams.some((x) => x.id === t.id)).map((t) => t.id);
  c.world.teams = teamOut.world;
  c.world.news.push(...teamOut.news);
  for (const d of c.world.drivers) if (d.teamId && removed.includes(d.teamId)) d.teamId = null;
  if (c.contract?.teamId && removed.includes(c.contract.teamId)) c.contract = null;

  ageWorldDrivers(c, r, nextYear);
  fillOpenSeats(c, r, nextYear);

  c.flags = {};
  c.year = nextYear;
  c.age += 1;
  return c;
}

// ── 자동 진행(CLI·테스트·밸런스) ─────────────────────────────────────
export interface Policy {
  training: (c: Career) => TrainingId[];
  offseason: (c: Career, o: Offseason) => OffseasonChoice;
  /** 전환점 이벤트 선택. 없으면 첫 번째 선택지 */
  event?: (c: Career, card: EventCard) => string;
}

/** 이번 오프시즌에 처리할 이벤트 카드 */
export function pendingEventCards(c: Career): EventCard[] {
  return (c.pendingEvents ?? []).map((id) => eventCard(c, id));
}

/** 전환점 이벤트 하나를 처리한다. 입력 career는 바꾸지 않는다 */
export function resolveEvent(input: Career, eventId: string, optionId: string): { career: Career; result: EventLogEntry } {
  if (!input.pendingEvents?.includes(eventId)) throw new Error(`event ${eventId} is not pending`);
  const c: Career = structuredClone(input);
  const def = EVENT_BY_ID.get(eventId)!;
  const out = applyEventChoice(c, eventId, optionId);
  c.pendingEvents = (c.pendingEvents ?? []).filter((id) => id !== eventId);
  c.choiceLog.push({ year: c.year, kind: 'event', eventId, optionId });
  const result: EventLogEntry = { year: c.year, id: eventId, title: def.title, option: def.options.find((o) => o.id === optionId)!.label, text: out.text, summary: out.summary };
  c.eventLog = [...(c.eventLog ?? []), result];
  return { career: c, result };
}

const SERIES_RANK = (s: SeriesId) => LADDER.indexOf(s);

export const DEFAULT_POLICY: Policy = {
  training: (c) => {
    const slots = c.contract?.seat === 'race' ? TRAINING_SLOTS : TRAINING_SLOTS_RESERVE;
    return recommendedPlan(c.driver.stats, 'weakness', slots, c.driver.focus);
  },
  offseason: (c, o) => {
    const joinAcademy = !!o.academyOffer;
    if (c.age + 1 >= 42) return { offerId: null, retire: true };
    const ok = o.offers.filter((x) => x.affordable);
    const race = ok.filter((x) => x.seat === 'race');
    const f1Race = race.filter((x) => x.series === 'f1').sort((a, b) => b.teamQuality - a.teamQuality)[0];
    if (f1Race) return { offerId: f1Race.id, joinAcademy };
    const junior = race
      .filter((x) => x.series !== 'f1')
      .sort((a, b) => SERIES_RANK(b.series) - SERIES_RANK(a.series) || b.teamQuality - a.teamQuality)[0];
    if (junior) return { offerId: junior.id, joinAcademy };
    const reserve = ok.filter((x) => x.seat === 'reserve').sort((a, b) => b.teamQuality - a.teamQuality)[0];
    if (reserve && c.age < 30) return { offerId: reserve.id, joinAcademy };
    if (c.age >= 26 || (c.noSeatSeasons >= 2 && c.age >= 22)) return { offerId: null, retire: true };
    return { offerId: null, joinAcademy };
  },
};

export function autoplayCareer(setup: CareerSetup, policy: Policy = DEFAULT_POLICY, maxSeasons = 35): Career {
  let c = createCareer(setup);
  for (let i = 0; i < maxSeasons && !c.retired; i++) {
    c = runSeason(c, policy.training(c)).career;
    for (const card of pendingEventCards(c)) c = resolveEvent(c, card.id, policy.event?.(c, card) ?? card.options[0]!.id).career;
    c = applyOffseason(c, policy.offseason(c, getOffseason(c)));
  }
  if (!c.retired) c.retired = true;
  return c;
}

/**
 * 선택 기록만으로 커리어를 처음부터 다시 계산한다(SPEC §9 랭킹 검증).
 * 같은 엔진 버전·설정·선택 기록이면 결과가 바이트 단위로 같아야 한다.
 */
export function replayCareer(setup: CareerSetup, log: ChoiceLogEntry[]): Career {
  let c = createCareer(setup);
  for (const entry of log) {
    if (c.retired) throw new Error(`log continues after retirement (year ${entry.year})`);
    if (entry.year !== c.year) throw new Error(`log year ${entry.year} does not match career year ${c.year}`);
    if (entry.kind === 'training') c = runSeason(c, entry.plan).career;
    else if (entry.kind === 'event') c = resolveEvent(c, entry.eventId, entry.optionId).career;
    else c = applyOffseason(c, entry.choice);
  }
  return c;
}
