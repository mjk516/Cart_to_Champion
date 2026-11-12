// 선수 매니저와 오프시즌 조언(SPEC §7 v0.15).
// 조언은 읽기 전용이다: 결과를 바꾸지 않고, 선택은 늘 플레이어가 한다(랭킹 검증에 영향 없음).

import { josa } from './josa';
import type { Career, Offseason } from './career';
import { F1_WINNER_TEAMS, ovr } from './data';
import { fictionalName } from './names';
import { int, pick, rngFor } from './rng';
import { LADDER, SERIES, seriesLabel } from './series';

export type ManagerStyle = 'growth' | 'money' | 'stable';
export const MANAGER_STYLE_LABEL: Record<ManagerStyle, string> = { growth: '성장 우선', money: '실리 우선', stable: '안정 우선' };

export interface Manager {
  name: string;
  style: ManagerStyle;
  /** 1~5. 4 이상이면 F1 예상 순위까지 계산해 준다 */
  skill: number;
}

const KR_NAMES = ['박정훈', '이서연', '최민호', '한지우', '정다은', '오세진', '윤태경', '강하린'];

export function generateManager(seed: number, salt: string | number, nationality: string, minSkill = 1): Manager {
  const r = rngFor(seed, 'manager', salt);
  const name = nationality === 'KR' ? pick(r, KR_NAMES) : fictionalName(r).name;
  const style = pick(r, ['growth', 'money', 'stable'] as const);
  return { name, style, skill: Math.min(5, Math.max(minSkill, int(r, 1, 4))) };
}

/** 저장 파일에 매니저가 없으면 시드로 정한다(이전 저장 파일 호환) */
export function managerOf(c: Career): Manager {
  return c.manager ?? generateManager(c.seed, 'first', c.driver.nationality);
}

export type Verdict = 'recommend' | 'ok' | 'avoid';
export const VERDICT_LABEL: Record<Verdict, string> = { recommend: '추천', ok: '괜찮음', avoid: '비추천' };

export interface OfferAdvice { score: number; verdict: Verdict; reasons: string[] }

export interface ManagerAdvice {
  manager: Manager;
  headline: string;
  recommendedOfferId: string | null;
  perOffer: Record<string, OfferAdvice>;
  academy?: string;
  release?: string;
  retire?: string;
}

const TOP4 = F1_WINNER_TEAMS as readonly string[];

function eur(v: number): string {
  return v >= 1_000_000 ? `€${(v / 1_000_000).toFixed(1)}M` : `€${Math.round(v / 1000)}k`;
}

export function managerAdvice(c: Career, off: Offseason): ManagerAdvice {
  const m = managerOf(c);
  const last = c.history[c.history.length - 1]!;
  const age = c.age + 1;
  const now = ovr(c.driver.stats);
  const sl = c.history.filter((h) => h.year > c.year - 3).reduce((a, h) => a + h.superLicence, 0);
  const juniorRaceAvailable = off.offers.some((o) => o.series !== 'f1' && o.seat === 'race' && o.affordable);
  const teamsByQuality = [...c.world.teams.teams].sort((a, b) => b.quality - a.quality);

  const perOffer: Record<string, OfferAdvice> = {};
  for (const o of off.offers) {
    const reasons: string[] = [];
    let s = 0;
    const rank = LADDER.indexOf(o.series);
    if (o.series === 'f1') {
      if (o.seat === 'race') {
        s += 100;
        const qRank = teamsByQuality.findIndex((t) => t.id === o.teamId) + 1;
        if (o.teamId && TOP4.includes(o.teamId)) {
          s += 35;
          reasons.push('메이저 팀이야. 이 차면 챔피언십 8위 안은 거의 보장돼');
        } else {
          s += Math.max(0, (o.teamQuality - 0.84) * 300);
          reasons.push(`F1 레이스 시트야. 차 성능은 ${teamsByQuality.length}팀 중 ${qRank}위권`);
        }
        if (m.skill >= 4 && qRank > 0) reasons.push(`내 계산으로는 챔피언십 ${Math.max(1, qRank * 2 - 2)}~${qRank * 2 + 1}위 정도가 현실적이야`);
        if (o.salary > 0) {
          s += Math.min(m.style === 'money' ? 30 : 10, (o.salary / 1_000_000) * (m.style === 'money' ? 1.5 : 0.4));
          if (m.style === 'money' || o.salary >= 5_000_000) reasons.push(`연봉 ${eur(o.salary)}`);
        }
        if (o.seatCost > 0) {
          // 시트를 사는 비용이 클수록 감점. 실리 우선 매니저는 세 배로 따진다
          s -= 8 + (o.seatCost / 1_000_000) * (m.style === 'money' ? 3 : 1);
          reasons.push(`시트를 사는 조건이야(${eur(o.seatCost)}). 성적으로 증명해야 다음 계약이 나와`);
        }
      } else {
        s += 30;
        if (age <= 24 && juniorRaceAvailable) {
          s -= 25;
          reasons.push('리저브는 레이스를 못 뛰어서 성장이 멈춰. 아직은 레이스 시트가 낫다');
        } else {
          reasons.push('리저브로 F1 팀 안에 있으면 다음 기회를 노리기 좋아');
        }
      }
    } else {
      s += 20 + rank * 12;
      s += o.facility * (m.style === 'growth' ? 25 : 12);
      if (o.facility >= 0.85) reasons.push('시설이 좋아서 훈련 효율이 높아');
      if (o.teamQuality >= 0.9) reasons.push(`${seriesLabel(o.series)} 상위 팀이라 우승 경쟁이 가능해`);
      if (rank > LADDER.indexOf(last.series)) {
        const def = SERIES[o.series as Exclude<typeof o.series, 'f1'>];
        const mid = (def.aiOvr[0] + def.aiOvr[1]) / 2;
        if (now < mid - 2) { s -= 18; reasons.push(`${josa(seriesLabel(o.series), '은/는')} 아직 이를 수 있어. 지금 실력으로는 중위권 아래야`); }
        else { s += 8; reasons.push(`${seriesLabel(o.series)}로 올라갈 준비가 됐어`); }
      }
      if (o.series === 'f2' && last.series === 'f2' && sl < 40) { s += 15; reasons.push(`슈퍼 라이선스가 ${sl}/40점이야. F2에서 포인트를 더 쌓자`); }
      if (o.management) {
        s -= m.style === 'money' ? 10 : 4;
        reasons.push('매니지먼트 후원 조건이야. F1에 가면 8년 동안 연봉 15%를 내야 해');
      } else if (o.seatCost > 0 && !c.academy && o.seatCost > Math.max(1, c.funds) * 0.6) {
        s -= m.style === 'money' ? 12 : 5;
        reasons.push(`시트 비용 ${josa(eur(o.seatCost), '이/가')} 자금의 큰 몫이야`);
      }
    }
    if (o.id === 'stay') { s += m.style === 'stable' ? 12 : 4; reasons.push('지금 팀과 계약이 남아 있어. 새로 적응할 필요가 없지'); }
    // 모든 제안에 최소 한 줄의 이유
    if (!reasons.length) {
      if (o.series === last.series && o.team === last.team) reasons.push(`${o.team}에서 한 시즌 더 경험을 쌓을 수 있어`);
      else if (o.series === last.series) reasons.push(`${seriesLabel(o.series)}에서 팀을 바꿔 새로 시작하는 자리야. 팀 성능은 ${o.teamQuality >= 0.85 ? '중상위' : '중하위'} 수준`);
      else reasons.push(`${seriesLabel(o.series)} 시트야`);
    }
    if (!o.affordable) { s = -999; reasons.unshift('지금 자금으로는 감당할 수 없어'); }
    perOffer[o.id] = { score: Math.round(s), verdict: 'avoid', reasons };
  }

  const ranked = Object.entries(perOffer).sort((a, b) => b[1].score - a[1].score);
  const best = ranked[0];
  for (const [id, a] of ranked) {
    a.verdict = best && id === best[0] && a.score > 0 ? 'recommend' : best && a.score > 0 && a.score >= best[1].score - 15 ? 'ok' : 'avoid';
  }
  const recommendedOfferId = best && best[1].score > 0 ? best[0] : null;
  const recOffer = off.offers.find((o) => o.id === recommendedOfferId);

  const prefix = m.style === 'growth' ? '지금은 성장이 먼저야.' : m.style === 'money' ? '현실적으로 보자.' : '무리하지 말자.';
  let headline: string;
  if (!recOffer) {
    headline = age >= 30
      ? '제안이 마땅치 않아. 은퇴도 진지하게 생각해 볼 때야.'
      : '이번엔 받을 만한 제안이 없어. 1년 쉬면서 몸을 만들고 다음 기회를 노리자.';
  } else {
    const what = recOffer.id === 'stay' ? '지금 팀에 남자' : `${recOffer.team}${recOffer.seat === 'reserve' ? ' 리저브' : ''}로 가자`;
    headline = `${prefix} ${what}. ${perOffer[recOffer.id]!.reasons[0] ?? ''}`.trim();
  }

  const advice: ManagerAdvice = { manager: m, headline, recommendedOfferId, perOffer };
  if (off.academyOffer) advice.academy = `${off.academyOffer} 제안은 받아들이자. 시트 비용을 지원받고 F1 계열 팀 우선권이 생겨.`;
  if (off.released) advice.release = '방출은 아프지만 끝이 아니야. 받아 주는 팀으로 빨리 가서 증명하자.';
  const hasF1Race = off.offers.some((o) => o.series === 'f1' && o.seat === 'race' && o.affordable);
  if (age >= 38 && (!hasF1Race || last.growth.aging < 0)) advice.retire = '능력치가 내려가기 시작했어. 박수받을 때 물러나는 것도 멋진 선택이야.';
  return advice;
}
