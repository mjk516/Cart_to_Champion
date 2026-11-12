// 커리어 생성(SPEC §3): 설정에서 12세 카트 선수와 2026 실제 그리드 세계를 만든다.

import { CALENDAR_2026_SLOTS, type Career, type CareerSetup, ENGINE_VERSION, type F1World } from './careerCore';
import { juniorTeams, lerp, zeroStats } from './careerInternal';
import { carNumberProblem, DEFAULT_HELMET, defaultCarNumber, generateCandidates, WEALTH_TIERS } from './creation';
import { generateManager } from './manager';
import { driverCode, formatFullName } from './names';
import { DRIVERS_2026, ovr, TEAMS_2026 } from './data';
import { generateHidden } from './growth';
import { initialMedia } from './media';
import { int, rngFor } from './rng';
import { SERIES } from './series';
import { initialWorld } from './teams';

// ── 생성 ─────────────────────────────────────────────────────────────
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
    calendar: CALENDAR_2026_SLOTS.map((s) => ({ ...s })),
  };

  return {
    schemaVersion: 1,
    engineVersion: ENGINE_VERSION,
    seed: setup.seed,
    setup,
    driver: {
      name: setup.name,
      ...(setup.surname !== undefined ? { fullName: formatFullName(setup.surname, setup.givenName ?? '', setup.nationality) } : {}),
      ...(setup.nickname?.trim() ? { nickname: setup.nickname.trim() } : {}),
      code: driverCode(setup.surname, setup.surname !== undefined ? formatFullName(setup.surname, setup.givenName ?? '', setup.nationality) : setup.name),
      nationality: setup.nationality,
      personality: setup.personality,
      wealthTier: setup.wealthTier,
      focus: setup.focus.slice(0, 2),
      number: setup.number !== undefined && !carNumberProblem(setup.number) ? setup.number : defaultCarNumber(setup.seed),
      helmet: setup.helmet ?? DEFAULT_HELMET,
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
    manager: generateManager(setup.seed, 'first', setup.nationality),
    totals: { f1Titles: 0, f1Starts: 0, f1Wins: 0, f1Podiums: 0, f1Poles: 0, juniorTitles: [], earnings: 0, releases: 0, bestOvr: Math.round(ovr(cand.stats)) },
  };
}
