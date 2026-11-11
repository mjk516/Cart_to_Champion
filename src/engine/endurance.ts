// 시즌 중 내구레이스 출전(SPEC §6 v0.32): 팀 안에서 입지가 단단한 F1 드라이버만, 여름 휴식기나 가을에 한 번.
// 훈련 계획을 짤 때 출전 여부를 고르고, 결과는 그 주가 지난 그랑프리 주말과 시즌 기록에 나온다.

import { type Career, f1Calendar, inMilitary } from './careerCore';
import { applyEventChoice, EVENT_BY_ID } from './events';
import { rngFor } from './rng';

export const ENDURANCE_EVENT_ID = 'endurance_race';

export interface EnduranceOffer {
  /** 대회 이름 */
  name: string;
  season: 'summer' | 'autumn';
  /** "8월 여름 휴식기" 같은 시기 설명 */
  when: string;
  /** 이 라운드(0부터)를 마친 뒤에 열린다 */
  afterRound: number;
  /** 이 F1 팀에서 보낸 시즌 수(지난 시즌까지) */
  teamSeasons: number;
}

const SUMMER = ['GT3 24시간 내구레이스', '여름 GT 24시간 클래식', '한여름 GT3 24시간 레이스'];
const AUTUMN = ['가을 GT 12시간 레이스', '가을 GT3 내구 시리즈 최종전', '가을 스포츠카 10시간 레이스'];

/**
 * 이번 시즌 내구레이스 출전 제안. 조건(팀 안 입지):
 * F1 레이스 시트, 지난 시즌도 같은 팀 레이스 시트였고 팀메이트를 50% 이상 이겼다, 20~38세, 군 복무 중이 아님
 */
export function enduranceOffer(c: Career): EnduranceOffer | null {
  const k = c.contract;
  if (!k || k.series !== 'f1' || k.seat !== 'race' || c.retired || inMilitary(c)) return null;
  if (c.age < 20 || c.age > 38) return null;
  const last = c.history[c.history.length - 1];
  if (!last || last.series !== 'f1' || last.seat !== 'race' || last.team !== k.team || last.teammateBeat < 0.5) return null;
  let teamSeasons = 0;
  for (let i = c.history.length - 1; i >= 0; i--) {
    const h = c.history[i]!;
    if (h.series === 'f1' && h.seat === 'race' && h.team === k.team) teamSeasons++;
    else break;
  }
  const r = rngFor(c.seed, 'endurance-offer', c.year);
  const summer = r() < 0.6;
  const rounds = f1Calendar(c).length;
  const afterRound = summer ? Math.max(0, Math.ceil(rounds / 2) - 1) : Math.max(0, Math.round(rounds * 0.75) - 1);
  const pool = summer ? SUMMER : AUTUMN;
  return {
    name: pool[Math.floor(r() * pool.length)]!,
    season: summer ? 'summer' : 'autumn',
    when: summer ? '8월 여름 휴식기' : '10월 그랑프리 사이 빈 주말',
    afterRound,
    teamSeasons,
  };
}

/** 출전 결과 문장(라이브 시즌 중 미리 보여 줄 때). runSeason에서 실제로 적용되는 결과와 같다 */
export function previewEndurance(c: Career): string | null {
  if (!enduranceOffer(c)) return null;
  return applyEventChoice(structuredClone(c), ENDURANCE_EVENT_ID, 'race').text;
}

/** runSeason 안에서 출전 결과를 적용하고 이벤트 기록·시즌 메모에 남긴다 */
export function applyEndurance(c: Career, notes: string[]): void {
  const offer = enduranceOffer(c);
  if (!offer) return;
  const out = applyEventChoice(c, ENDURANCE_EVENT_ID, 'race');
  const def = EVENT_BY_ID.get(ENDURANCE_EVENT_ID)!;
  c.eventLog = [...(c.eventLog ?? []), {
    year: c.year, id: ENDURANCE_EVENT_ID, title: `${offer.name} (${offer.when})`, option: def.options[0]!.label, text: out.text, summary: out.summary,
  }];
  notes.push(`${offer.when}에 ${offer.name} 출전: ${out.summary.join(', ') || '변화 없음'}`);
}
