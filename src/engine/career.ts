// 커리어 루프(SPEC §1, §2, §4, §6.1, §7, §8, §9).
// 흐름: createCareer → [runSeason → getOffseason → applyOffseason] 반복 → 은퇴.
// 모든 난수는 커리어 시드에서 나오고, 플레이어의 선택은 choiceLog에 남는다(랭킹 검증 §9).
// 실제 구현은 careerCore(타입·공통 규칙), careerCreate(생성), season(시즌), offseason(오프시즌)으로 나뉘어 있고,
// 이 파일은 그것들을 한데 내보내고 자동 진행(autoplay·replay)을 둔다.

export * from './careerCore';
export * from './careerCreate';
export * from './season';
export * from './offseason';

import { draftedNext, type Career, type CareerSetup, type ChoiceLogEntry, type EventLogEntry, type Offseason, type OffseasonChoice } from './careerCore';
import { applyOffseason, getOffseason } from './offseason';
import { createCareer } from './careerCreate';
import { runSeason } from './season';
import { applyEventChoice, EVENT_BY_ID, eventCard, type EventCard } from './events';
import { recommendedPlan, TRAINING_SLOTS, TRAINING_SLOTS_RESERVE, type TrainingId } from './growth';
import { postTrainingAdvice } from './coach';
import { LADDER, type SeriesId } from './series';

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
    const choice = defaultOffseasonChoice(c, o);
    return choice.retire ? choice : { ...choice, postTraining: postTrainingAdvice(c) };
  },
};

function defaultOffseasonChoice(c: Career, o: Offseason): OffseasonChoice {
  {
    // 입대 직전이나 복무 중에는 기다린다
    if (draftedNext(c) || (c.military && c.year < c.military.end)) return { offerId: null };
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
  }
}

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
    if (entry.kind === 'training') c = runSeason(c, entry.plan, entry.radio ?? {}, { endurance: entry.endurance, enduranceChoices: entry.enduranceChoices, sns: entry.sns, strategy: entry.strategy }).career;
    else if (entry.kind === 'event') c = resolveEvent(c, entry.eventId, entry.optionId).career;
    else c = applyOffseason(c, entry.choice);
  }
  return c;
}
