// 업적(SPEC §9 v0.22). 커리어 기록만으로 계산하는 읽기 전용 값이라 저장하지 않고, 랭킹 검증에도 영향이 없다.
// 연도는 처음 달성한 시즌. 시즌 기록에서 연도를 알 수 없는 업적(팔로워 등)은 연도 0으로 달성만 표시한다.

import type { Career, SeasonRecord } from './career';
import type { SeriesId } from './series';

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
];

export function achievements(c: Career): AchievementState[] {
  return ACHIEVEMENTS.map((def) => ({ def, year: def.check(c) }));
}

/** 이번 시즌(연도)에 새로 달성한 업적 */
export function newAchievements(c: Career, year: number): AchievementDef[] {
  return achievements(c).filter((a) => a.year === year).map((a) => a.def);
}
