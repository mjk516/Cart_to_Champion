// 시즌 중 내구레이스 출전(SPEC §6 v0.32): 팀 안에서 입지가 단단한 F1 드라이버만, 여름 휴식기나 가을에 한 번.
// 훈련 계획을 짤 때 출전 여부를 고르고, 결과는 그 주가 지난 그랑프리 주말과 시즌 기록에 나온다.

import { type Career, type EnduranceResult, f1Calendar, inMilitary } from './careerCore';
import { ovr } from './data';
import { fixJosa } from './josa';
import { fictionalName } from './names';
import { pick, rngFor, type Rng } from './rng';
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
  /** 레이스 시간 */
  hours: number;
  /** 출전 클래스(Hypercar, GT3 등) */
  cls: string;
  /** 같은 클래스 차 수 */
  classCars: number;
  /** 밤·새벽에 비가 올 확률 */
  rain: number;
}

interface EnduranceEvent { name: string; when: string; hours: number; cls: string; classCars: number; rain: number }

/** 실제 내구레이스(SPEC v0.42). 여름은 24시간, 가을은 8~10시간 */
const SUMMER: EnduranceEvent[] = [
  { name: '르망 24시', when: '6월 그랑프리 사이 빈 주말', hours: 24, cls: 'Hypercar', classCars: 21, rain: 0.3 },
  { name: '스파 24시', when: '6월 말 그랑프리 사이 빈 주말', hours: 24, cls: 'GT3 Pro', classCars: 30, rain: 0.45 },
  { name: '뉘르부르크링 24시', when: '6월 그랑프리 사이 빈 주말', hours: 24, cls: 'SP9 GT3', classCars: 28, rain: 0.45 },
];
const AUTUMN: EnduranceEvent[] = [
  { name: '프티 르망', when: '10월 그랑프리 사이 빈 주말', hours: 10, cls: 'GTP', classCars: 12, rain: 0.25 },
  { name: '인디애나폴리스 8시간', when: '10월 그랑프리 사이 빈 주말', hours: 8, cls: 'GT3 Pro', classCars: 22, rain: 0.15 },
  { name: '바레인 8시간', when: '11월 그랑프리 사이 빈 주말', hours: 8, cls: 'Hypercar', classCars: 18, rain: 0.02 },
];

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
  const afterRound = summer ? Math.max(0, Math.round(rounds * 0.4) - 1) : Math.max(0, Math.round(rounds * 0.75) - 1);
  const pool = summer ? SUMMER : AUTUMN;
  const ev = pool[Math.floor(r() * pool.length)]!;
  return { ...ev, season: summer ? 'summer' : 'autumn', afterRound, teamSeasons };
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
export function enduranceResult(c: Career, choices?: EnduranceChoices): EnduranceOutcome | null {
  const offer = enduranceOffer(c);
  if (!offer) return null;
  // 하이라이트 중계에서 하나라도 고르면 구간별 모델로(고르지 않은 구간은 팀 기본값)
  if (choices && Object.keys(choices).length) return enduranceRun(c, choices)!.outcome;
  const r = rngFor(c.seed, 'endurance-result', c.year);
  const classCars = offer.classCars;
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
export function previewEndurance(c: Career, choices?: EnduranceChoices): string | null {
  const out = enduranceResult(c, choices);
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

// ── 하이라이트 중계(SPEC v0.42) ──────────────────────────────────────────────
// 레이스를 출발·밤·마지막 세 구간으로 나누고, 구간마다 플레이어가 한 번 고른다.
// 구간 i의 결과는 i번째까지의 선택에만 달려 있다(앞 구간을 보고 다음을 고른다). 고르지 않은 구간은 팀 기본값.

export type EnduranceStage = 'start' | 'night' | 'final';
export interface EnduranceChoices { start?: 'push' | 'save'; night?: 'push' | 'safe'; final?: 'attack' | 'hold' }
export const ENDURANCE_DEFAULT: Required<EnduranceChoices> = { start: 'save', night: 'safe', final: 'hold' };

export interface EnduranceStageInfo {
  id: EnduranceStage;
  title: (hours: number) => string;
  question: string;
  options: Array<{ id: string; label: string; hint: string }>;
}

export const ENDURANCE_STAGES: EnduranceStageInfo[] = [
  {
    id: 'start', title: () => '출발 스틴트', question: '첫 스틴트, 어떻게 갈까?',
    options: [
      { id: 'push', label: '처음부터 밀어붙인다', hint: '순위를 일찍 끌어올린다. 차·타이어 소모와 사고 위험이 크다' },
      { id: 'save', label: '차를 아낀다', hint: '순위 변화는 적지만 마지막 스틴트에 차 상태가 좋다' },
    ],
  },
  {
    id: 'night', title: (h) => (h >= 20 ? '야간 스틴트' : '해 질 녘 스틴트'), question: '어두워졌다. 어떻게 달릴까?',
    options: [
      { id: 'push', label: '어둠 속에서도 공격', hint: '느린 차를 과감하게 추월한다. 비가 오면 위험이 더 크다(우천 능력이 높으면 덜하다)' },
      { id: 'safe', label: '안전하게 랩을 쌓는다', hint: '실수 없이 차를 지킨다. 순위는 크게 안 오른다' },
    ],
  },
  {
    id: 'final', title: () => '마지막 스틴트', question: '체커기까지 얼마 안 남았다.',
    options: [
      { id: 'attack', label: '앞 차를 향해 공격', hint: '순위를 올릴 마지막 기회. 무리하면 다 잃을 수 있다' },
      { id: 'hold', label: '지금 순위를 지킨다', hint: '차를 끝까지 가져온다' },
    ],
  },
];

export interface EnduranceBeat {
  hour: number;
  /** 클래스 순위. 리타이어 뒤는 null */
  pos: number | null;
  text: string;
  kind: 'info' | 'swap' | 'incident' | 'rain' | 'finish' | 'dnf';
  /** 이 장면이 속한 구간(0 출발 전, 1~3 구간) */
  stage: 0 | 1 | 2 | 3;
}

export interface EnduranceRun {
  offer: EnduranceOffer;
  crew: [string, string];
  carNumber: number;
  grid: number;
  rain: boolean;
  /** 선택이 반영된 구간 수 이후는 아직 진행하지 않은 것이므로 화면은 stage ≤ 고른 수 장면만 보여 준다 */
  beats: EnduranceBeat[];
  /** 리타이어한 구간(1~3). 완주면 null */
  dnfStage: 1 | 2 | 3 | null;
  outcome: EnduranceOutcome;
}

/** 표준 정규분포 누적확률(근사) */
function phi(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
function gauss(r: Rng): number {
  const u = Math.max(1e-9, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}
/** 실력 지표 → 클래스 순위. 클래스 크기와 상관없이 포디움 비율은 같다(우승 3%, 2위 4%, 3위 5.5%) */
function posOf(x: number, classCars: number): number {
  const q = phi(-x);
  if (q < 0.03) return 1;
  if (q < 0.07) return 2;
  if (q < 0.125) return 3;
  return Math.min(classCars, 4 + Math.floor(((q - 0.125) / 0.875) * (classCars - 3)));
}

const STAGE_SIGMA = [0.5, 0.6, 0.5];
const MECH_DNF = 0.012;

export function enduranceRun(c: Career, choices: EnduranceChoices = {}): EnduranceRun | null {
  const offer = enduranceOffer(c);
  if (!offer) return null;
  const ch = { ...ENDURANCE_DEFAULT, ...choices };
  const o = ovr(c.driver.stats);
  const wet = c.driver.stats.wet;
  const me = c.driver.name;
  const H = offer.hours;
  const N = offer.classCars;

  const setup = rngFor(c.seed, 'endurance-setup', c.year);
  const rain = setup() < offer.rain;
  const carNumber = 2 + Math.floor(setup() * 97);
  const crewRng = rngFor(c.seed, 'endurance-crew', c.year);
  const avoid = new Set([me]);
  const a = fictionalName(crewRng, avoid); avoid.add(a.first);
  const b = fictionalName(crewRng, avoid);
  const crew: [string, string] = [a.name, b.name];

  let x = 0.34 + (o - 82) * 0.1 + gauss(setup) * 0.7;
  const grid = posOf(x, N);
  const beats: EnduranceBeat[] = [
    { hour: 0, pos: grid, stage: 0, kind: 'info', text: `#${carNumber} ${offer.cls} 클래스 ${N}대 중 P${grid}에서 출발한다. ${me}, ${crew[0]}, ${crew[1]}가 교대로 탄다.` },
  ];
  const bounds = [0, Math.round(H * 0.3), Math.round(H * 0.75), H];
  let dnfStage: 1 | 2 | 3 | null = null;

  const stages: Array<{ dx: number; dnf: number; choice: string }> = [
    { dx: ch.start === 'push' ? 0.15 : 0, dnf: ch.start === 'push' ? 0.03 : 0.01, choice: ch.start },
    {
      dx: ch.night === 'push' ? 0.2 + (rain ? (wet - 75) * 0.02 : 0) : 0,
      dnf: ch.night === 'push' ? 0.06 + (rain ? (wet < 75 ? 0.05 : 0.02) : 0) : 0.02 + (rain ? 0.01 : 0),
      choice: ch.night,
    },
    { dx: (ch.final === 'attack' ? 0.18 : 0) + (ch.start === 'save' ? 0.12 : 0), dnf: ch.final === 'attack' ? 0.03 : 0.005, choice: ch.final },
  ];

  for (let i = 0; i < 3; i++) {
    const st = (i + 1) as 1 | 2 | 3;
    const r = rngFor(c.seed, 'endurance-stage', c.year, i);
    const view = rngFor(c.seed, 'endurance-view', c.year, i);
    const s = stages[i]!;
    const from = bounds[i]!, to = bounds[i + 1]!;
    const x0 = x;
    const x1 = x0 + s.dx + gauss(r) * STAGE_SIGMA[i]!;
    const crash = r() < s.dnf;
    const mech = !crash && r() < MECH_DNF;
    const span = Math.max(1, to - from);
    const at = (f: number) => Math.min(to, from + Math.max(1, Math.round(span * f)));
    const mid = (f: number) => posOf(x0 + (x1 - x0) * f + gauss(view) * 0.15, N);

    // 구간 시작
    if (i === 0) {
      const p1 = mid(0.3);
      const up = p1 < grid, down = p1 > grid;
      const text = s.choice === 'push'
        ? (up ? `${me}, 1코너부터 과감하다. 앞 차들을 하나씩 넘어선다.` : down ? `${me}, 과감하게 파고들었지만 자리싸움에서 밀렸다.` : `${me}, 과감하게 붙어 보지만 앞 차가 문을 닫는다.`)
        : (down ? `${me}, 타이어를 아끼는 동안 몇 대가 지나갔다. 아직 긴 레이스다.` : `${me}, 타이어를 아끼며 리듬을 찾는다. 서두르지 않는다.`);
      beats.push({ hour: at(0.15), pos: p1, stage: st, kind: 'info', text });
    } else if (i === 1) {
      beats.push({ hour: from, pos: posOf(x0, N), stage: st, kind: 'swap', text: `${me}가 다시 운전대를 잡았다. ${H >= 20 ? '밤이 내려앉았다. 헤드라이트만 보인다.' : '해가 지고 있다. 노면 온도가 떨어진다.'}` });
      if (rain) beats.push({ hour: at(0.35), pos: mid(0.35), stage: st, kind: 'rain', text: H >= 20 ? '새벽 비가 쏟아진다. 레인 타이어로 바꿨다.' : '비가 내리기 시작했다. 레인 타이어로 바꿨다.' });
      else if (s.choice === 'push') beats.push({ hour: at(0.35), pos: mid(0.4), stage: st, kind: 'info', text: '느린 클래스 차들 사이로 과감하게 파고든다.' });
    } else {
      beats.push({ hour: from, pos: posOf(x0, N), stage: st, kind: 'swap', text: `마지막 스틴트는 ${me}가 맡았다. 팀은 가장 빠른 드라이버에게 체커기를 맡긴다.` });
    }

    if (crash || mech) {
      const hour = at(0.4 + view() * 0.4);
      const text = crash
        ? (s.choice === 'push' || s.choice === 'attack'
          ? pick(view, [`무리한 추월 시도가 백마커와 얽혔다. 방호벽에 부딪혀 차가 멈췄다. 리타이어.`, `한계를 넘었다. 스핀 끝에 차가 크게 부서졌다. 리타이어.`])
          : `앞에서 일어난 사고를 피하지 못했다. 서스펜션이 부러져 리타이어.`)
        : pick(view, ['기어박스가 말을 듣지 않는다. 차고로 들어갔다. 리타이어.', '엔진 경고등이 켜졌다. 팀이 차를 세웠다. 리타이어.']);
      beats.push({ hour, pos: null, stage: st, kind: 'dnf', text });
      dnfStage = st;
      break;
    }

    // 구간 중 사건(코스메틱)
    if (view() < 0.5) {
      beats.push({ hour: at(0.55), pos: mid(0.55), stage: st, kind: 'incident', text: pick(view, ['다른 클래스 차 사고로 세이프티카가 나왔다. 간격이 줄었다.', '코드 60 구간(슬로 존)이 걸렸다. 피트 타이밍을 맞췄다.', '연석에 크게 올라탔다. 다행히 차는 멀쩡하다.']) });
    }
    if (i < 2) {
      const mate = crew[i]!;
      beats.push({ hour: at(0.75), pos: mid(0.75), stage: st, kind: 'swap', text: `피트 스톱. ${mate}에게 차를 넘겼다.` });
    }
    x = x1;
    const p = posOf(x, N);
    if (i === 0) {
      beats.push({ hour: to, pos: p, stage: st, kind: 'info', text: `${to}시간 경과. 클래스 P${p}.${rain ? ` 엔지니어: "${H >= 20 ? '밤사이' : '해 질 녘에'} 비 예보가 있다."` : ''}` });
    } else if (i === 1) {
      beats.push({ hour: to, pos: p, stage: st, kind: 'info', text: `${to}시간 경과. 클래스 P${p}. 남은 시간 ${H - to}시간.` });
    } else {
      if (s.choice === 'attack') beats.push({ hour: Math.max(from + 1, to - 1), pos: mid(0.85), stage: st, kind: 'info', text: '마지막 1시간, 앞 차 뒤에 바짝 붙었다.' });
      beats.push({ hour: H, pos: p, stage: st, kind: 'finish', text: p === 1 ? `체커기! ${offer.name} 클래스 우승!` : p <= 3 ? `체커기! 클래스 ${p}위, 포디움!` : `체커기. 클래스 ${p}위로 완주했다.` });
    }
  }

  const position = dnfStage ? null : posOf(x, N);
  const base = { name: offer.name, when: offer.when, classCars: N };
  let outcome: EnduranceOutcome;
  if (position === null) {
    outcome = { ...base, position: null, gains: {}, text: `${dnfStage === 1 ? '초반' : dnfStage === 2 ? (H >= 20 ? '밤사이' : '해 질 녘') : '막판'}에 리타이어했다. F1 팀이 "다음엔 신중하자"고 했다.` };
  } else if (position <= 3) {
    const gains: Partial<Record<StatKey, number>> = position === 1
      ? { racecraft: 2, wet: 1, consistency: 1, tyre: 1 }
      : position === 2 ? { racecraft: 1, consistency: 1, tyre: 1 } : { consistency: 1, tyre: 1 };
    outcome = { ...base, position, gains, text: position === 1 ? `${offer.name} 클래스 우승! 내구레이스 팬들까지 이름을 외웠다.` : `팀과 교대로 버틴 끝에 클래스 ${position}위로 포디움에 올랐다. 긴 레이스에서 페이스를 지키는 법을 몸으로 익혔다.` };
  } else {
    outcome = { ...base, position, gains: {}, text: `클래스 ${position}위로 완주했다. 포디움에는 못 올랐지만 좋은 경험이었다.` };
  }
  for (const b of beats) b.text = fixJosa(b.text, [me, ...crew]);
  return { offer, crew, carNumber, grid, rain, beats, dnfStage, outcome };
}

/** 내구레이스 기사 */
export function enduranceArticle(c: Career, run: EnduranceRun): { outlet: string; headline: string; body: string[] } {
  const r = rngFor(c.seed, 'endurance-article', c.year);
  const me = c.driver.name;
  const { offer, outcome } = run;
  const pos = outcome.position;
  const headline = pos === null
    ? pick(r, [`F1 드라이버 ${me}의 ${offer.name} 도전, 리타이어로 끝나`, `${offer.name}, ${me}에게는 쓴 경험`])
    : pos === 1 ? pick(r, [`${me}, ${offer.name} ${offer.cls} 클래스 우승!`, `F1 드라이버의 반란, ${me} ${offer.name} 정상`])
      : pos <= 3 ? pick(r, [`${me}, ${offer.name} 클래스 ${pos}위 포디움`, `${offer.name} 데뷔 무대에서 포디움 오른 ${me}`])
        : pick(r, [`${me}, ${offer.name} 클래스 ${pos}위 완주`, `${offer.name} 완주한 ${me}, "많이 배웠다"`]);
  const body = [
    `${offer.when}에 열린 ${offer.name}(${offer.hours}시간)에 F1 드라이버 ${me}가 ${offer.cls} 클래스로 출전했다. ${run.crew[0]}, ${run.crew[1]}와 #${run.carNumber}를 나눠 탔다.`,
    `클래스 ${offer.classCars}대 중 P${run.grid}에서 출발해 ${pos === null ? '끝까지 가지 못했다' : `P${pos}로 체커기를 받았다`}.${run.rain ? ' 레이스 도중 비가 내려 변수가 컸다.' : ''}`,
    run.beats.find((b) => b.kind === 'dnf')?.text ?? outcome.text,
  ];
  const fx = (t: string) => fixJosa(t, [me, ...run.crew]);
  return { outlet: pick(r, ['내구레이스 위클리', '모터스포츠 데일리', '피트레인 리포트']), headline: fx(headline), body: body.map(fx) };
}
