// 시즌 진행(SPEC §4·§5): 카트·하부 리그·F1 시즌 계산, F1 그랑프리 주말(라이브용), runSeason.

import { josa } from './josa';
import { type Career, type F1Driver, type F1Standings, type RaceHighlight, type TeammateH2H, PLAYER_ID, type SeasonRecord, f1Calendar, homeGpEffect, inMilitary, playerBehavior, withHomeGp } from './careerCore';
import { clamp, juniorTeams, lerp, statsAround } from './careerInternal';
import { WEALTH_TIERS } from './creation';
import { coachAdvice, followsCoach } from './coach';
import { applyEndurance, enduranceResult, type EnduranceChoices } from './endurance';
import { myRaceResult, neutralCounts, snsReaction, sumSnsEffects, type MyRaceResult, type NeutralCounts } from './raceNews';
import { strategyKey, type StrategyMap } from './strategy';
import { pickEvents } from './events';
import { seasonFeed } from './feed';
import { CAR_WEIGHT, F1_WINNER_TEAMS, ovr, POINTS_RACE } from './data';
import { teamForm } from './form';
import { addXp, ageCurve, applyAging, applyXp, SESSION_XP, TRAINING, trainingOutcome, TRAINING_SLOTS, TRAINING_SLOTS_RESERVE, type TrainingId } from './growth';
import { updateMediaSeason } from './media';
import { fictionalName } from './names';
import { enforceOrder, runRace, simulateQualifying, type QualiResult, type RaceCar, type RaceInput, type RaceOutcome, type RadioOptionId, type ResultRules } from './race';
import { hashSeed, int, normal, rngFor, type Rng } from './rng';
import { SERIES, seriesLabel, type SeriesId } from './series';
import { STAT_KEYS, type Circuit, type StatKey, type Stats } from './types';

/** runSeason 추가 선택 */
export interface SeasonOptions {
  endurance?: boolean;
  /** 그랑프리 결승 뒤 올린 SNS 글(라운드 → 선택지 id, SPEC v0.36) */
  sns?: Record<string, string>;
  /** 전략 회의 선택(라운드:종류 → 전략·출발 타이어, SPEC v0.40) */
  strategy?: StrategyMap;
  /** 내구레이스 하이라이트 중계에서 고른 것(SPEC v0.42). 없으면 한 번에 결과 */
  enduranceChoices?: EnduranceChoices;
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
  /** 홈 그랑프리(F1 레이스) 우승 수 */
  homeWins: number;
  f1Standings?: F1Standings;
  /** 라운드별 내 결승 결과(SNS 반응 계산용) */
  myRaces: Record<number, MyRaceResult>;
  /** 라운드별 결승 메모(기사용) */
  raceNotes: Record<number, { neutralizations: number; neutral?: NeutralCounts; retired: string[]; mateId?: string }>;
  h2h?: TeammateH2H;
}

const emptySim = (fieldSize: number): SeasonSim => ({
  races: 0, wins: 0, podiums: 0, poles: 0, points: 0, position: null, fieldSize, champion: false,
  expectedAvg: 0, actualAvg: 0, teammateBeat: 0, raceXp: {}, prize: 0, homeWins: 0, myRaces: {}, raceNotes: {},
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
        cars.push({ id: PLAYER_ID, code: c.driver.code, teamId: t.name, stats, personality: c.driver.personality, behaviorMul: playerBehavior(c), teamQuality: contract.teamQuality, reliability: 0.9, ops: contract.teamQuality });
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

export function newRookie(rng: Rng, year: number, idx: number, used: Set<number>, avoidNames?: Set<string>): F1Driver {
  const nm = fictionalName(rng, avoidNames);
  avoidNames?.add(nm.first);
  avoidNames?.add(nm.name);
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
      cars.push({ id: PLAYER_ID, code: c.driver.code, teamId: t.id, stats, personality: c.driver.personality, behaviorMul: playerBehavior(c), teamQuality: t.quality, reliability: t.reliability, ops: t.ops });
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

/** 시즌 전체 무전 선택의 키: 라운드·레이스 종류·결정 id */
export function radioKey(round: number, kind: 'race' | 'sprint', decisionId: string): string {
  return `${round}:${kind}:${decisionId}`;
}

export interface F1WeekendQuali { type: 'quali'; session: 'FP1' | 'FP2' | 'FP3' | 'SQ' | 'Q'; label: string; result: QualiResult; display: boolean }
export interface F1WeekendRace { type: 'race'; kind: 'race' | 'sprint'; label: string; input: RaceInput; outcome: RaceOutcome }
export type F1WeekendSession = F1WeekendQuali | F1WeekendRace;

export interface F1Weekend {
  round: number;
  circuit: Circuit;
  cars: RaceCar[];
  sessions: F1WeekendSession[];
}

/**
 * F1 한 라운드(주말)를 계산한다. 시즌 중에는 능력치·그리드가 바뀌지 않으므로 라운드마다 독립적으로 계산할 수 있다.
 * radio: 시즌 전체 무전 선택(radioKey). 없는 결정은 엔지니어 추천을 따른다(autoRadio).
 * 화면용 프랙티스(FP)는 결과에 영향을 주지 않는다.
 */
function f1Weekend(c: Career, cars: RaceCar[], seed: number, round: number, radio: Record<string, RadioOptionId>, racing: boolean, autoRadio = true, strategy: StrategyMap = {}): F1Weekend {
  const rules = f1Rules(c);
  const w = CAR_WEIGHT.f1;
  const calendar = f1Calendar(c);
  const circuit = calendar[round]!;
  const home = homeGpEffect(c, circuit);
  const roundCars = cars.map((car) => ({
    ...car,
    stats: home && car.id === PLAYER_ID ? withHomeGp(car.stats, home) : car.stats,
    teamQuality: car.teamQuality + teamForm(c.seed, c.year, car.teamId, circuit, round, calendar.length),
  }));
  const sessions: F1WeekendSession[] = [];
  const fps: Array<'FP1' | 'FP2' | 'FP3'> = circuit.sprint ? ['FP1'] : ['FP1', 'FP2', 'FP3'];
  for (const fp of fps) {
    sessions.push({ type: 'quali', session: fp, label: fp, display: true, result: simulateQualifying(hashSeed(seed, c.year, 'f1', round, fp), circuit, roundCars, w, fp) });
  }
  const plan: Array<{ kind: 'race' | 'sprint'; session: 'SQ' | 'Q' }> = circuit.sprint
    ? [{ kind: 'sprint', session: 'SQ' }, { kind: 'race', session: 'Q' }]
    : [{ kind: 'race', session: 'Q' }];
  for (const wk of plan) {
    const q = simulateQualifying(hashSeed(seed, c.year, 'f1', round, wk.session), circuit, roundCars, w, wk.session);
    sessions.push({ type: 'quali', session: wk.session, label: wk.session === 'SQ' ? '스프린트 퀄리파잉' : '퀄리파잉', display: false, result: q });
    const prefix = `${round}:${wk.kind}:`;
    const sub: Record<string, RadioOptionId> = {};
    for (const [k, v] of Object.entries(radio)) if (k.startsWith(prefix)) sub[k.slice(prefix.length)] = v;
    const input: RaceInput = {
      seed: hashSeed(seed, c.year, 'f1', round, wk.kind), circuit, cars: roundCars, grid: q.order, kind: wk.kind, carWeight: w, rules,
      myCarId: racing ? PLAYER_ID : undefined, autoRadio, radio: sub,
      ...(racing && strategy[strategyKey(round, wk.kind)]?.plan ? { myPlan: strategy[strategyKey(round, wk.kind)]!.plan } : {}),
      ...(racing && strategy[strategyKey(round, wk.kind)]?.tyre ? { myStart: strategy[strategyKey(round, wk.kind)]!.tyre } : {}),
    };
    sessions.push({ type: 'race', kind: wk.kind, label: wk.kind === 'sprint' ? '스프린트' : '레이스', input, outcome: runRace(input) });
  }
  return { round, circuit, cars: roundCars, sessions };
}

/** 화면용: 이번 시즌 F1 한 라운드. 무전 결정이 남아 있으면 레이스 결과는 pending */
export function f1WeekendFor(c: Career, plan: TrainingId[], round: number, radio: Record<string, RadioOptionId> = {}, strategy: StrategyMap = {}): F1Weekend {
  const racing = c.contract?.series === 'f1' && c.contract.seat === 'race';
  const stats = seasonStatsFor(c, plan).stats;
  return f1Weekend(c, f1Cars(c, stats), hashSeed(c.seed, 'season', c.year), round, radio, racing, false, strategy);
}

export function isF1RaceSeason(c: Career): boolean {
  return c.contract?.series === 'f1' && c.contract.seat === 'race' && !c.retired;
}

function simulateF1(c: Career, stats: Stats, seed: number, radio: Record<string, RadioOptionId> = {}, strategy: StrategyMap = {}): SeasonSim {
  const racing = c.contract?.series === 'f1' && c.contract.seat === 'race';
  const cars = f1Cars(c, stats);
  const w = CAR_WEIGHT.f1;
  const sim = emptySim(cars.length);
  const points = new Map<string, number>(cars.map((x) => [x.id, 0]));
  const best = new Map<string, number>();
  const exp = racing ? expectedRank(cars, w, PLAYER_ID) : 0;
  const mateId = racing ? cars.find((x) => x.teamId === c.contract!.teamId && x.id !== PLAYER_ID)?.id : undefined;
  const winCount = new Map<string, number>();
  let finishSum = 0;
  let finished = 0;
  let beat = 0;
  let duels = 0;
  let qBeat = 0;
  let qDuels = 0;
  f1Calendar(c).forEach((circuit, round) => {
    addXp(sim.raceXp, SESSION_XP.practice, (circuit.sprint ? 1 : 3) * (racing ? 1 : 0.4));
    const wk = f1Weekend(c, cars, seed, round, radio, racing, true, strategy);
    for (const sess of wk.sessions) {
      if (sess.type === 'quali') {
        if (sess.display) continue;
        if (racing) {
          addXp(sim.raceXp, SESSION_XP.quali);
          if (sess.session === 'Q' && sess.result.order[0] === PLAYER_ID) sim.poles++;
          if (sess.session === 'Q' && mateId) {
            const a = sess.result.order.indexOf(PLAYER_ID), b = sess.result.order.indexOf(mateId);
            if (a >= 0 && b >= 0) { qDuels++; if (a < b) qBeat++; }
          }
        }
        continue;
      }
      const out = sess.outcome;
      if (out.status !== 'finished') continue;
      for (const row of out.classification) {
        points.set(row.id, (points.get(row.id) ?? 0) + row.points);
        if (sess.kind === 'race' && row.position === 1 && row.status === 'finished') winCount.set(row.id, (winCount.get(row.id) ?? 0) + 1);
        best.set(row.id, Math.min(best.get(row.id) ?? 99, row.position));
      }
      if (!racing) continue;
      const me = out.classification.find((x) => x.id === PLAYER_ID)!;
      if (sess.kind === 'race') {
        sim.races++;
        const res = myRaceResult(out.classification, PLAYER_ID, mateId);
        if (res) sim.myRaces[round] = res;
        sim.raceNotes[round] = {
          neutralizations: out.incidents.filter((i) => i.type === 'sc_deploy' || i.type === 'vsc_deploy' || i.type === 'red_flag').length,
          neutral: neutralCounts(out.incidents),
          retired: out.incidents.flatMap((i) => ((i.type === 'crash' || i.type === 'mech_dnf') && i.car !== PLAYER_ID ? [i.car] : [])),
          mateId,
        };
        if (me.status === 'finished') {
          finishSum += me.position;
          finished++;
          if (me.position === 1) { sim.wins++; if (circuit.country === c.driver.nationality) sim.homeWins++; }
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
  // 시즌 최종 순위표(화면용)
  sim.f1Standings = {
    drivers: table.map((id) => ({
      id, name: id === PLAYER_ID ? c.driver.name : c.world.drivers.find((d) => d.id === id)?.name ?? id,
      teamId: cars.find((x) => x.id === id)?.teamId ?? '', points: points.get(id) ?? 0, wins: winCount.get(id) ?? 0,
    })),
    teams: teamOrder.map((teamId) => ({ teamId, name: c.world.teams.teams.find((t) => t.id === teamId)?.name ?? teamId, points: teamPts.get(teamId) ?? 0 })),
  };

  if (racing) {
    sim.position = table.indexOf(PLAYER_ID) + 1;
    sim.points = points.get(PLAYER_ID) ?? 0;
    sim.champion = sim.position === 1;
    sim.expectedAvg = exp;
    sim.actualAvg = finished ? finishSum / finished : exp + 5;
    sim.teammateBeat = duels ? beat / duels : 0.5;
    sim.prize = sim.points * 40_000;
    if (mateId && duels) {
      const mateName = c.world.drivers.find((d) => d.id === mateId)?.name ?? mateId;
      sim.h2h = { mate: mateName, quali: [qBeat, qDuels - qBeat], race: [beat, duels - beat], points: [sim.points, points.get(mateId) ?? 0] };
    }
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
  const calendar = f1Calendar(c);
  calendar.forEach((circuit, round) => {
    const raw = entries
      .map((e) => ({ e, s: w * (e.q + teamForm(c.seed, c.year, e.teamId, circuit, round, calendar.length)) + (1 - w) * (ovr(e.d.stats) / 100) + normal(r) * 0.008, dnf: r() < 0.08 }))
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

/** 시즌 주요 결승 3~4개(첫 우승·우승·포디움·리타이어·큰 순위 상승) — 시즌 결과의 기사용(SPEC v0.38) */
function raceHighlights(c: Career, sim: SeasonSim): RaceHighlight[] {
  const nameOf = (id: string) => c.world.drivers.find((d) => d.id === id)?.name ?? id;
  const hadWin = c.totals.f1Wins > 0 || c.history.some((h) => h.series === 'f1' && h.wins > 0);
  let firstWinSeen = hadWin;
  const scored = Object.entries(sim.myRaces).map(([k, r]) => {
    const round = Number(k);
    let score = 0;
    if (r.position === 1) { score = firstWinSeen ? 80 : 200; firstWinSeen = true; }
    else if (r.position !== null && r.position <= 3) score = 60;
    else if (r.position === null) score = 40;
    else score = Math.max(0, r.grid - r.position) * 4 + (r.points > 0 ? 5 : 0);
    return { round, r, score };
  });
  const picked = scored.sort((a, b) => b.score - a.score || a.round - b.round).slice(0, 4).filter((x) => x.score > 0).sort((a, b) => a.round - b.round);
  const cal = f1Calendar(c);
  return picked.map(({ round, r }) => {
    const note = sim.raceNotes[round];
    return {
      round, circuitId: cal[round]?.id ?? '', result: r,
      winnerName: r.winnerId === PLAYER_ID ? c.driver.name : nameOf(r.winnerId),
      ...(note?.mateId ? { mateName: nameOf(note.mateId) } : {}),
      neutralizations: note?.neutralizations ?? 0,
      ...(note?.neutral ? { neutral: note.neutral } : {}),
      retired: (note?.retired ?? []).map(nameOf),
    };
  });
}

/** 시즌 동안 쓰는 능력치(압박·과훈련 반영). runSeason과 화면용 주말이 같은 값을 쓴다 */
export function seasonStatsFor(c: Career, plan: TrainingId[]): { stats: Stats; pressured: boolean; overtrained: boolean; coached: boolean } {
  const seat = c.contract?.seat ?? 'none';
  const slots = seat === 'race' ? TRAINING_SLOTS : TRAINING_SLOTS_RESERVE;
  const stats = { ...c.driver.stats };
  // 코치 조언대로 짠 계획이면 압박 실수·과훈련 손해가 없다(SPEC v0.34)
  const coached = plan.length > 0 && !inMilitary(c) && followsCoach(c, plan);
  const pressured = !coached && c.media.pressure > c.driver.hidden.pressureResist;
  const overtrained = !coached && trainingOutcome(plan.slice(0, slots), false).overtrained;
  if (pressured) stats.consistency = Math.max(20, stats.consistency - 3);
  if (overtrained) stats.consistency = Math.max(20, stats.consistency - 2);
  return { stats, pressured, overtrained, coached };
}

/**
 * 훈련 계획을 받아 한 시즌을 진행한다. 입력 career는 바꾸지 않는다.
 * radio: F1 라이브 주말에서 플레이어가 고른 무전(radioKey). 선택 기록에 함께 남아 재생된다.
 * opts.endurance: 시즌 중 내구레이스 출전(enduranceOffer가 있을 때만 반영)
 */
export function runSeason(input: Career, plan: TrainingId[], radio: Record<string, RadioOptionId> = {}, opts: SeasonOptions = {}): { career: Career; record: SeasonRecord } {
  if (input.retired) throw new Error('career is retired');
  const c: Career = structuredClone(input);
  const seed = hashSeed(c.seed, 'season', c.year);
  const contract = c.contract;
  const series: SeriesId = contract?.series ?? (c.history[c.history.length - 1]?.series ?? 'kart');
  const seat = contract?.seat ?? 'none';
  const slots = seat === 'race' ? TRAINING_SLOTS : TRAINING_SLOTS_RESERVE;
  // 군 복무 중에는 레이싱 훈련을 할 수 없다
  const serving = inMilitary(c);
  const cleanPlan = serving ? [] : plan.slice(0, slots);
  // 결과는 시즌 시작 때의 상태로 정한다(라이브 주말에 미리 보여 준 결과와 같게)
  const enduranceOut = !serving && opts.endurance ? enduranceResult(c, opts.enduranceChoices) : null;
  const endurance = !!enduranceOut;
  const f1Racing = !serving && contract?.series === 'f1' && contract.seat === 'race';
  const sns: Record<string, string> = f1Racing ? { ...(opts.sns ?? {}) } : {};
  const strategy: StrategyMap = f1Racing ? { ...(opts.strategy ?? {}) } : {};
  c.choiceLog.push({ year: c.year, kind: 'training', plan: cleanPlan, ...(Object.keys(radio).length ? { radio } : {}), ...(endurance ? { endurance: true } : {}), ...(endurance && opts.enduranceChoices && Object.keys(opts.enduranceChoices).length ? { enduranceChoices: opts.enduranceChoices } : {}), ...(Object.keys(sns).length ? { sns } : {}), ...(Object.keys(strategy).length ? { strategy } : {}) });

  const notes: string[] = [];
  let expenses = 0;
  let income = 0;
  const wealth = WEALTH_TIERS[c.driver.wealthTier];

  // 시즌 시작: 시트 비용(아카데미가 하부 리그 비용을 대신 낸다), 가족 지원
  if (contract && contract.seatCost > 0) {
    const byAcademy = !!c.academy && contract.series !== 'f1';
    const covered = byAcademy || contract.management ? contract.seatCost : 0;
    expenses += contract.seatCost - covered;
    if (covered) notes.push(byAcademy ? `${josa(c.academy!, '이/가')} 시트 비용을 지원했다` : '매니지먼트가 시트 비용을 지원했다');
  }
  if (c.age < 21 && c.f1Debut === null) income += wealth.familySupport;

  // 훈련(돈이 모자라면 유료 프로그램을 무료 롱런으로 바꾼다)
  const freeSim = !!c.academy || series === 'f1' || (contract?.facility ?? 0) >= 0.8;
  const ss = seasonStatsFor(c, cleanPlan);
  let training = trainingOutcome(cleanPlan, freeSim);
  if (!ss.coached && c.funds + income - expenses - training.cost < 0) {
    const downgraded = cleanPlan.map((id) => (TRAINING[id].cost > 0 && !(id === 'sim' && freeSim) ? 'longrun' : id));
    training = trainingOutcome(downgraded, freeSim);
    notes.push('자금이 부족해 유료 훈련을 줄였다');
  }
  expenses += training.cost;

  // 압박이 압박 내성보다 높으면 이번 시즌 Consistency −3
  const seasonStats = ss.stats;
  const coachBonus = ss.coached ? coachAdvice(c).bonus : 1;
  if (ss.coached) notes.push(`코치진 조언대로 훈련했다: 훈련 효과 +${Math.round((coachBonus - 1) * 100)}%, 과훈련·압박 실수 없음`);
  if (ss.pressured) notes.push('압박 속에 실수가 늘었다');
  if (ss.overtrained) notes.push('휴식 없는 훈련으로 컨디션이 떨어졌다');

  const ovrStart = ovr(c.driver.stats);
  let sim: SeasonSim;
  if (!contract) {
    sim = emptySim(0);
    if (c.world.teams.teams.length) quickF1World(c, seed);
  } else if (series === 'kart') {
    sim = simulateKart(c, seasonStats, seed);
    quickF1World(c, seed);
  } else if (series === 'f1') {
    sim = simulateF1(c, seasonStats, seed, radio, strategy);
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
    trainGain[k] = (training.xp[k] ?? 0) * eff * envMult * focusMult(k) * coachBonus;
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
  if (serving) {
    // 차를 못 타니 감각이 무뎌진다. 대신 규칙적인 생활로 체력·멘탈은 단단해진다
    for (const k of ['pace', 'racecraft', 'wet', 'tyre'] as const) c.driver.stats[k] = Math.max(20, c.driver.stats[k] - 1);
    c.driver.stats.consistency = Math.min(99, c.driver.stats.consistency + 1);
    c.media.pressure = Math.max(0, c.media.pressure - 15);
    notes.push('군 복무 중: 레이스 감각은 무뎌졌지만 체력과 멘탈은 단단해졌다');
  }
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
  // 그랑프리 결승 뒤 SNS 글(라이브 시즌에서 고른 것)
  const posts = Object.entries(sns).flatMap(([round, opt]) => { const r = sim.myRaces[Number(round)]; return r ? [snsReaction(c, r, opt).effect] : []; });
  if (posts.length) {
    const e = sumSnsEffects(posts);
    c.media.followers = Math.round(c.media.followers * e.followersMul);
    c.media.sentiment = clamp(c.media.sentiment + e.sentiment, -100, 100);
    c.media.pressure = clamp(c.media.pressure + e.pressure, 0, 100);
    c.media.reputation = clamp(c.media.reputation + e.reputation, 0, 100);
    notes.push(`SNS 게시 ${posts.length}번: 팔로워 ${e.followersMul >= 1 ? '+' : ''}${Math.round((e.followersMul - 1) * 100)}%, 팬 여론 ${e.sentiment >= 0 ? '+' : ''}${e.sentiment}, 압박 ${e.pressure >= 0 ? '+' : ''}${e.pressure}`);
  }

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
  // 여름·가을 내구레이스: 시즌 기록을 만들기 전에 적용해 능력치·팬·압박이 이번 시즌에 반영된다
  const endur = enduranceOut ? applyEndurance(c, notes, enduranceOut) : null;

  const record: SeasonRecord = {
    year: c.year, age: c.age, series, team: contract?.team ?? null, seat, races: sim.races, wins: sim.wins, homeWins: sim.homeWins,
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
    headline: serving ? `${c.driver.name}, 군 복무 중` : mediaOut.headline, notes, statsEnd: { ...c.driver.stats },
    ...(serving ? { military: true } : {}),
    ...(endur ? { endurance: endur } : {}),
    ...(sim.f1Standings ? { f1Standings: sim.f1Standings } : {}),
    ...(Object.keys(sim.myRaces).length ? { raceHighlights: raceHighlights(c, sim) } : {}),
    ...(sim.h2h ? { h2h: sim.h2h } : {}),
  };
  record.feed = seasonFeed(c, record);
  c.history.push(record);
  // 이번 오프시즌 전환점 이벤트(0~2개). 오프시즌 제안을 받기 전에 처리한다
  c.pendingEvents = serving ? [] : pickEvents(c, record);
  if (seat === 'race') c.noSeatSeasons = 0;
  else if (!serving) c.noSeatSeasons += 1;
  return { career: c, record };
}
