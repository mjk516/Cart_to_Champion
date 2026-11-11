// 전환점 이벤트(SPEC §6). 시즌이 끝나면 0~2개가 뜨고, 선택에 따라 확률로 결과가 정해진다.
// 결과는 능력치·자금·언론/팬 지표·다음 오프시즌 플래그(스카우트, 방출 위험)에 반영된다.
// 이벤트 선택은 choiceLog에 남아 replayCareer로 재현된다(SPEC §9).

import type { Career, SeasonRecord } from './career';
import { PERSONALITIES } from './creation';
import { rngFor, weightedPick, type Rng } from './rng';
import { generateManager } from './manager';
import { CALENDAR_2026, circuitById } from './data';
import { INTERVIEWS, MORE_EVENTS } from './eventsMore';
import { ACADEMIES, type SeriesId } from './series';
import { STAT_KEYS, type Personality, type Stats, type WealthTier } from './types';

export type EventCategory = 'training' | 'offtrack' | 'career' | 'life' | 'interview';
export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = { training: '훈련', offtrack: '패독 밖', career: '커리어', life: '생활', interview: '기자회견' };

export interface EventEffect {
  /** 능력치 영구 변화 */
  stats?: Partial<Stats>;
  /** 자금 변화: 시리즈 규모 × €10k 단위(카트 1, F4 2, FRECA 3, F3 5, F2 8, F1 30) */
  fundsUnits?: number;
  /** 자금 변화: 현재 자금의 비율 */
  fundsFraction?: number;
  reputation?: number;
  followersMul?: number;
  sentiment?: number;
  pressure?: number;
  /** 다음 오프시즌까지 유지되는 플래그(scoutBonus, releaseRisk) */
  flags?: Record<string, number>;
  joinAcademy?: boolean;
  /** 더 유능한 매니저로 교체 */
  newManager?: boolean;
  /** 가정을 꾸린다(영구): 멘탈 안정, 레이스 공격성 감소 */
  family?: boolean;
}

export interface EventOutcome {
  p: number;
  text: string;
  effect: EventEffect;
  /** 기질별 확률 배수(v0.20). 예: 도발 답변은 기질이 나쁘면 잘 먹히고, 좋으면 역풍이 잦다 */
  tempMul?: Partial<Record<'good' | 'neutral' | 'bad', number>>;
}
export interface EventOption { id: string; label: string; hint?: string; outcomes: EventOutcome[] }

export interface EventCtx {
  age: number;
  series: SeriesId;
  seat: 'race' | 'reserve' | 'none';
  wealthTier: WealthTier;
  personality: Personality;
  temperament: 'good' | 'neutral' | 'bad';
  pct: number;
  champion: boolean;
  wins: number;
  academy: boolean;
  funds: number;
  followers: number;
  hasTeammate: boolean;
  f1: boolean;
  /** 기대 평균 순위 − 실제 평균 순위(+면 기대 이상) */
  perf: number;
  /** 방금 끝난 시즌이 F1 데뷔 시즌 */
  f1Rookie: boolean;
  /** 캘린더에 자기 나라 그랑프리가 있다 */
  home: boolean;
  /** F1 레이스 시트 팀의 차 성능 순위(1 = 최고). F1 레이스 시트가 아니면 99 */
  teamRank: number;
  /** 팀메이트를 이긴 비율 0~1 */
  teammateBeat: number;
  /** 가정이 있다 */
  family: boolean;
}

export interface EventDef {
  id: string;
  category: EventCategory;
  title: string;
  /** {name} {team} {amount} 치환 */
  text: string;
  when: (x: EventCtx) => boolean;
  weight?: (x: EventCtx) => number;
  /** {amount} 표시용 자금 단위 */
  amountUnits?: number;
  options: EventOption[];
}

export const SERIES_SCALE: Record<SeriesId, number> = { kart: 1, f4: 2, freca: 3, f3: 5, f2: 8, f1: 30 };
const JUNIOR = (s: SeriesId) => s !== 'f1';
const bad = (x: EventCtx) => (x.temperament === 'bad' ? 2.5 : x.temperament === 'neutral' ? 1.2 : 0.5);

const BASE_EVENTS: EventDef[] = [
  // ── 훈련 ──────────────────────────────────────────────────────────
  {
    id: 'sim_program', category: 'training', title: '시뮬레이터 집중 프로그램',
    text: '{team}의 엔지니어가 겨울 동안 시뮬레이터 집중 프로그램을 제안했다. 비용은 {amount}.',
    amountUnits: -3, when: (x) => x.age >= 14,
    options: [
      { id: 'join', label: '참가한다', hint: '속도·피드백 성장, 비용 발생', outcomes: [
        { p: 0.75, text: '한 바퀴 한 바퀴가 몸에 붙었다. 랩타임이 눈에 띄게 줄었다.', effect: { stats: { pace: 2, feedback: 1 }, fundsUnits: -3 } },
        { p: 0.25, text: '프로그램은 좋았지만 몸이 따라가지 못했다. 성과는 크지 않았다.', effect: { stats: { feedback: 1 }, fundsUnits: -3, pressure: 5 } },
      ] },
      { id: 'skip', label: '쉬면서 컨디션을 챙긴다', outcomes: [
        { p: 1, text: '충분히 쉬었다. 머리가 맑아졌다.', effect: { pressure: -8 } },
      ] },
    ],
  },
  {
    id: 'fitness_camp', category: 'training', title: '체력 캠프 초청',
    text: '유명 트레이너가 운영하는 3주짜리 체력 캠프에 자리가 났다.',
    when: (x) => x.age >= 13 && x.age <= 30,
    options: [
      { id: 'join', label: '캠프에 들어간다', hint: '일관성 성장, 드물게 부상', outcomes: [
        { p: 0.8, text: '목과 코어가 단단해졌다. 레이스 후반에도 집중력이 유지된다.', effect: { stats: { consistency: 2 } } },
        { p: 0.2, text: '무리하다 근육을 다쳤다. 겨울 내내 재활했다.', effect: { stats: { pace: -1 }, pressure: 8 } },
      ] },
      { id: 'skip', label: '혼자 훈련한다', outcomes: [
        { p: 1, text: '평소 하던 대로 몸을 만들었다.', effect: { stats: { consistency: 1 } } },
      ] },
    ],
  },
  {
    id: 'wet_test', category: 'training', title: '우천 테스트 초청',
    text: '비 예보가 있는 날 {team}이 우천 테스트를 잡았다. 차를 망가뜨리면 수리비 {amount}는 드라이버 몫이다.',
    amountUnits: -4, when: (x) => x.series !== 'kart',
    options: [
      { id: 'push', label: '한계까지 밀어붙인다', hint: '우천 크게 성장, 사고 위험', outcomes: [
        { p: 0.65, text: '물웅덩이 위에서 차와 대화하는 법을 배웠다.', effect: { stats: { wet: 3 } } },
        { p: 0.35, text: '스핀 끝에 방호벽. 수리비 {amount}를 물었다.', effect: { stats: { wet: 1 }, fundsUnits: -4, pressure: 5 } },
      ] },
      { id: 'safe', label: '안전하게 랩을 쌓는다', outcomes: [
        { p: 1, text: '차분하게 데이터를 모았다.', effect: { stats: { wet: 1, feedback: 1 } } },
      ] },
    ],
  },
  {
    id: 'mentor', category: 'training', title: '베테랑 엔지니어의 멘토링',
    text: '은퇴를 앞둔 베테랑 레이스 엔지니어가 셋업과 데이터 읽는 법을 가르쳐 주겠다고 했다.',
    when: (x) => ['f3', 'f2', 'f1'].includes(x.series),
    options: [
      { id: 'learn', label: '매주 찾아가 배운다', outcomes: [
        { p: 0.85, text: '타이어가 말하는 걸 듣게 됐다.', effect: { stats: { feedback: 2, tyre: 1 } } },
        { p: 0.15, text: '방식이 맞지 않아 몇 번 만나고 그만뒀다.', effect: { stats: { feedback: 1 } } },
      ] },
      { id: 'decline', label: '정중히 거절한다', outcomes: [{ p: 1, text: '지금의 방식을 믿기로 했다.', effect: {} }] },
    ],
  },
  {
    id: 'kart_return', category: 'training', title: '카트 이벤트 레이스',
    text: '겨울 카트 이벤트 레이스에 초청받았다. 어린 선수들과 바퀴를 맞대는 자리다.',
    when: (x) => x.series !== 'kart' && x.age <= 30,
    options: [
      { id: 'race', label: '출전한다', hint: '레이스크래프트 성장, 팬 증가', outcomes: [
        { p: 0.8, text: '휠 투 휠 감각이 되살아났다. 꼬마 팬들이 사인을 받으러 줄을 섰다.', effect: { stats: { racecraft: 2 }, followersMul: 1.08, sentiment: 5 } },
        { p: 0.2, text: '첫 코너에서 엉켜 손목을 삐었다.', effect: { stats: { racecraft: 1 }, pressure: 6 } },
      ] },
      { id: 'pass', label: '나가지 않는다', outcomes: [{ p: 1, text: '시즌 준비에 집중했다.', effect: {} }] },
    ],
  },

  // ── 패독 밖 ───────────────────────────────────────────────────────
  {
    id: 'youtube', category: 'offtrack', title: '유튜브 채널 제안',
    text: '영상 제작사가 {name}의 일상을 담는 유튜브 채널을 함께 만들자고 했다.',
    when: (x) => x.age >= 14,
    weight: (x) => (x.personality === 'showman' ? 3 : 1),
    options: [
      { id: 'start', label: '채널을 연다', hint: '팬 크게 증가, 압박·논란 위험', outcomes: [
        { p: 0.7, text: '첫 영상이 터졌다. 구독자가 하룻밤 새 몇 배로 늘었다.', effect: { followersMul: 1.35, pressure: 8, sentiment: 5 } },
        { p: 0.3, text: '편집된 한마디가 오해를 샀다. 댓글창이 불탔다.', effect: { followersMul: 1.15, sentiment: -15, pressure: 12 } },
      ] },
      { id: 'no', label: '레이스에만 집중한다', outcomes: [{ p: 1, text: '조용한 겨울을 보냈다.', effect: { pressure: -4 } }] },
    ],
  },
  {
    id: 'sponsor_shoot', category: 'offtrack', title: '스폰서 광고 촬영',
    text: '음료 브랜드가 광고 촬영을 제안했다. 모델료는 {amount}. 촬영 일정이 훈련과 겹친다.',
    amountUnits: 6, when: (x) => x.age >= 15 && x.followers >= 1000,
    options: [
      { id: 'shoot', label: '촬영한다', hint: '자금 증가, 훈련 시간 손실', outcomes: [
        { p: 1, text: '광고가 전국에 걸렸다. 통장도 두둑해졌다.', effect: { fundsUnits: 6, followersMul: 1.1, stats: { tyre: -1 } } },
      ] },
      { id: 'decline', label: '훈련을 택한다', outcomes: [{ p: 1, text: '돈보다 랩타임을 택했다.', effect: { reputation: 2 } }] },
    ],
  },
  {
    id: 'sns_controversy', category: 'offtrack', title: 'SNS 논란',
    text: '레이스 뒤 올린 글 하나가 논란이 됐다. 상대 팀 팬들이 몰려왔다.',
    when: (x) => x.age >= 15, weight: bad,
    options: [
      { id: 'apologize', label: '사과문을 올린다', outcomes: [
        { p: 0.8, text: '진심이 통했다. 논란은 금방 가라앉았다.', effect: { sentiment: 5, pressure: -5 } },
        { p: 0.2, text: '사과문마저 비판받았다.', effect: { sentiment: -5, pressure: 6 } },
      ] },
      { id: 'clapback', label: '맞받아친다', hint: '팬 증가, 평판 하락, 방출 위험', outcomes: [
        { p: 0.5, text: '통쾌한 반박에 팬들이 열광했다. 팀은 불편해했다.', effect: { followersMul: 1.25, reputation: -4, flags: { releaseRisk: 0.03 } } },
        { p: 0.5, text: '불난 데 기름을 부었다. 스폰서가 우려를 전해 왔다.', effect: { followersMul: 1.1, sentiment: -15, reputation: -6, flags: { releaseRisk: 0.05 } } },
      ] },
      { id: 'ignore', label: '무시한다', outcomes: [{ p: 1, text: '며칠 시끄럽다 잊혔다.', effect: { pressure: 4 } }] },
    ],
  },
  {
    id: 'documentary', category: 'offtrack', title: '다큐멘터리 출연',
    text: '글로벌 스트리밍 서비스가 시즌 다큐멘터리의 주인공으로 {name}을 담고 싶어 한다.',
    when: (x) => ['f2', 'f1'].includes(x.series) && x.seat === 'race',
    options: [
      { id: 'yes', label: '카메라를 받아들인다', hint: '팬 크게 증가, 압박 증가', outcomes: [
        { p: 1, text: '전 세계가 {name}의 한 해를 봤다.', effect: { followersMul: 1.5, pressure: 12, reputation: 3 } },
      ] },
      { id: 'no', label: '거절한다', outcomes: [{ p: 1, text: '사생활을 지켰다.', effect: { pressure: -5 } }] },
    ],
  },
  {
    id: 'charity', category: 'offtrack', title: '자선 카트 대회',
    text: '소아암 어린이를 돕는 자선 카트 대회에 초대받았다.',
    when: () => true,
    options: [
      { id: 'yes', label: '참가한다', outcomes: [{ p: 1, text: '아이들의 웃음이 오래 기억에 남았다.', effect: { sentiment: 10, reputation: 3 } }] },
      { id: 'no', label: '일정상 어렵다고 답한다', outcomes: [{ p: 1, text: '아쉽지만 다음을 기약했다.', effect: {} }] },
    ],
  },

  // ── 커리어 ────────────────────────────────────────────────────────
  {
    id: 'agent_change', category: 'career', title: '에이전트 교체 제안',
    text: '이름난 에이전트가 계약을 제안했다. 수수료로 자금의 10%를 요구한다.',
    when: (x) => x.age >= 15 && x.funds > 0,
    options: [
      { id: 'sign', label: '새 에이전트와 계약한다', hint: '다음 오프시즌 제안 증가, 자금 10%', outcomes: [
        { p: 0.75, text: '전화가 바빠졌다. 팀들이 {name}을 다시 보기 시작했다.', effect: { fundsFraction: -0.1, flags: { scoutBonus: 0.08 }, newManager: true } },
        { p: 0.25, text: '말만 번지르르했다. 수수료만 나갔다.', effect: { fundsFraction: -0.1 } },
      ] },
      { id: 'stay', label: '지금 사람과 간다', outcomes: [{ p: 1, text: '의리를 지켰다.', effect: { sentiment: 2 } }] },
    ],
  },
  {
    id: 'team_orders', category: 'career', title: '팀 오더',
    text: '마지막 레이스에서 팀이 팀메이트에게 자리를 내주라고 지시했다.',
    when: (x) => x.seat === 'race' && x.hasTeammate && x.series !== 'kart', weight: bad,
    options: [
      { id: 'obey', label: '지시를 따른다', outcomes: [{ p: 1, text: '팀은 고마워했다. 팬들은 아쉬워했다.', effect: { sentiment: -5, reputation: 2, flags: { releaseRisk: -0.02 } } }] },
      { id: 'ignore', label: '무시하고 달린다', hint: '팬 열광, 방출 위험 증가', outcomes: [
        { p: 1, text: '체커기를 먼저 받았다. 무선은 조용했다.', effect: { sentiment: 12, followersMul: 1.1, reputation: -3, flags: { releaseRisk: 0.06 } } },
      ] },
    ],
  },
  {
    id: 'academy_trial', category: 'career', title: '아카데미 테스트 초청',
    text: 'F1 팀 주니어 아카데미가 선발 테스트에 {name}을 불렀다.',
    when: (x) => !x.academy && ['kart', 'f4', 'freca', 'f3'].includes(x.series) && x.pct >= 0.55,
    weight: (x) => 0.6 + x.pct,
    options: [
      { id: 'go', label: '테스트를 받는다', hint: '합격하면 아카데미 소속', outcomes: [
        { p: 0.45, text: '합격 통보를 받았다. 이제 F1 팀의 주니어다.', effect: { joinAcademy: true, reputation: 5 } },
        { p: 0.55, text: '아깝게 떨어졌다. 다음 기회를 노린다.', effect: { pressure: 5, stats: { pace: 1 } } },
      ] },
      { id: 'no', label: '지금 팀에 집중한다', outcomes: [{ p: 1, text: '자기 길을 가기로 했다.', effect: {} }] },
    ],
  },
  {
    id: 'teammate_feud', category: 'career', title: '팀메이트와의 갈등',
    text: '팀메이트와 트랙에서 부딪힌 뒤 신경전이 언론까지 번졌다.',
    when: (x) => x.seat === 'race' && x.hasTeammate && x.series !== 'kart', weight: bad,
    options: [
      { id: 'reconcile', label: '먼저 손을 내민다', outcomes: [{ p: 1, text: '둘은 함께 사진을 찍었다. 팀 분위기가 풀렸다.', effect: { pressure: -6, flags: { releaseRisk: -0.02 } } }] },
      { id: 'escalate', label: '언론에서 맞선다', hint: '팬 증가, 방출 위험', outcomes: [
        { p: 1, text: '헤드라인을 장식했다. 팀 수뇌부가 회의를 소집했다.', effect: { followersMul: 1.12, sentiment: 4, pressure: 10, flags: { releaseRisk: 0.06 } } },
      ] },
    ],
  },
  {
    id: 'team_leader', category: 'career', title: '팀 리더 역할 제안',
    text: '{team}이 다음 시즌 팀의 개발 방향을 이끄는 리더 역할을 맡아 달라고 했다.',
    when: (x) => ['f2', 'f1'].includes(x.series) && x.seat === 'race' && x.age >= 21,
    options: [
      { id: 'accept', label: '받아들인다', hint: '평판·피드백 상승, 압박 증가', outcomes: [
        { p: 1, text: '팀의 중심이 됐다.', effect: { reputation: 5, stats: { feedback: 1 }, pressure: 8, flags: { releaseRisk: -0.03 } } },
      ] },
      { id: 'decline', label: '운전에만 집중하겠다고 답한다', outcomes: [{ p: 1, text: '부담을 덜었다.', effect: { pressure: -5 } }] },
    ],
  },

  // ── 생활 ──────────────────────────────────────────────────────────
  {
    id: 'family_business', category: 'life', title: '가족 소식',
    text: '집안 사업에 큰 변화가 생겼다.',
    when: (x) => x.age <= 24 && x.wealthTier >= 3 && !x.f1,
    options: [
      { id: 'ok', label: '소식을 듣는다', outcomes: [
        { p: 0.7, text: '사업이 크게 잘됐다. 가족이 후원을 늘려 줬다.', effect: { fundsUnits: 8 } },
        { p: 0.3, text: '사업이 어려워졌다. 당분간 아껴 써야 한다.', effect: { fundsFraction: -0.25, pressure: 8 } },
      ] },
    ],
  },
  {
    id: 'parents_loan', category: 'life', title: '부모님의 대출',
    text: '부모님이 집을 담보로 대출을 받아 시트 비용 {amount}를 보태겠다고 하신다.',
    amountUnits: 15, when: (x) => x.wealthTier <= 2 && JUNIOR(x.series) && x.age <= 21,
    options: [
      { id: 'accept', label: '받는다', hint: '자금 증가, 압박 증가', outcomes: [
        { p: 1, text: '꼭 성공해서 갚겠다고 다짐했다.', effect: { fundsUnits: 15, pressure: 12 } },
      ] },
      { id: 'refuse', label: '거절한다', outcomes: [{ p: 1, text: '내 힘으로 해 보겠다고 말씀드렸다.', effect: { sentiment: 3 } }] },
    ],
  },
  {
    id: 'relocate', category: 'life', title: '모나코 이주',
    text: '세금이 낮은 모나코로 거주지를 옮기자는 조언을 들었다.',
    when: (x) => x.age >= 20 && ['f2', 'f1'].includes(x.series),
    options: [
      { id: 'move', label: '옮긴다', hint: '자금 증가, 고국 팬 여론 하락', outcomes: [
        { p: 1, text: '항구가 내려다보이는 집으로 이사했다. 고국 팬들은 서운해했다.', effect: { fundsFraction: 0.08, sentiment: -6 } },
      ] },
      { id: 'stay', label: '고향에 남는다', outcomes: [{ p: 1, text: '고향 팬들이 더 응원해 줬다.', effect: { sentiment: 6 } }] },
    ],
  },
  {
    id: 'exams', category: 'life', title: '시험 기간',
    text: '학교 시험 기간과 테스트 일정이 겹쳤다.',
    when: (x) => x.age <= 17,
    options: [
      { id: 'study', label: '공부를 챙긴다', outcomes: [{ p: 1, text: '성적표를 받은 부모님이 웃으셨다.', effect: { pressure: -6, reputation: 1 } }] },
      { id: 'test', label: '테스트에 나간다', hint: '레이스크래프트·속도 성장, 압박 증가', outcomes: [
        { p: 1, text: '랩타임은 늘었지만 성적표는 걱정이다.', effect: { stats: { racecraft: 1, pace: 1 }, pressure: 5 } },
      ] },
    ],
  },
  {
    id: 'crowdfunding', category: 'life', title: '크라우드펀딩',
    text: '팬들이 다음 시즌 시트 비용을 모으는 크라우드펀딩을 열자고 한다.',
    when: (x) => x.wealthTier <= 2 && JUNIOR(x.series) && x.followers >= 500,
    weight: () => 1.5,
    options: [
      { id: 'open', label: '연다', hint: '자금 증가', outcomes: [
        { p: 0.75, text: '목표 금액을 넘겼다. 응원 메시지가 쏟아졌다.', effect: { fundsUnits: 10, sentiment: 8 } },
        { p: 0.25, text: '절반쯤 모였다. 그래도 고마운 돈이다.', effect: { fundsUnits: 4, sentiment: 3 } },
      ] },
      { id: 'no', label: '열지 않는다', outcomes: [{ p: 1, text: '팬들의 마음만 받기로 했다.', effect: {} }] },
    ],
  },
];

/** 이벤트 70개: M2 20개 + M3 일반 28개 + 기자회견 20개 + v0.25 2개(내구레이스, 가정) */
export const EVENTS: EventDef[] = [...BASE_EVENTS, ...MORE_EVENTS, ...INTERVIEWS];

export const EVENT_BY_ID = new Map(EVENTS.map((e) => [e.id, e]));

export function eventContext(c: Career, last: SeasonRecord): EventCtx {
  return {
    age: c.age,
    series: last.series,
    seat: last.seat,
    wealthTier: c.driver.wealthTier,
    personality: c.driver.personality,
    temperament: PERSONALITIES[c.driver.personality].temperament,
    pct: last.position ? 1 - (last.position - 1) / Math.max(1, last.fieldSize) : 0,
    champion: last.champion,
    wins: last.wins,
    academy: !!c.academy,
    funds: c.funds,
    followers: c.media.followers,
    hasTeammate: last.series !== 'kart',
    f1: c.f1Debut !== null,
    perf: last.seat === 'race' ? last.expectedAvg - last.actualAvg : 0,
    f1Rookie: last.series === 'f1' && last.seat === 'race' && c.f1Debut === last.year,
    home: (c.world.calendar ?? CALENDAR_2026).some((s) => circuitById(s.id).country === c.driver.nationality),
    teamRank: c.contract?.series === 'f1' && c.contract.seat === 'race' && c.contract.teamId
      ? [...c.world.teams.teams].sort((a, b) => b.quality - a.quality).findIndex((t) => t.id === c.contract!.teamId) + 1 || 99
      : 99,
    teammateBeat: last.teammateBeat,
    family: !!c.family,
  };
}

/**
 * 이번 오프시즌 이벤트: 레이스 시트로 시즌을 치렀으면(F4 이상) 기자회견 1개를 먼저 띄우고,
 * 일반 이벤트 0~2개(25%/50%/25%)를 더한다. 최근 3년 안에 나온 이벤트는 제외
 */
export function pickEvents(c: Career, last: SeasonRecord): string[] {
  const r = rngFor(c.seed, 'events', c.year);
  const roll = r();
  const count = roll < 0.25 ? 0 : roll < 0.75 ? 1 : 2;
  const recent = new Set((c.eventLog ?? []).filter((e) => e.year > c.year - 3).map((e) => e.id));
  const x = eventContext(c, last);
  const pool = EVENTS.filter((e) => e.category !== 'interview' && !recent.has(e.id) && e.when(x));
  const picked: string[] = [];
  if (last.seat === 'race' && last.series !== 'kart') {
    const ri = rngFor(c.seed, 'interview', c.year);
    const ivs = INTERVIEWS.filter((e) => !recent.has(e.id) && e.when(x));
    if (ivs.length) picked.push(weightedPick(ri, ivs, (d) => d.weight?.(x) ?? 1).id);
  }
  for (let i = 0; i < count && pool.length; i++) {
    const e = weightedPick(r, pool, (d) => d.weight?.(x) ?? 1);
    picked.push(e.id);
    pool.splice(pool.indexOf(e), 1);
  }
  return picked;
}

function eurText(eur: number): string {
  const v = Math.abs(eur);
  return v >= 1_000_000 ? `€${(v / 1_000_000).toFixed(1)}M` : `€${Math.round(v / 1000)}k`;
}

export function unitsToEur(c: Career, units: number): number {
  const series = c.history[c.history.length - 1]?.series ?? 'kart';
  return units * SERIES_SCALE[series] * 10_000;
}

export function fillText(t: string, c: Career, amount?: number): string {
  const team = c.contract?.team ?? '팀';
  return t.replaceAll('{name}', c.driver.name).replaceAll('{team}', team).replaceAll('{amount}', amount !== undefined ? eurText(amount) : '');
}

// ── 기자회견 변수(SPEC §6 v0.30): 어느 매체가, 어떤 분위기에서 묻느냐에 따라 같은 답도 결과가 달라진다 ──
export const IV_OUTLETS = [
  { id: 'tv', label: '현지 방송', note: '팬 여론이 크게 움직인다', rep: 0.8, sent: 1.4, fol: 1, press: 1 },
  { id: 'pro', label: '해외 전문지', note: '언론 평판이 크게 움직인다', rep: 1.6, sent: 0.7, fol: 0.8, press: 1 },
  { id: 'yt', label: '모터스포츠 유튜브', note: '팔로워가 크게 움직인다', rep: 0.7, sent: 1, fol: 1.8, press: 0.8 },
  { id: 'tabloid', label: '가십 매체', note: '말 한마디가 부풀려진다', rep: 1.2, sent: 1.3, fol: 1.4, press: 1.5 },
] as const;
export const IV_MOODS = [
  { id: 'friendly', label: '우호적인 분위기', badMul: 0.65 },
  { id: 'calm', label: '평범한 분위기', badMul: 1 },
  { id: 'tense', label: '날 선 분위기', badMul: 1.6 },
] as const;

export function interviewVars(c: Career, eventId: string): { outlet: (typeof IV_OUTLETS)[number]; mood: (typeof IV_MOODS)[number] } {
  const r = rngFor(c.seed, 'iv-vars', c.year, eventId);
  const outlet = IV_OUTLETS[Math.floor(r() * IV_OUTLETS.length)]!;
  // 성적이 나쁘거나 압박이 높으면 날 선 분위기가 잦다
  const tenseBias = c.media.pressure / 200;
  const m = r();
  const mood = m < 0.3 - tenseBias / 2 ? IV_MOODS[0] : m < 0.75 - tenseBias ? IV_MOODS[1] : IV_MOODS[2];
  return { outlet, mood };
}

export interface EventCard {
  id: string;
  category: EventCategory;
  title: string;
  text: string;
  options: Array<{ id: string; label: string; hint?: string }>;
}

export function eventCard(c: Career, id: string): EventCard {
  const e = EVENT_BY_ID.get(id);
  if (!e) throw new Error(`unknown event ${id}`);
  const amount = e.amountUnits !== undefined ? unitsToEur(c, e.amountUnits) : undefined;
  let text = fillText(e.text, c, amount);
  if (e.category === 'interview') {
    const v = interviewVars(c, id);
    text = `[${v.outlet.label} · ${v.mood.label}] ${text} (${v.outlet.note})`;
  }
  return { id, category: e.category, title: e.title, text, options: e.options.map(({ id: oid, label, hint }) => ({ id: oid, label, hint })) };
}

const clampStat = (v: number) => Math.max(20, Math.min(99, v));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const STAT_NAME: Record<string, string> = { pace: '순간 속도', racecraft: '레이스크래프트', tyre: '타이어 관리', consistency: '일관성', wet: '우천', feedback: '기술 피드백' };

function scaleForOutlet(fx: EventEffect, o: (typeof IV_OUTLETS)[number]): EventEffect {
  const out: EventEffect = { ...fx };
  if (fx.reputation) out.reputation = Math.round(fx.reputation * o.rep);
  if (fx.sentiment) out.sentiment = Math.round(fx.sentiment * o.sent);
  if (fx.pressure) out.pressure = Math.round(fx.pressure * o.press);
  if (fx.followersMul) out.followersMul = 1 + (fx.followersMul - 1) * o.fol;
  return out;
}

/** 결과를 career에 반영하고, 화면에 보여 줄 문구와 변화 요약을 돌려준다. c를 직접 바꾼다 */
export function applyEventChoice(c: Career, eventId: string, optionId: string): { text: string; summary: string[] } {
  const e = EVENT_BY_ID.get(eventId);
  if (!e) throw new Error(`unknown event ${eventId}`);
  const opt = e.options.find((o) => o.id === optionId);
  if (!opt) throw new Error(`unknown option ${optionId} for ${eventId}`);
  const r: Rng = rngFor(c.seed, 'event-outcome', c.year, eventId, optionId);
  const temperament = PERSONALITIES[c.driver.personality].temperament;
  const iv = e.category === 'interview' ? interviewVars(c, eventId) : null;
  // 기자회견: 두 번째부터의 결과(역풍)는 분위기에 따라 잦아지거나 드물어진다
  const outcome = weightedPick(r, opt.outcomes, (o) => o.p * (o.tempMul?.[temperament] ?? 1) * (iv && opt.outcomes.indexOf(o) > 0 ? iv.mood.badMul : 1));
  const fx: EventEffect = iv ? scaleForOutlet(outcome.effect, iv.outlet) : outcome.effect;
  const summary: string[] = [];
  for (const k of STAT_KEYS) {
    const want = fx.stats?.[k];
    if (!want) continue;
    // 오르는 쪽은 잠재력을 넘지 못한다(이벤트가 성장 상한을 우회하지 않게)
    const cur = c.driver.stats[k];
    const next = want > 0 ? Math.min(cur + want, Math.max(cur, c.driver.hidden.potential)) : cur + want;
    const d = clampStat(next) - cur;
    c.driver.stats[k] = cur + d;
    if (d) summary.push(`${STAT_NAME[k]} ${d > 0 ? '+' : ''}${d}`);
    else if (want > 0) summary.push(`${STAT_NAME[k]} 변화 없음(한계에 가까움)`);
  }
  let fundsDelta = 0;
  if (fx.fundsUnits) fundsDelta += unitsToEur(c, fx.fundsUnits);
  if (fx.fundsFraction) fundsDelta += Math.round(Math.max(0, c.funds) * fx.fundsFraction);
  if (fundsDelta) {
    c.funds += fundsDelta;
    summary.push(`자금 ${fundsDelta > 0 ? '+' : '−'}${eurText(fundsDelta)}`);
  }
  if (fx.reputation) { c.media.reputation = clamp(c.media.reputation + fx.reputation, 0, 100); summary.push(`언론 평판 ${fx.reputation > 0 ? '+' : ''}${fx.reputation}`); }
  if (fx.followersMul) { c.media.followers = Math.round(c.media.followers * fx.followersMul); summary.push(`팔로워 +${Math.round((fx.followersMul - 1) * 100)}%`); }
  if (fx.sentiment) { c.media.sentiment = clamp(c.media.sentiment + fx.sentiment, -100, 100); summary.push(`팬 여론 ${fx.sentiment > 0 ? '+' : ''}${fx.sentiment}`); }
  if (fx.pressure) { c.media.pressure = clamp(c.media.pressure + fx.pressure, 0, 100); summary.push(`압박 ${fx.pressure > 0 ? '+' : ''}${fx.pressure}`); }
  if (fx.flags) {
    c.flags = { ...(c.flags ?? {}) };
    for (const [k, v] of Object.entries(fx.flags)) {
      c.flags[k] = (c.flags[k] ?? 0) + v;
      if (k === 'scoutBonus' && v > 0) summary.push('다음 오프시즌 팀들의 관심 증가');
      if (k === 'releaseRisk') summary.push(v > 0 ? '팀 내 입지 흔들림(방출 위험 증가)' : '팀 내 입지 단단해짐');
    }
  }
  if (fx.joinAcademy && !c.academy) {
    c.academy = ACADEMIES[Math.floor(r() * ACADEMIES.length)]?.name ?? ACADEMIES[0]!.name;
    summary.push(`${c.academy} 합류`);
  }
  if (fx.family && !c.family) {
    c.family = { since: c.year };
    summary.push('가정을 꾸렸다: 멘탈이 안정되고 레이스 공격성은 줄어든다');
  }
  if (fx.newManager) {
    c.manager = generateManager(c.seed, `agent-${c.year}`, c.driver.nationality, 4);
    summary.push(`새 매니저 ${c.manager.name}`);
  }
  const amount = e.amountUnits !== undefined ? unitsToEur(c, e.amountUnits) : undefined;
  return { text: fillText(outcome.text, c, amount), summary };
}
