// 언론·팬 반응 피드(SPEC §6.1). 시즌마다 상황에 맞는 반응 3~5개를 고른다.
// 규칙: 가상 매체·가상 해설가만 쓴다. 실존 인물의 말을 직접 인용하지 않는다. 반응에는 실제 숫자를 담는다.

import { fixJosa } from './josa';
import type { Career, SeasonRecord } from './career';
import { PERSONALITIES } from './creation';
import { int, pick, rngFor, type Rng } from './rng';
import { seriesLabel } from './series';

export interface FeedItem {
  kind: 'expert' | 'fan' | 'team' | 'press';
  author: string;
  text: string;
  likes?: number;
  /** 팬 게시물이 올라온 커뮤니티(SPEC §6.1 v0.19) */
  platform?: FanPlatform;
  /** 영어권 커뮤니티 글을 한국어로 옮긴 것 */
  translated?: boolean;
}

/** 팬 반응이 올라오는 실제 커뮤니티. 게시물 내용과 작성자는 모두 가상이다 */
export type FanPlatform = 'reddit' | 'dcinside' | 'x';
export const PLATFORM_LABEL: Record<FanPlatform, string> = { reddit: 'r/formula1', dcinside: 'F1 갤러리', x: 'X' };
/** 반응 수 표시: 레딧 업보트, 갤러리 추천, X 좋아요 */
export const PLATFORM_LIKE: Record<FanPlatform, string> = { reddit: '▲', dcinside: '추천', x: '♥' };

type Situation = 'champion' | 'winner' | 'podium' | 'over' | 'under' | 'steady' | 'noSeat' | 'reserve';

const EXPERTS = ['해설가 한도윤', '전 드라이버 마르코 벨리니', '데이터 기자 서지아'];
const PRESS = ['패독 데일리', '그리드 위클리', '레이싱 코리아 뉴스'];
const REDDIT_NAMES = ['DRS_Train', 'Undercut_Enjoyer', 'BoxBoxBox', 'SafetyCarSimp', 'TyreWhisperer', 'Chequered_Flag', 'GravelTrapGuy', 'PurpleSector', 'HalfwayHairpin', 'PitWallPundit'];
const FAN_NAMES = ['피트레인지기', '체커기수집가', 'DRS열림', '언더컷장인', '세이프티카타고싶다', '새벽레이스러', '타이어휘파람', '헤어핀코너', '그리드걸음마', '랩타임중독'];

// ── 템플릿(약 80개) ──────────────────────────────────────────────
const EXPERT: Record<Situation, string[]> = {
  champion: [
    '{name}의 {series} 우승은 우연이 아니다. {races}경기에서 {wins}번 이겼다. 숫자가 다 말해 준다.',
    '시즌 내내 흔들린 적이 없었다. {name}은 이제 다음 단계로 갈 준비가 됐다.',
    '챔피언다운 시즌. 특히 기대 순위 P{exp}에서 평균 P{act}로 끌어올린 건 차보다 사람의 힘이다.',
  ],
  winner: [
    '{wins}승은 충분히 인상적이다. 다만 종합 {pos}위라는 건 기복이 있었다는 뜻이기도 하다.',
    '이길 줄 아는 드라이버다. 이제 꾸준함만 붙이면 된다.',
    '{name}의 최고의 날은 누구보다 빠르다. 문제는 최악의 날이다.',
    '체커기를 먼저 받는 맛을 알았다. 이제 그 맛을 더 자주 봐야 한다.',
  ],
  podium: [
    '포디움 {podiums}회. 우승은 없었지만 늘 앞쪽에 있었다.',
    '한 끗이 모자랐다. 하지만 {name}이 우승에 가까워지고 있는 건 분명하다.',
    '포디움 단골이 됐다. 다음 목표는 가운데 자리다.',
    '우승 없는 포디움 {podiums}회. 마지막 몇 랩을 지키는 힘이 필요하다.',
  ],
  over: [
    '차의 한계를 넘었다. 기대 순위 P{exp}, 실제 평균 P{act}. 패독은 이런 드라이버를 기억한다.',
    '{team}의 차로 이 성적이면, 더 좋은 차에서는 어디까지 갈까.',
    '데이터를 보면 팀메이트보다 확연히 앞선다. 스카우트들이 메모를 시작했을 것이다.',
    '조용하지만 강했다. 종합 {pos}위는 차를 생각하면 대단한 결과다.',
  ],
  under: [
    '기대 순위 P{exp}에 실제 평균 P{act}. 변명하기 어려운 시즌이다.',
    '재능은 의심하지 않는다. 다만 올해는 차를 다 쓰지 못했다.',
    '실수가 너무 많았다. 다음 시즌이 {name}에게 중요한 갈림길이 될 것이다.',
    '{team}이 더 많은 걸 기대했을 것이다. 압박이 커질 수밖에 없다.',
  ],
  steady: [
    '기대한 만큼 해냈다. 종합 {pos}위, 무난한 시즌.',
    '큰 실수도 큰 반전도 없었다. {name}은 지금 기초를 다지는 중이다.',
    '숫자로는 평범하지만, 성장 곡선은 꾸준히 오르고 있다.',
    '차와 드라이버 모두 제 몫을 했다. 그 이상도 이하도 아니었다.',
  ],
  noSeat: [
    '시트 없이 보낸 한 해는 길다. {name}에게 필요한 건 기회 하나다.',
    '실력보다 운과 돈이 모자랐다. 패독은 여전히 {name}을 지켜보고 있다.',
    '쉬는 동안 몸은 녹슬지 않았을까. 복귀 첫 시즌이 모든 걸 말해 줄 것이다.',
  ],
  reserve: [
    '리저브 자리는 배우는 곳이지만, 오래 머물 곳은 아니다.',
    '{team}의 시뮬레이터에서 보낸 시간은 언젠가 빛을 볼 것이다. 문제는 그때가 언제냐다.',
    '금요일 연습 주행만으로는 부족하다. {name}에게는 일요일이 필요하다.',
  ],
};

const TEAM: Record<'good' | 'bad' | 'champion', string[]> = {
  champion: ['챔피언! {name}, 고마워요. 이 순간을 함께해서 영광입니다 🏆', '{series} 챔피언 {name}! 한 시즌 내내 보여 준 노력에 박수를'],
  good: [
    '종합 {pos}위로 시즌 마무리. 함께해서 즐거웠던 한 해였습니다',
    '{wins}승, 포디움 {podiums}회. {name}, 멋진 시즌이었어요',
    '다음 시즌 더 강해져서 돌아오겠습니다. 응원해 주신 팬 여러분 감사합니다',
    '어려운 순간마다 {name}이 해냈습니다. 팀 전원이 자랑스럽습니다',
  ],
  bad: [
    '쉽지 않은 시즌이었습니다. 겨울 동안 원인을 찾겠습니다',
    '응원해 주셔서 감사합니다. 다음 시즌은 다를 겁니다',
    '종합 {pos}위. 우리가 원한 결과는 아니지만, 끝까지 싸웠습니다',
    '팀과 {name} 모두 배운 게 많은 한 해였습니다',
  ],
};

const FAN_POS = [
  '{name} 진짜 미쳤다 ㅋㅋ 이 차로 {pos}위가 말이 됨?',
  '올해 {name} 레이스 보려고 새벽마다 깼다. 후회 없음',
  '{name} 팬 된 지 {years}년째인데 올해가 제일 행복했다',
  '{wins}승!! 다음 시즌 시트 무조건 좋은 데로 가자',
  '추월할 때 소리 지름. {name} 레이스크래프트 장난 아님',
  '이 정도면 상위 팀 연락 와야 정상 아니냐',
  '팀메이트 상대로 이 정도면 말 다 했지',
  '{name} 인터뷰 볼 때마다 더 좋아짐',
  '비 오는 날 {name} 레이스는 무조건 본다',
  '{age}살에 이 정도면 미래가 기대된다',
  '포디움 {podiums}번! 샴페인 뿌리는 거 더 보고 싶다',
];
const FAN_NEG = [
  '{name} 올해 왜 이래… 기대 순위 P{exp}인데 평균 P{act}',
  '재능은 있는데 실수가 너무 많다. 내년엔 좀',
  '솔직히 차 탓만 할 수는 없지 않나',
  '응원은 하는데 이번 시즌은 보는 게 힘들었다',
  '{team}이 인내심 언제까지 가질지 모르겠다',
  '압박감에 무너지는 느낌. 멘탈 관리가 필요해 보임',
  '타이어 관리 좀… 마지막 10랩마다 순위가 빠진다',
  '시즌 초반엔 좋았는데 후반에 왜 이렇게 됐지',
];
const FAN_MEME = [
  '오늘의 {name}: 출발 → 1코너 → 어디 갔지?',
  '{name} 무전 내용 궁금해서 잠이 안 옴',
  '{series} 시즌 끝났는데 벌써 다음 시즌 기다리는 사람 나야 나',
  '세상에서 제일 긴 시간: {name} 피트스톱 기다리는 2.4초',
  '{name} 헬멧 디자인 굿즈로 내 주세요 제발',
  '{name}만 나오면 채팅창 속도 3배',
  '{name} 무전: "타이어 죽었어" / 엔지니어: "알아" 이 조합 계속 보고 싶다',
  '{series} 끝나니까 주말이 너무 길다',
];
const FAN_RIVAL = [
  '{name} 과대평가 그만. 우리 드라이버가 더 빠름',
  '이번 시즌 {name} 운 좋았던 거 인정하자',
  '다음 시즌엔 우리가 이긴다. 각오해라 {name}',
  '{name} 팬들 너무 시끄러움 ㅋㅋ',
  '{name}이 잘하긴 하는데 차빨도 있지 않음?',
  '우리 팀 드라이버가 {name}보다 낫다에 한 표',
];

const PRESS_SPECIAL = {
  f1Debut: ['{name}, F1 데뷔 시즌 종합 {pos}위로 마무리', '"꿈의 무대" 첫해를 보낸 {name}, 무엇을 남겼나'],
  rookie: ['{series} 첫 시즌의 {name}, 적응을 마쳤다', '{series} 루키 {name}, 종합 {pos}위로 존재감'],
  aging: ['{age}세 {name}, 세월과의 싸움이 시작됐다', '베테랑 {name}, 경험으로 속도를 메운다'],
  wealthy: ['"돈으로 산 시트" 꼬리표, {name}은 지울 수 있을까'],
  poor: ['빠듯한 살림에서 여기까지, {name}의 언더독 스토리'],
};

const MILITARY = {
  press: ['{name}, 군 복무 중에도 체력 훈련은 계속', '{age}세 {name}, 헬멧 대신 군모… "전역하면 바로 돌아간다"'],
  expert: ['2년 공백은 길다. 하지만 돌아온 드라이버가 더 단단해지는 경우도 많다.', '{name}의 레이스 감각이 얼마나 남아 있을지가 관건이다.'],
  fan: ['{name} 휴가 나와서 카트장 왔다는 목격담 있음 ㅋㅋ', '전역 D-day 세는 사람 나만 있냐', '돌아오면 바로 시트 주자 제발', '군대 다녀오면 멘탈은 무적이겠지'],
};

function situation(r: SeasonRecord): Situation {
  if (r.seat === 'none') return 'noSeat';
  if (r.seat === 'reserve') return 'reserve';
  if (r.champion) return 'champion';
  if (r.wins > 0) return 'winner';
  const delta = r.expectedAvg - r.actualAvg;
  if (delta >= 2) return 'over';
  if (delta <= -2) return 'under';
  if (r.podiums > 0) return 'podium';
  return 'steady';
}

function fill(t: string, c: Career, r: SeasonRecord): string {
  const years = Math.max(1, c.history.length);
  return fixJosa(t
    .replaceAll('{name}', c.driver.name)
    .replaceAll('{series}', seriesLabel(r.series))
    .replaceAll('{team}', r.team ?? '팀')
    .replaceAll('{pos}', String(r.position ?? '-'))
    .replaceAll('{wins}', String(r.wins))
    .replaceAll('{podiums}', String(r.podiums))
    .replaceAll('{races}', String(r.races))
    .replaceAll('{exp}', String(r.expectedAvg))
    .replaceAll('{act}', String(r.actualAvg))
    .replaceAll('{age}', String(r.age))
    .replaceAll('{years}', String(years)), [c.driver.name, r.team ?? '팀', seriesLabel(r.series)]);
}

function likes(rng: Rng, c: Career, big = false): number {
  const base = Math.max(10, Math.round(c.media.followers * (big ? 0.02 : 0.004)));
  return Math.round(base * (0.5 + rng()));
}

/** 커뮤니티를 고르고 그곳 말투의 작성자 이름을 붙인다. 한국 국적이면 F1 갤러리, 아니면 레딧 비중이 크다 */
function fanPost(rng: Rng, c: Career, text: string): FeedItem {
  const roll = rng();
  const kr = c.driver.nationality === 'KR';
  const platform: FanPlatform = kr ? (roll < 0.5 ? 'dcinside' : roll < 0.8 ? 'x' : 'reddit') : (roll < 0.5 ? 'reddit' : roll < 0.9 ? 'x' : 'dcinside');
  const n = likes(rng, c);
  if (platform === 'reddit') return { kind: 'fan', platform, author: `u/${pick(rng, REDDIT_NAMES)}_${int(rng, 1, 999)}`, text, likes: n, translated: true };
  if (platform === 'dcinside') {
    // 갤러리는 유동(ㅇㅇ + IP 앞자리)이 많고 가끔 고정닉
    const author = rng() < 0.7 ? `ㅇㅇ(${int(rng, 1, 223)}.${int(rng, 0, 255)})` : pick(rng, FAN_NAMES);
    return { kind: 'fan', platform, author, text, likes: Math.max(1, Math.round(n / 8)) };
  }
  return { kind: 'fan', platform, author: `@${pick(rng, FAN_NAMES)}${int(rng, 1, 99)}`, text, likes: n };
}

/** 시즌 피드: 해설가 1 + 팀 계정 1(레이스 시트) + 팬 2 + 특별 기사(데뷔·루키·노장·자산) 0~1 */
export function seasonFeed(c: Career, r: SeasonRecord): FeedItem[] {
  const rng = rngFor(c.seed, 'feed', r.year);
  const s = situation(r);
  const items: FeedItem[] = [];
  if (r.military) {
    items.push({ kind: 'press', author: pick(rng, PRESS), text: fill(pick(rng, MILITARY.press), c, r) });
    items.push({ kind: 'expert', author: pick(rng, EXPERTS), text: fill(pick(rng, MILITARY.expert), c, r) });
    items.push(fanPost(rng, c, fill(pick(rng, MILITARY.fan.slice(0, 2)), c, r)));
    items.push(fanPost(rng, c, fill(pick(rng, MILITARY.fan.slice(2)), c, r)));
    return items;
  }
  const first = c.history.filter((h) => h.series === r.series && h.seat === 'race').length === 1;

  // 특별 기사
  if (r.series === 'f1' && r.seat === 'race' && c.f1Debut === r.year) items.push({ kind: 'press', author: pick(rng, PRESS), text: fill(pick(rng, PRESS_SPECIAL.f1Debut), c, r) });
  else if (first && r.seat === 'race' && r.series !== 'kart') items.push({ kind: 'press', author: pick(rng, PRESS), text: fill(pick(rng, PRESS_SPECIAL.rookie), c, r) });
  else if (r.growth.aging < 0) items.push({ kind: 'press', author: pick(rng, PRESS), text: fill(pick(rng, PRESS_SPECIAL.aging), c, r) });
  else if (c.driver.wealthTier >= 4 && s === 'under') items.push({ kind: 'press', author: pick(rng, PRESS), text: fill(pick(rng, PRESS_SPECIAL.wealthy), c, r) });
  else if (c.driver.wealthTier <= 1 && (s === 'over' || s === 'winner' || s === 'champion')) items.push({ kind: 'press', author: pick(rng, PRESS), text: fill(pick(rng, PRESS_SPECIAL.poor), c, r) });

  items.push({ kind: 'expert', author: pick(rng, EXPERTS), text: fill(pick(rng, EXPERT[s]), c, r) });

  if (r.seat === 'race' && r.team) {
    const group = r.champion ? 'champion' : s === 'under' ? 'bad' : r.position && r.position <= Math.ceil(r.fieldSize / 2) ? 'good' : 'bad';
    items.push({ kind: 'team', author: `${r.team} 공식`, text: fill(pick(rng, TEAM[group]), c, r), likes: likes(rng, c, true) });
  }

  // 팬 2명: 여론에 따라 긍정/부정, 그리고 밈 또는 라이벌 팬
  const positive = c.media.sentiment >= 0 && s !== 'under';
  items.push(fanPost(rng, c, fill(pick(rng, positive ? FAN_POS : FAN_NEG), c, r)));
  const showman = PERSONALITIES[c.driver.personality].id === 'showman' || PERSONALITIES[c.driver.personality].temperament === 'bad';
  const second = r.wins > 0 && rng() < 0.5 ? FAN_RIVAL : showman || rng() < 0.6 ? FAN_MEME : FAN_RIVAL;
  items.push(fanPost(rng, c, fill(pick(rng, second), c, r)));

  return items;
}

/** 템플릿 개수(테스트·문서용) */
export function feedTemplateCount(): number {
  const n = (o: Record<string, string[]>) => Object.values(o).reduce((a, x) => a + x.length, 0);
  return n(EXPERT) + n(TEAM) + FAN_POS.length + FAN_NEG.length + FAN_MEME.length + FAN_RIVAL.length + n(PRESS_SPECIAL);
}
