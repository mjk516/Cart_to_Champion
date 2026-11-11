// F1 팀 진입·철수(SPEC §2.1). 최대 12팀(규정 상한), 최소 10팀.
// 불변식: 현재 팀 수 + 준비 중인 신규 팀 수 ≤ 12. 어기면 예외를 던진다.

import { pick, rngFor } from './rng';
import type { Team } from './types';

/** 신생팀 출발 조건: 2026 캐딜락과 같다 */
export const NEW_TEAM_START = { quality: 0.855, reliability: 0.82, ops: 0.78 } as const;

export const MAX_TEAMS = 12;
export const MIN_TEAMS = 10;

export const ENTRY_ODDS = {
  /** 빈자리 수 → 오프시즌당 참가 신청 확률 */
  apply: { 0: 0, 1: 0.15, 2: 0.25 } as Record<number, number>,
  fiaApproval: 0.6,
  fomAgreement: 0.55,
  manufacturerBonus: 0.2,
  prepSeasons: 2,
};

export const WITHDRAWAL_ODDS = {
  /** 조건을 채운 팀만, 시즌당 */
  withdraw: 0.005,
  /** 철수 판정 중 인수로 살아남는 비율 */
  takeover: 0.7,
};

/** 현재 F1에 없는 실제 제조사(SPEC §2.1). 비면 가상 프라이빗 팀을 만든다. */
export const APPLICANT_MANUFACTURERS = ['Porsche', 'BMW', 'Hyundai', 'Toyota', 'Lamborghini'];

export interface WorldTeam extends Team {
  /** 최근 시즌 컨스트럭터 순위(최신이 마지막) */
  standings: number[];
  founded: number;
}

export interface PendingEntry {
  name: string;
  manufacturer: boolean;
  approvedSeason: number;
  debutSeason: number;
}

export interface TeamWorld {
  teams: WorldTeam[];
  pending: PendingEntry[];
  /** 탈락 횟수(같은 신청자가 3번 탈락하면 목록에서 빠진다) */
  rejections: Record<string, number>;
  /** 마지막 탈락 시즌(2시즌 뒤 재신청 가능) */
  lastRejected: Record<string, number>;
  usedNames: string[];
}

export interface TeamNews {
  season: number;
  kind: 'application' | 'fia_approved' | 'fia_rejected' | 'fom_agreed' | 'fom_rejected' | 'debut' | 'withdrawal' | 'takeover' | 'calendar';
  team: string;
  text: string;
}

export function assertTeamInvariant(world: TeamWorld): void {
  const total = world.teams.length + world.pending.length;
  if (total > MAX_TEAMS) throw new Error(`team cap violated: ${world.teams.length} + ${world.pending.length} pending > ${MAX_TEAMS}`);
  if (world.teams.length < MIN_TEAMS) throw new Error(`team floor violated: ${world.teams.length} < ${MIN_TEAMS}`);
}

export function initialWorld(teams: Team[], season: number): TeamWorld {
  const world: TeamWorld = {
    teams: teams.map((t) => ({ ...t, standings: [], founded: t.debutYear ?? season - 10 })),
    pending: [],
    rejections: {},
    lastRejected: {},
    usedNames: teams.map((t) => t.name),
  };
  assertTeamInvariant(world);
  return world;
}

function newTeamFrom(entry: PendingEntry, season: number, idx: number): WorldTeam {
  const id = entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return {
    id: `${id}_${season}`,
    name: entry.name,
    color: ['#00A19B', '#F4C430', '#8E44AD', '#2ECC71', '#E67E22'][idx % 5] ?? '#999999',
    // 모든 신생팀은 캐딜락(2026 데뷔)과 같은 조건으로 출발한다(SPEC §5.1 v0.12)
    quality: NEW_TEAM_START.quality,
    reliability: NEW_TEAM_START.reliability,
    ops: NEW_TEAM_START.ops,
    budget: entry.manufacturer ? 0.85 : 0.6,
    manufacturer: entry.manufacturer,
    standings: [],
    founded: season,
  };
}

/**
 * 오프시즌 한 번. season은 다음 시즌 연도. 입력 world는 바꾸지 않고 새 객체를 돌려준다.
 * 순서: ① 데뷔 처리 → ② 철수 판정 → ③ 신규 신청 판정. 끝날 때 불변식을 검사한다.
 */
export function runOffseason(input: TeamWorld, season: number, seed: number): { world: TeamWorld; news: TeamNews[] } {
  const world: TeamWorld = structuredClone(input);
  const news: TeamNews[] = [];
  const rng = rngFor(seed, 'teams', season);

  // ① 데뷔
  const debuting = world.pending.filter((p) => p.debutSeason <= season);
  world.pending = world.pending.filter((p) => p.debutSeason > season);
  debuting.forEach((p, i) => {
    world.teams.push(newTeamFrom(p, season, i));
    news.push({ season, kind: 'debut', team: p.name, text: `${p.name}, ${season} 시즌 F1 데뷔` });
  });

  // ② 철수: 팀 수 > 10, 예산 최하위, 최근 3시즌 모두 하위 2위 안
  if (world.teams.length > MIN_TEAMS) {
    const minBudget = Math.min(...world.teams.map((t) => t.budget));
    const n = world.teams.length;
    for (const t of [...world.teams]) {
      const last3 = t.standings.slice(-3);
      const eligible = t.budget === minBudget && last3.length === 3 && last3.every((p) => p >= n - 1);
      if (!eligible || world.teams.length <= MIN_TEAMS) continue;
      if (rng() >= WITHDRAWAL_ODDS.withdraw) continue;
      if (rng() < WITHDRAWAL_ODDS.takeover) {
        const old = t.name;
        t.name = `${old} (새 소유주)`;
        t.budget = Math.min(1, t.budget + 0.2);
        news.push({ season, kind: 'takeover', team: old, text: `${old}, 인수되어 새 이름으로 존속` });
      } else {
        world.teams = world.teams.filter((x) => x.id !== t.id);
        news.push({ season, kind: 'withdrawal', team: t.name, text: `${t.name}, F1 철수 발표` });
      }
    }
  }

  // ③ 신규 신청(동시에 1건)
  const slots = MAX_TEAMS - world.teams.length - world.pending.length;
  const applyP = ENTRY_ODDS.apply[Math.min(2, Math.max(0, slots))] ?? 0;
  if (slots > 0 && rng() < applyP) {
    const pool = APPLICANT_MANUFACTURERS.filter(
      (m) =>
        !world.usedNames.includes(m) &&
        (world.rejections[m] ?? 0) < 3 &&
        season - (world.lastRejected[m] ?? -99) >= 2,
    );
    const manufacturer = pool.length > 0;
    const name = manufacturer ? pick(rng, pool) : `Privateer GP ${season}`;
    news.push({ season, kind: 'application', team: name, text: `${name}, F1 참가 신청서 제출` });
    const fia = ENTRY_ODDS.fiaApproval + (manufacturer ? 0.15 : -0.15);
    const fom = ENTRY_ODDS.fomAgreement + (manufacturer ? ENTRY_ODDS.manufacturerBonus : 0);
    if (rng() >= fia) {
      news.push({ season, kind: 'fia_rejected', team: name, text: `FIA, ${name}의 참가 신청 반려` });
      world.rejections[name] = (world.rejections[name] ?? 0) + 1;
      world.lastRejected[name] = season;
    } else {
      news.push({ season, kind: 'fia_approved', team: name, text: `FIA, ${name} 참가 승인` });
      if (rng() >= fom) {
        news.push({ season, kind: 'fom_rejected', team: name, text: `${name}, FOM 상업 합의 난항` });
        world.rejections[name] = (world.rejections[name] ?? 0) + 1;
        world.lastRejected[name] = season;
      } else {
        const debutSeason = season + ENTRY_ODDS.prepSeasons;
        world.pending.push({ name, manufacturer, approvedSeason: season, debutSeason });
        world.usedNames.push(name);
        news.push({ season, kind: 'fom_agreed', team: name, text: `${name}, ${debutSeason}년 데뷔 확정` });
      }
    }
  }

  assertTeamInvariant(world);
  return { world, news };
}
