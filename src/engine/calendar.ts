// F1 캘린더 변화(SPEC §2.1 v0.17): 해마다 낮은 확률로 한 곳이 빠지고 한 곳이 들어온다.
// 들어오는 서킷은 21세기에 F1 그랑프리를 한 번 이상 치른 실제 서킷만 쓴다.
// 오프시즌에 시드로 정하므로 선택 로그 재현과 랭킹 검증에 그대로 맞는다.

import type { Circuit } from './types';
import { rngFor } from './rng';

function c(
  id: string, name: string, country: string, laps: number, lengthKm: number, baseLap: number,
  overtakeEase: number, street: boolean, rainChance: number, pitLoss: number, deg: number,
): Circuit {
  return { id, name, country, laps, lengthKm, baseLap, overtakeEase, street, rainChance, pitLoss, deg, sprint: false };
}

/** 2026 캘린더에는 없지만 21세기에 F1을 치른 서킷(마지막 개최 연도). 실제 레이아웃 데이터가 있는 곳만 */
export const RETURNING_CIRCUITS: Circuit[] = [
  c('imola', 'Imola', 'IT', 63, 4.909, 77, 0.2, false, 0.3, 28, 1.0), // 2025
  c('portimao', 'Portimão', 'PT', 66, 4.653, 81, 0.45, false, 0.1, 21, 1.1), // 2021
  c('istanbul', 'Istanbul Park', 'TR', 58, 5.338, 88, 0.55, false, 0.2, 22, 1.2), // 2021
  c('sepang', 'Sepang', 'MY', 56, 5.543, 96, 0.6, false, 0.45, 21, 1.3), // 2017
  c('hockenheim', 'Hockenheimring', 'DE', 67, 4.574, 76, 0.55, false, 0.3, 17, 1.0), // 2019
  c('nurburgring', 'Nürburgring', 'DE', 60, 5.148, 92, 0.4, false, 0.35, 20, 1.0), // 2020
  c('paul_ricard', 'Paul Ricard', 'FR', 53, 5.842, 95, 0.45, false, 0.1, 22, 1.0), // 2022
  c('magny_cours', 'Magny-Cours', 'FR', 70, 4.411, 77, 0.3, false, 0.2, 21, 1.0), // 2008
  c('mugello', 'Mugello', 'IT', 59, 5.245, 80, 0.25, false, 0.1, 25, 1.2), // 2020
  c('indianapolis', 'Indianapolis', 'US', 73, 4.192, 73, 0.6, false, 0.15, 21, 0.9), // 2007
];

export interface CalendarSlot { id: string; sprint: boolean }

/** 해마다 캘린더가 바뀔 확률. 평균 10년에 한 번 정도 */
export const CALENDAR_CHANGE_CHANCE = 0.1;
/** 첫 변화가 가능한 시즌 */
export const CALENDAR_CHANGE_FROM = 2028;
/** 한 번 바뀐 뒤 이 기간(시즌)은 바뀌지 않는다 */
export const CALENDAR_COOLDOWN = 4;
/** 빠진 서킷은 이 기간(시즌) 동안 돌아오지 않는다 */
export const CALENDAR_RETURN_GAP = 8;
/** 잘 빠지지 않는 전통 서킷(빠질 가중치 1/5) */
const CLASSICS = ['monaco', 'italy', 'britain', 'japan', 'belgium'];

export interface CalendarChange { season: number; out: string; in: string }

/**
 * 다음 시즌 캘린더. 확률에 걸리면 한 곳을 빼고 그 자리에 복귀 서킷을 넣는다(라운드 수와 스프린트 수는 그대로).
 * 개막전과 최종전은 빼지 않는다. knownIds는 들어올 수 있는 모든 서킷(2026 캘린더 + 복귀 후보)이라
 * 빠진 서킷도 나중에 다시 돌아올 수 있다.
 */
export function evolveCalendar(
  slots: CalendarSlot[], season: number, seed: number, knownIds: string[], past: CalendarChange[] = [],
): { slots: CalendarSlot[]; change: CalendarChange | null } {
  const r = rngFor(seed, 'calendar', season);
  if (season < CALENDAR_CHANGE_FROM || r() >= CALENDAR_CHANGE_CHANCE) return { slots, change: null };
  if (past.some((p) => season - p.season < CALENDAR_COOLDOWN)) return { slots, change: null };
  const inCal = new Set(slots.map((s) => s.id));
  const recentlyOut = new Set(past.filter((p) => season - p.season < CALENDAR_RETURN_GAP).map((p) => p.out));
  const pool = knownIds.filter((id) => !inCal.has(id) && !recentlyOut.has(id));
  if (!pool.length) return { slots, change: null };
  const candidates = slots.map((s, i) => ({ i, w: i === 0 || i === slots.length - 1 ? 0 : CLASSICS.includes(s.id) ? 0.2 : 1 }));
  const total = candidates.reduce((a, x) => a + x.w, 0);
  let roll = r() * total;
  const out = candidates.find((x) => (roll -= x.w) < 0) ?? candidates[1]!;
  const inId = pool[Math.floor(r() * pool.length)]!;
  const next = slots.map((s, i) => (i === out.i ? { id: inId, sprint: s.sprint } : s));
  return { slots: next, change: { season, out: slots[out.i]!.id, in: inId } };
}
