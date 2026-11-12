// 시즌 중 내구레이스 출전(SPEC §6 v0.32): 팀 안에서 입지가 단단한 F1 드라이버만, 여름 휴식기나 가을에 한 번.
// 훈련 계획을 짤 때 출전 여부를 고르고, 결과는 그 주가 지난 그랑프리 주말과 시즌 기록에 나온다.

import { type Career, type EnduranceResult, f1Calendar, inMilitary } from './careerCore';
import { ovr } from './data';
import { rngFor } from './rng';
import { type StatKey } from './types';

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

const STAT_KO: Record<StatKey, string> = {
  pace: '페이스', racecraft: '레이스크래프트', consistency: '일관성', wet: '우천', tyre: '타이어 관리', feedback: '피드백',
};

const ENDURANCE_DNF = 0.1;

/** 화면 안내용 확률. podium은 완주했을 때 포디움에 오를 확률 */
export function enduranceOdds(ovrValue: number): { dnf: number; podium: number } {
  return { dnf: ENDURANCE_DNF, podium: Math.min(0.65, Math.max(0.15, 0.25 + (ovrValue - 82) * 0.03)) };
}

export interface EnduranceOutcome extends EnduranceResult {
  text: string;
}

/**
 * 내구레이스 결과(SPEC v0.34). 실력(OVR)이 높을수록 포디움 확률이 높다.
 * 포디움이면 능력치가 실제로 오른다(잠재력 한도를 넘어 +1~+2, 99까지). 포디움이 아니면 능력치 변화는 없다.
 */
export function enduranceResult(c: Career): EnduranceOutcome | null {
  const offer = enduranceOffer(c);
  if (!offer) return null;
  const r = rngFor(c.seed, 'endurance-result', c.year);
  const classCars = 28;
  const o = ovr(c.driver.stats);
  const dnf = r() < ENDURANCE_DNF;
  const podiumP = enduranceOdds(o).podium;
  const base = { name: offer.name, when: offer.when, classCars };
  if (dnf) {
    return { ...base, position: null, gains: {}, text: '밤사이 다른 차와 얽혀 리타이어했다. F1 팀이 "다음엔 신중하자"고 했다.' };
  }
  if (r() < podiumP) {
    const roll = r();
    const position = roll < 0.4 ? 1 : roll < 0.72 ? 2 : 3;
    const gains: Partial<Record<StatKey, number>> = position === 1
      ? { racecraft: 2, wet: 1, consistency: 1, tyre: 1 }
      : position === 2 ? { racecraft: 1, consistency: 1, tyre: 1 } : { consistency: 1, tyre: 1 };
    const text = position === 1
      ? '새벽 빗속 스틴트에서 차이를 벌렸다. 클래스 우승! 내구레이스 팬들까지 이름을 외웠다.'
      : `팀과 교대로 버틴 끝에 클래스 ${position}위로 포디움에 올랐다. 긴 레이스에서 페이스를 지키는 법을 몸으로 익혔다.`;
    return { ...base, position, gains, text };
  }
  const position = 4 + Math.floor(r() * r() * (classCars - 4));
  return { ...base, position, gains: {}, text: `클래스 ${position}위로 완주했다. 포디움에는 못 올랐지만 좋은 경험이었다.` };
}

/** 결과 한 줄(“클래스 2위 · 레이스크래프트 +1 …”) */
export function enduranceLine(e: EnduranceResult): string {
  const pos = e.position === null ? '리타이어' : e.position === 1 ? '클래스 우승' : `클래스 ${e.position}위 / ${e.classCars}대`;
  const g = Object.entries(e.gains).map(([k, v]) => `${STAT_KO[k as StatKey]} +${v}`);
  return g.length ? `${pos} · ${g.join(', ')}` : pos;
}

/** 출전 결과 문장(라이브 시즌 중 미리 보여 줄 때). runSeason에서 실제로 적용되는 결과와 같다 */
export function previewEndurance(c: Career): string | null {
  const out = enduranceResult(c);
  return out ? out.text : null;
}

/** runSeason 안에서 출전 결과를 적용하고 이벤트 기록·시즌 메모에 남긴다 */
export function applyEndurance(c: Career, notes: string[], out: EnduranceOutcome): EnduranceResult {
  const gains: Partial<Record<StatKey, number>> = {};
  for (const [k, v] of Object.entries(out.gains) as [StatKey, number][]) {
    const cur = c.driver.stats[k];
    const next = Math.min(99, cur + v);
    if (next > cur) { c.driver.stats[k] = next; gains[k] = next - cur; }
  }
  const summary: string[] = Object.entries(gains).map(([k, v]) => `${STAT_KO[k as StatKey]} +${v}`);
  const podium = out.position !== null && out.position <= 3;
  const fol = out.position === null ? 1.03 : out.position === 1 ? 1.15 : podium ? 1.08 : 1.04;
  c.media.followers = Math.round(c.media.followers * fol);
  summary.push(`팔로워 +${Math.round((fol - 1) * 100)}%`);
  if (podium) {
    const rep = out.position === 1 ? 5 : 3;
    c.media.reputation = Math.min(100, c.media.reputation + rep);
    summary.push(`언론 평판 +${rep}`);
  }
  if (out.position === null) {
    c.media.pressure = Math.min(100, c.media.pressure + 8);
    c.flags = { ...(c.flags ?? {}), releaseRisk: (c.flags?.releaseRisk ?? 0) + 0.03 };
    summary.push('압박 +8', '팀 내 입지 흔들림(방출 위험 증가)');
  }
  const result: EnduranceResult = { name: out.name, when: out.when, position: out.position, classCars: out.classCars, gains };
  c.eventLog = [...(c.eventLog ?? []), {
    year: c.year, id: ENDURANCE_EVENT_ID, title: `${out.name} (${out.when})`, option: enduranceLine(result), text: out.text, summary,
  }];
  notes.push(`${out.when}에 ${out.name} 출전: ${enduranceLine(result)}`);
  return result;
}
