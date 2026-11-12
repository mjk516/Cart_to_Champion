// 업적(SPEC §9 v0.22). 커리어 기록만으로 계산하는 읽기 전용 값이라 저장하지 않고, 랭킹 검증에도 영향이 없다.
// 연도는 처음 달성한 시즌. 시즌 기록에서 연도를 알 수 없는 업적(팔로워 등)은 연도 0으로 달성만 표시한다.

import type { Career, SeasonRecord } from './career';
import type { SeriesId } from './series';
import { DRIVERS_2026 } from './data';
import { hashSeed } from './rng';
import { difficultyOf } from './growth';

export type AchievementGroup = 'junior' | 'f1' | 'special';
export const ACHIEVEMENT_GROUP_LABEL: Record<AchievementGroup, string> = { junior: '하부 리그', f1: 'F1', special: '특별' };

export interface AchievementDef {
  id: string;
  group: AchievementGroup;
  title: string;
  desc: string;
  /** 달성했으면 처음 달성한 연도(모르면 0), 아니면 null */
  check: (c: Career) => number | null;
}

export interface AchievementState { def: AchievementDef; year: number | null }

const MAJOR_NAMES = ['McLaren', 'Mercedes', 'Red Bull Racing', 'Ferrari'];
const first = (c: Career, f: (h: SeasonRecord) => boolean) => c.history.find(f)?.year ?? null;
const f1Race = (h: SeasonRecord) => h.series === 'f1' && h.seat === 'race';
const champ = (s: SeriesId) => (c: Career) => first(c, (h) => h.series === s && h.champion);

/** 누적값이 처음 목표를 넘긴 시즌 */
function cumulative(c: Career, value: (h: SeasonRecord) => number, target: number): number | null {
  let sum = 0;
  for (const h of c.history) { sum += value(h); if (sum >= target) return h.year; }
  return null;
}

/**
 * 실제 F1 최연소 기록(만 나이, 정수로 내림, 2026 시즌 기준). 게임 나이는 정수라 "이보다 어리면" 기록 경신으로 본다.
 * 폴: 안토넬리 19세(2026 중국 GP), 챔피언: 안토넬리 20세(2026). 우승·포디움: 페르스타펜 18세(2016 스페인 GP, 안토넬리는 19세 우승·18세 포디움으로 2위)
 */
export const REAL_YOUNGEST = { winner: 18, podium: 18, pole: 19, champion: 20 } as const;
export const REAL_YOUNGEST_HOLDER = { winner: '막스 페르스타펜', podium: '막스 페르스타펜', pole: '키미 안토넬리', champion: '키미 안토넬리' } as const;

export const ACHIEVEMENTS: AchievementDef[] = [
  // 하부 리그
  { id: 'kart_win', group: 'junior', title: '첫 체커기', desc: '카트에서 첫 우승', check: (c) => first(c, (h) => h.series === 'kart' && h.wins > 0) },
  { id: 'kart_champ', group: 'junior', title: '카트 챔피언', desc: '카트 시즌 챔피언', check: champ('kart') },
  { id: 'f4_champ', group: 'junior', title: 'F4 챔피언', desc: 'F4 시즌 챔피언', check: champ('f4') },
  { id: 'freca_champ', group: 'junior', title: 'FRECA 챔피언', desc: '포뮬러 리저널 시즌 챔피언', check: champ('freca') },
  { id: 'f3_champ', group: 'junior', title: 'F3 챔피언', desc: 'FIA F3 시즌 챔피언', check: champ('f3') },
  { id: 'f2_champ', group: 'junior', title: 'F2 챔피언', desc: 'FIA F2 시즌 챔피언', check: champ('f2') },
  {
    id: 'ladder_slam', group: 'junior', title: '사다리 그랜드슬램', desc: 'F4·FRECA·F3·F2를 모두 제패',
    check: (c) => {
      const ys = (['f4', 'freca', 'f3', 'f2'] as SeriesId[]).map((s) => champ(s)(c));
      return ys.every((y) => y !== null) ? Math.max(...(ys as number[])) : null;
    },
  },
  // F1
  { id: 'f1_debut', group: 'f1', title: 'F1 데뷔', desc: 'F1 레이스 시트로 첫 시즌', check: (c) => c.f1Debut },
  { id: 'f1_points', group: 'f1', title: '첫 F1 포인트', desc: 'F1에서 포인트 획득', check: (c) => first(c, (h) => f1Race(h) && h.points > 0) },
  { id: 'f1_podium', group: 'f1', title: '첫 포디움', desc: 'F1 레이스 3위 안', check: (c) => first(c, (h) => f1Race(h) && h.podiums > 0) },
  { id: 'f1_pole', group: 'f1', title: '첫 폴 포지션', desc: 'F1 퀄리파잉 1위', check: (c) => first(c, (h) => f1Race(h) && h.poles > 0) },
  { id: 'f1_win', group: 'f1', title: '첫 그랑프리 우승', desc: 'F1 레이스 우승', check: (c) => first(c, (h) => f1Race(h) && h.wins > 0) },
  { id: 'f1_10wins', group: 'f1', title: '10승', desc: 'F1 통산 10승', check: (c) => cumulative(c, (h) => (f1Race(h) ? h.wins : 0), 10) },
  { id: 'f1_champ', group: 'f1', title: '월드 챔피언', desc: 'F1 드라이버 챔피언', check: champ('f1') },
  { id: 'f1_3titles', group: 'f1', title: '왕조', desc: 'F1 챔피언 3회', check: (c) => cumulative(c, (h) => (h.series === 'f1' && h.champion ? 1 : 0), 3) },
  { id: 'f1_100', group: 'f1', title: '100전', desc: 'F1 통산 100경기 출전', check: (c) => cumulative(c, (h) => (f1Race(h) ? h.races : 0), 100) },
  { id: 'f1_300', group: 'f1', title: '300전', desc: 'F1 통산 300경기 출전', check: (c) => cumulative(c, (h) => (f1Race(h) ? h.races : 0), 300) },
  { id: 'major_seat', group: 'f1', title: '빅4 입성', desc: '맥라렌·메르세데스·레드불·페라리 레이스 시트', check: (c) => first(c, (h) => f1Race(h) && MAJOR_NAMES.includes(h.team ?? '')) },
  { id: 'home_win', group: 'f1', title: '안방 우승', desc: '홈 그랑프리 우승', check: (c) => first(c, (h) => (h.homeWins ?? 0) > 0) },
  // 특별
  { id: 'underdog', group: 'special', title: '흙수저 챔피언', desc: '가정 자산 ‘빠듯함’으로 월드 챔피언', check: (c) => (c.driver.wealthTier === 1 ? champ('f1')(c) : null) },
  {
    id: 'comeback', group: 'special', title: '다시 일어서다', desc: '시트 없는 시즌이나 방출을 겪은 뒤 F1 우승',
    check: (c) => {
      const low = c.history.findIndex((h) => h.seat === 'none' || h.notes.some((n) => n.includes('방출')));
      if (low < 0) return null;
      return c.history.slice(low + 1).find((h) => f1Race(h) && h.wins > 0)?.year ?? null;
    },
  },
  {
    id: 'founding_champ', group: 'special', title: '창단 멤버 챔피언', desc: '데뷔 2년 안에 합류한 신생팀에서 월드 챔피언',
    check: (c) => {
      for (const h of c.history) {
        if (!(h.series === 'f1' && h.champion)) continue;
        const t = c.world.teams.teams.find((x) => x.name === h.team);
        if (!t?.debutYear) continue;
        const joined = c.history.find((x) => f1Race(x) && x.team === h.team)?.year ?? 9999;
        if (joined <= t.debutYear + 1) return h.year;
      }
      return null;
    },
  },
  {
    id: 'loyal', group: 'special', title: '원클럽맨', desc: '한 F1 팀에서 8시즌 연속',
    check: (c) => {
      let run = 0, team: string | null = null;
      for (const h of c.history) {
        if (f1Race(h) && h.team === team) run++;
        else { run = f1Race(h) ? 1 : 0; team = f1Race(h) ? h.team : null; }
        if (run >= 8) return h.year;
      }
      return null;
    },
  },
  { id: 'iron_man', group: 'special', title: '철인', desc: '40세 시즌까지 현역', check: (c) => first(c, (h) => h.age >= 40 && h.seat !== 'none') },
  { id: 'rich', group: 'special', title: '1억 유로 드라이버', desc: '통산 수입 €100M', check: (c) => cumulative(c, (h) => h.income, 100_000_000) },
  { id: 'star', group: 'special', title: '글로벌 스타', desc: '팔로워 100만 명', check: (c) => (c.media.followers >= 1_000_000 ? 0 : null) },
  { id: 'three_peat', group: 'special', title: '3연패', desc: 'F1 챔피언 3시즌 연속', check: (c) => { const s = titleStreak(c); return s && s.count >= 3 ? s.from + 2 : null; } },
  { id: 'youngest_champ', group: 'special', title: '역대 최연소 챔피언', desc: `실제 F1 최연소 챔피언 기록(${REAL_YOUNGEST_HOLDER.champion} ${REAL_YOUNGEST.champion}세)보다 어린 나이에 월드 챔피언`, check: (c) => first(c, (h) => h.series === 'f1' && h.champion && h.age < REAL_YOUNGEST.champion) },
  { id: 'endurance_win', group: 'special', title: '24시간의 승자', desc: 'F1 시즌 사이 내구레이스에서 클래스 우승', check: (c) => (c.eventLog ?? []).find((e) => e.id === 'endurance_race' && e.text.includes('클래스 우승'))?.year ?? null },
  { id: 'hard_champion', group: 'special', title: '역경의 챔피언', desc: '어려움 난이도에서 F1 월드 챔피언', check: (c) => (difficultyOf(c) === 'hard' ? first(c, (h) => h.series === 'f1' && h.champion) : null) },
  { id: 'le_mans_win', group: 'special', title: '르망의 왕', desc: '르망 24시 클래스 우승', check: (c) => c.history.find((h) => h.endurance?.name === '르망 24시' && h.endurance.position === 1)?.year ?? null },
  { id: 'endurance_podiums', group: 'special', title: '내구레이스 단골', desc: '내구레이스 포디움 3회', check: (c) => nthYear(c.history.filter((h) => h.endurance?.position !== null && h.endurance !== undefined && h.endurance.position! <= 3), 3) },
  { id: 'endurance_triple', group: 'special', title: '내구레이스 3관왕', desc: '서로 다른 내구레이스 3곳에서 클래스 우승', check: (c) => {
    const seen = new Set<string>();
    for (const h of c.history) if (h.endurance?.position === 1) { seen.add(h.endurance.name); if (seen.size >= 3) return h.year; }
    return null;
  } },
  { id: 'legend', group: 'special', title: '팀 레전드', desc: '한 팀에서 8시즌 이상 뛰며 챔피언. 차 번호가 영구결번된다', check: (c) => teamLegend(c)?.year ?? null },
];

function nthYear(hs: SeasonRecord[], n: number): number | null {
  return hs.length >= n ? hs[n - 1]!.year : null;
}

export interface EnduranceRecords {
  starts: number;
  wins: number;
  podiums: number;
  dnfs: number;
  /** 대회별 최고 성적(이름 → 최고 순위, null은 완주 못 함) */
  best: Array<{ name: string; starts: number; best: number | null; bestYear: number }>;
  list: Array<{ year: number; name: string; when: string; position: number | null; classCars: number }>;
}

/** 내구레이스 기록(SPEC v0.43) */
export function enduranceRecords(c: Career): EnduranceRecords {
  const list = c.history.flatMap((h) => (h.endurance ? [{ year: h.year, name: h.endurance.name, when: h.endurance.when, position: h.endurance.position, classCars: h.endurance.classCars }] : []));
  const byName = new Map<string, EnduranceRecords['best'][number]>();
  for (const e of list) {
    const b = byName.get(e.name);
    if (!b) { byName.set(e.name, { name: e.name, starts: 1, best: e.position, bestYear: e.year }); continue; }
    b.starts++;
    if (e.position !== null && (b.best === null || e.position < b.best)) { b.best = e.position; b.bestYear = e.year; }
  }
  return {
    starts: list.length,
    wins: list.filter((e) => e.position === 1).length,
    podiums: list.filter((e) => e.position !== null && e.position <= 3).length,
    dnfs: list.filter((e) => e.position === null).length,
    best: [...byName.values()].sort((a, b) => (a.best ?? 99) - (b.best ?? 99) || b.starts - a.starts),
    list,
  };
}

function titleStreak(c: Career): { count: number; from: number; to: number } | null {
  let best: { count: number; from: number; to: number } | null = null;
  let cur: { count: number; from: number; to: number } | null = null;
  for (const h of c.history) {
    if (h.series === 'f1' && h.champion) {
      const prev = cur as { count: number; from: number; to: number } | null;
      cur = prev !== null && prev.to === h.year - 1 ? { count: prev.count + 1, from: prev.from, to: h.year } : { count: 1, from: h.year, to: h.year };
    }
    else cur = null;
    if (cur && (!best || cur.count > best.count)) best = cur;
  }
  return best;
}

/** 플레이어 차 번호(영구결번 연출용). 시드로 정하고, 2026 그리드의 실제 번호는 피한다 */
export function playerNumber(c: Career): number {
  if (c.driver.number) return c.driver.number;
  const used = new Set(DRIVERS_2026.map((d) => d.number));
  let n = (hashSeed(c.seed, 'car-number') % 98) + 2;
  while (used.has(n)) n = n >= 99 ? 2 : n + 1;
  return n;
}

/** 한 팀에서 8시즌 이상 + 그 팀에서 챔피언 */
export function teamLegend(c: Career): { team: string; seasons: number; titles: number; number: number; year: number } | null {
  const byTeam = new Map<string, SeasonRecord[]>();
  for (const h of c.history) if (f1Race(h) && h.team) byTeam.set(h.team, [...(byTeam.get(h.team) ?? []), h]);
  let best: { team: string; seasons: number; titles: number; number: number; year: number } | null = null;
  for (const [team, hs] of byTeam) {
    const titles = hs.filter((h) => h.champion).length;
    if (hs.length < 8 || titles === 0) continue;
    // 8시즌째와 첫 우승 중 늦은 해에 레전드가 된다
    const year = Math.max(hs[7]!.year, hs.find((h) => h.champion)!.year);
    if (!best || hs.length > best.seasons) best = { team, seasons: hs.length, titles, number: playerNumber(c), year };
  }
  return best;
}

export interface CareerRecordsSummary {
  youngestWin: { age: number; year: number; beatsReal: boolean } | null;
  youngestPodium: { age: number; year: number; beatsReal: boolean } | null;
  youngestPole: { age: number; year: number; beatsReal: boolean } | null;
  youngestChampion: { age: number; year: number; beatsReal: boolean } | null;
  mostWinsSeason: { wins: number; races: number; year: number; team: string | null } | null;
  titleStreak: { count: number; from: number; to: number } | null;
  longestStint: { team: string; seasons: number; from: number; to: number } | null;
  legend: ReturnType<typeof teamLegend>;
}

/** 커리어 기록(SPEC §9): 최연소 기록, 단일 시즌 최다 우승, 연속 챔피언, 한 팀 최장 기간, 팀 레전드 */
export function careerRecords(c: Career): CareerRecordsSummary {
  const f1 = c.history.filter(f1Race);
  const youngest = (f: (h: SeasonRecord) => boolean, real: number) => {
    const h = f1.find(f);
    return h ? { age: h.age, year: h.year, beatsReal: h.age < real } : null;
  };
  const most = [...f1].sort((a, b) => b.wins - a.wins || a.year - b.year)[0];
  let stint: CareerRecordsSummary['longestStint'] = null;
  let run: CareerRecordsSummary['longestStint'] = null;
  for (const h of c.history) {
    const prev = run as CareerRecordsSummary['longestStint'];
    if (f1Race(h) && h.team && prev !== null && prev.team === h.team && prev.to === h.year - 1) run = { team: prev.team, seasons: prev.seasons + 1, from: prev.from, to: h.year };
    else run = f1Race(h) && h.team ? { team: h.team, seasons: 1, from: h.year, to: h.year } : null;
    if (run && (!stint || run.seasons > stint.seasons)) stint = run;
  }
  return {
    youngestWin: youngest((h) => h.wins > 0, REAL_YOUNGEST.winner),
    youngestPodium: youngest((h) => h.podiums > 0, REAL_YOUNGEST.podium),
    youngestPole: youngest((h) => h.poles > 0, REAL_YOUNGEST.pole),
    youngestChampion: youngest((h) => h.champion, REAL_YOUNGEST.champion),
    mostWinsSeason: most && most.wins > 0 ? { wins: most.wins, races: most.races, year: most.year, team: most.team } : null,
    titleStreak: titleStreak(c),
    longestStint: stint,
    legend: teamLegend(c),
  };
}

export function achievements(c: Career): AchievementState[] {
  return ACHIEVEMENTS.map((def) => ({ def, year: def.check(c) }));
}

/** 이번 시즌(연도)에 새로 달성한 업적 */
export function newAchievements(c: Career, year: number): AchievementDef[] {
  return achievements(c).filter((a) => a.year === year).map((a) => a.def);
}
