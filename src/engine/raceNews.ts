// 그랑프리 결승 뒤 기사와 SNS 게시(SPEC v0.36).
// 기사: 결승 결과(순위·그리드·팀메이트·리타이어 이유)로 가상 매체 기사 한 편.
// SNS: 드라이버 성격에 따라 고를 수 있는 글이 달라지고(성격다운 글 하나 포함), 결과에 따라 팬 반응이 달라진다.
// 고른 글은 라이브 시즌 선택 기록(sns)으로 남고, 시즌을 마칠 때 언론 지표에 반영된다(재생 가능).

import { type Career } from './careerCore';
import { type Classified } from './race';
import { pick, rngFor } from './rng';
import { type Personality } from './types';

/** 결승에서 내 결과 */
export interface MyRaceResult {
  /** 완주 순위. 리타이어면 null */
  position: number | null;
  grid: number;
  reason?: string;
  /** 팀메이트가 나보다 앞에서 끝났나(팀메이트가 없으면 null) */
  mateAhead: boolean | null;
  winnerId: string;
  points: number;
}

export type RaceSituation = 'win' | 'podium' | 'points' | 'nopoints' | 'dnf';

export function situationOf(r: MyRaceResult): RaceSituation {
  if (r.position === null) return 'dnf';
  if (r.position === 1) return 'win';
  if (r.position <= 3) return 'podium';
  if (r.points > 0) return 'points';
  return 'nopoints';
}

export function myRaceResult(rows: Classified[], me: string, mateId: string | undefined): MyRaceResult | null {
  const mine = rows.find((r) => r.id === me);
  if (!mine) return null;
  const mate = mateId ? rows.find((r) => r.id === mateId) : undefined;
  return {
    position: mine.status === 'finished' ? mine.position : null,
    grid: mine.grid,
    reason: mine.reason,
    mateAhead: mate ? mate.position < mine.position : null,
    winnerId: rows[0]?.id ?? '',
    points: mine.points,
  };
}

// ── 기사 ─────────────────────────────────────────────────────────────
const OUTLETS = ['패독 데일리', '그리드 위클리', '레이싱 코리아 뉴스', '피트월 리포트', '체커기 매거진'];

export interface RaceArticle {
  outlet: string;
  headline: string;
  body: string[];
}

export interface ArticleContext {
  gp: string;
  round: number;
  name: string;
  team: string;
  winnerName: string;
  mateName?: string;
  /** 이 레이스의 세이프티카·VSC·레드 플래그 수 */
  neutralizations: number;
  /** 사고·결함으로 리타이어한 다른 드라이버 이름 */
  retired: string[];
}

export function raceArticle(c: Career, r: MyRaceResult, x: ArticleContext): RaceArticle {
  const rng = rngFor(c.seed, 'race-article', c.year, x.round);
  const s = situationOf(r);
  const gain = r.position !== null ? r.grid - r.position : 0;
  const fill = (t: string) => t
    .replace(/\{name\}/g, x.name).replace(/\{gp\}/g, x.gp).replace(/\{team\}/g, x.team).replace(/\{pos\}/g, String(r.position ?? ''))
    .replace(/\{grid\}/g, String(r.grid)).replace(/\{gain\}/g, String(Math.abs(gain))).replace(/\{winner\}/g, x.winnerName)
    .replace(/\{reason\}/g, r.reason ?? '사고').replace(/\{pts\}/g, String(r.points));
  const HEAD: Record<RaceSituation, string[]> = {
    win: ['{name}, {gp} 우승! {grid}번 그리드에서 체커기까지', '{gp}의 주인공은 {name}. {team}에 우승 트로피', '"완벽한 일요일" {name}, {gp} 정상'],
    podium: ['{name}, {gp} {pos}위 포디움', '{name} 샴페인 세례, {gp}에서 {pos}위', '{team}의 {name}, {gp} 포디움에 오르다'],
    points: ['{name}, {gp} {pos}위로 {pts}포인트', '{name} 꾸준함으로 챙긴 {pts}포인트, {gp} {pos}위', '{gp} {pos}위 {name}, "오늘은 이게 최선"'],
    nopoints: ['{name}, {gp} {pos}위… 포인트 놓쳐', '{gp}에서 고전한 {name}, {pos}위', '{name}에게 쓴 {gp}, 포인트권 밖 {pos}위'],
    dnf: ['{name}, {gp}에서 {reason}로 리타이어', '{gp} 악몽, {name} 완주 실패', '{name}의 {gp}는 일찍 끝났다'],
  };
  const LEAD: Record<RaceSituation, string[]> = {
    win: ['{name}({team})이 {gp}에서 우승했다. {grid}번 그리드에서 출발해 가장 먼저 체커기를 받았다.', '{name}이 {gp} 결승에서 가장 먼저 체커기를 받았다. {grid}번 그리드 출발이었다.'],
    podium: ['{name}({team})이 {gp}를 {pos}위로 마치며 포디움에 올랐다. 우승은 {winner}.', '{gp} 우승은 {winner}에게 돌아갔지만, {name}도 {pos}위로 시상대에 섰다.'],
    points: ['{name}({team})이 {gp}를 {pos}위로 마쳐 {pts}포인트를 보탰다. 우승은 {winner}.', '{winner}가 우승한 {gp}에서 {name}은 {pos}위로 포인트를 챙겼다.'],
    nopoints: ['{name}({team})은 {gp}에서 {pos}위에 그쳐 포인트를 얻지 못했다. 우승은 {winner}.', '{winner}가 우승한 {gp}. {name}은 {pos}위로 포인트권에 들지 못했다.'],
    dnf: ['{name}({team})이 {gp} 결승에서 {reason}로 리타이어했다. 우승은 {winner}.', '{gp}에서 {name}의 차가 멈췄다. 원인은 {reason}. 우승은 {winner}에게 돌아갔다.'],
  };
  const body = [fill(pick(rng, LEAD[s]))];
  if (r.position !== null && gain >= 4) body.push(fill(pick(rng, ['{grid}번 그리드에서 {gain}자리를 끌어올린 추월쇼였다.', '출발 순위보다 {gain}계단 위에서 레이스를 마쳤다. 레이스 운영이 빛났다.'])));
  else if (r.position !== null && gain <= -4) body.push(fill(pick(rng, ['{grid}번 그리드에서 출발했지만 {gain}자리를 잃었다. 레이스 페이스가 아쉬웠다.', '출발보다 {gain}계단 밀려났다. 팀은 원인을 분석 중이다.'])));
  if (x.mateName && r.mateAhead !== null) {
    body.push(r.mateAhead
      ? `팀메이트 ${x.mateName}이 앞에서 레이스를 마쳐, 팀 안의 비교에서는 밀렸다.`
      : `팀메이트 ${x.mateName}보다 앞에서 체커기를 받았다.`);
  }
  if (x.neutralizations > 0) {
    const who = x.retired.length ? ` ${x.retired.slice(0, 3).join(', ')}${x.retired.length > 3 ? ' 등' : ''}이 레이스를 끝내지 못했다.` : '';
    body.push(`세이프티카·VSC·레드 플래그가 ${x.neutralizations}번 나온 어지러운 레이스였다.${who}`);
  }
  return { outlet: pick(rng, OUTLETS), headline: fill(pick(rng, HEAD[s])), body };
}

// ── SNS ──────────────────────────────────────────────────────────────
export type SnsTone = 'thanks' | 'humble' | 'bold' | 'silent' | 'signature';

export interface SnsOption {
  id: string;
  tone: SnsTone;
  label: string;
  /** 올라갈 글 */
  text: string;
  /** 성격다운 글 */
  signature?: boolean;
}

export interface SnsEffect {
  followersMul: number;
  sentiment: number;
  pressure: number;
  reputation: number;
}

/** 성격다운 글(성격마다 하나): 이름과 결과별 문구 */
const SIGNATURE: Record<Personality, { label: string; text: Record<RaceSituation, string> }> = {
  aggressive: { label: '도발', text: {
    win: '말했지. 오늘 아무도 못 따라올 거라고. 다음에도 똑같을 거야. 🏁',
    podium: '{pos}위? 다음엔 맨 위에 설 거다. 앞에 있던 차들, 준비해 둬.',
    points: '오늘은 {pos}위. 하지만 다음 주엔 내가 추월하는 장면만 보게 될 거야.',
    nopoints: '오늘 결과는 내 실력이 아니다. 다음 레이스에서 갚아 준다.',
    dnf: '레이스는 끝났지만 내 싸움은 안 끝났다. 다음 주 두고 보자.',
  } },
  calm: { label: '담담한 정리', text: {
    win: '좋은 하루였습니다. 팀의 준비 덕분입니다. 다음 레이스도 차분하게.',
    podium: '{gp} {pos}위. 할 수 있는 건 다 했습니다. 다음 주에 다시.',
    points: '{pos}위로 {pts}포인트. 쌓아 가는 시즌입니다.',
    nopoints: '오늘은 {pos}위. 원인을 차분히 보고 다음을 준비하겠습니다.',
    dnf: '아쉽지만 레이스의 일부입니다. 다음 주에 다시 출발합니다.',
  } },
  analytical: { label: '데이터 분석 공유', text: {
    win: '오늘 스틴트별 랩타임 그래프 공유합니다 📈 2스틴트 타이어 관리가 결정적이었어요.',
    podium: '{pos}위. 섹터 2에서 잃은 0.2초가 아쉽네요. 데이터 보면서 다음을 준비합니다 📊',
    points: '{grid}번 그리드 → {pos}위. 레이스 페이스 데이터는 나쁘지 않았습니다.',
    nopoints: '오늘 데이터를 보면 세팅 방향이 맞지 않았습니다. 엔지니어들과 다시 봅니다.',
    dnf: '{reason}로 리타이어. 원인 분석이 먼저입니다. 팀과 데이터를 확인하겠습니다.',
  } },
  instinctive: { label: '감정 그대로', text: {
    win: '아아아아악!!!! 믿기지가 않아!!!! 사랑해 여러분!!! 🏆🔥',
    podium: '포디움이다!!! 심장이 아직도 쿵쾅거려 😭🍾',
    points: '포인트!! 오늘 차 진짜 재밌었다 ㅋㅋ',
    nopoints: '아 진짜… 오늘 너무 답답했다 😤',
    dnf: '…말이 안 나온다. 미안해요 다들 💔',
  } },
  fighter: { label: '다음 레이스 다짐', text: {
    win: '이 맛에 싸운다. 하지만 아직 시즌은 길다. 계속 간다 💪',
    podium: '{pos}위. 끝까지 물고 늘어졌다. 다음엔 한 계단 더.',
    points: '쉽지 않은 레이스였지만 포기하지 않았다. {pts}포인트 챙겼다.',
    nopoints: '오늘은 졌다. 하지만 꺾이진 않았다. 다음 주에 다시 싸운다.',
    dnf: '넘어졌으면 일어나면 된다. 다음 레이스, 더 강하게.',
  } },
  showman: { label: '밈·영상 올리기', text: {
    win: '(우승 세리머니 슬로모션 영상) 오늘의 주인공 등장 😎🏆 #일요일엔우승',
    podium: '(샴페인 뿌리는 영상) 포디움 샤워 타임 🍾 다음엔 가운데 자리 예약',
    points: '(차 안 셀카) {pos}위 찍고 퇴근합니다 ✌️',
    nopoints: '(밈 사진) 오늘의 나: "괜찮아… 괜찮아…" 🙃',
    dnf: '(밈 사진) 내 차: "오늘은 여기까지 할게요" 🫠',
  } },
};

const COMMON: Record<Exclude<SnsTone, 'signature'>, { label: string; text: Record<RaceSituation, string> }> = {
  thanks: { label: '팀·팬에게 감사', text: {
    win: '{team} 모두 고마워요! 응원해 준 팬 여러분 덕분입니다 🙏',
    podium: '포디움! {team} 정말 고생 많았어요. 응원 감사합니다 🙏',
    points: '{pos}위로 포인트. 팀이 정말 열심히 해 줬어요. 감사합니다!',
    nopoints: '어려운 레이스였지만 끝까지 함께해 준 팀과 팬들께 감사드려요.',
    dnf: '팀에게 미안하고, 그래도 응원해 준 팬들께 감사합니다.',
  } },
  humble: { label: '겸손하게', text: {
    win: '운도 따랐습니다. 아직 배울 게 많아요.',
    podium: '좋은 결과지만 더 잘할 수 있었어요. 계속 배우겠습니다.',
    points: '{pos}위. 부족한 부분이 보였습니다. 더 노력하겠습니다.',
    nopoints: '제 실수도 있었습니다. 다음엔 더 잘하겠습니다.',
    dnf: '제가 더 잘했어야 했습니다. 죄송합니다.',
  } },
  bold: { label: '자신감 있게', text: {
    win: '오늘 차도 나도 최고였다. 이게 시작이다.',
    podium: '포디움은 당연한 자리. 다음엔 우승이다.',
    points: '{pos}위는 내 자리가 아니다. 곧 증명하겠다.',
    nopoints: '오늘은 차가 문제였다. 나는 준비돼 있다.',
    dnf: '내 잘못이 아니었다. 다음엔 아무도 못 막는다.',
  } },
  silent: { label: '올리지 않는다', text: {
    win: '(게시물 없음)', podium: '(게시물 없음)', points: '(게시물 없음)', nopoints: '(게시물 없음)', dnf: '(게시물 없음)',
  } },
};

function fillPost(t: string, r: MyRaceResult, gp: string, team: string): string {
  return t.replace(/\{pos\}/g, String(r.position ?? '')).replace(/\{grid\}/g, String(r.grid)).replace(/\{pts\}/g, String(r.points))
    .replace(/\{gp\}/g, gp).replace(/\{team\}/g, team).replace(/\{reason\}/g, r.reason ?? '사고');
}

/** 이번 결승 뒤 올릴 수 있는 글. 성격다운 글이 맨 앞 */
export function snsOptions(c: Career, r: MyRaceResult, gp: string): SnsOption[] {
  const s = situationOf(r);
  const team = c.contract?.team ?? '팀';
  const sig = SIGNATURE[c.driver.personality];
  const out: SnsOption[] = [{ id: 'signature', tone: 'signature', label: sig.label, text: fillPost(sig.text[s], r, gp, team), signature: true }];
  for (const tone of ['thanks', 'humble', 'bold', 'silent'] as const) out.push({ id: tone, tone, label: COMMON[tone].label, text: fillPost(COMMON[tone].text[s], r, gp, team) });
  return out;
}

const GOOD = (s: RaceSituation) => s === 'win' || s === 'podium';

/** 성격다운 글의 반응(결과가 좋을 때·나쁠 때) */
const SIGNATURE_EFFECT: Record<Personality, { good: SnsEffect; bad: SnsEffect }> = {
  aggressive: { good: { followersMul: 1.03, sentiment: 1, pressure: 2, reputation: -1 }, bad: { followersMul: 1.02, sentiment: -3, pressure: 4, reputation: -2 } },
  calm: { good: { followersMul: 1.008, sentiment: 2, pressure: -2, reputation: 1 }, bad: { followersMul: 1.004, sentiment: 2, pressure: -3, reputation: 1 } },
  analytical: { good: { followersMul: 1.01, sentiment: 1, pressure: -1, reputation: 2 }, bad: { followersMul: 1.006, sentiment: 1, pressure: -1, reputation: 2 } },
  instinctive: { good: { followersMul: 1.03, sentiment: 3, pressure: 1, reputation: 0 }, bad: { followersMul: 1.015, sentiment: 1, pressure: 3, reputation: -1 } },
  fighter: { good: { followersMul: 1.015, sentiment: 3, pressure: -1, reputation: 1 }, bad: { followersMul: 1.01, sentiment: 3, pressure: -1, reputation: 1 } },
  showman: { good: { followersMul: 1.04, sentiment: 2, pressure: 0, reputation: -1 }, bad: { followersMul: 1.025, sentiment: 1, pressure: 1, reputation: -1 } },
};

/** 글을 올린 뒤의 반응: 지표 변화와 한 줄 반응 */
export function snsReaction(c: Career, r: MyRaceResult, optionId: string): { effect: SnsEffect; reaction: string } {
  const good = GOOD(situationOf(r));
  const none: SnsEffect = { followersMul: 1, sentiment: 0, pressure: 0, reputation: 0 };
  switch (optionId) {
    case 'signature': {
      const e = SIGNATURE_EFFECT[c.driver.personality][good ? 'good' : 'bad'];
      const reaction = e.sentiment < 0 ? '성격다운 글이라 화제는 됐지만, 결과가 나쁜 날이라 역풍도 불었다.'
        : '"역시 이 선수답다" 진정성 있는 글에 팬들이 반응했다.';
      return { effect: e, reaction };
    }
    case 'thanks':
      return { effect: { followersMul: 1.008, sentiment: 2, pressure: 0, reputation: 0 }, reaction: '팀과 팬을 챙기는 글에 따뜻한 댓글이 달렸다.' };
    case 'humble':
      return good
        ? { effect: { followersMul: 1.006, sentiment: 2, pressure: -1, reputation: 1 }, reaction: '잘하고도 겸손한 모습에 호감이 올라갔다.' }
        : { effect: { followersMul: 1.002, sentiment: 1, pressure: -2, reputation: 1 }, reaction: '스스로를 돌아보는 글에 응원 댓글이 이어졌다.' };
    case 'bold':
      return good
        ? { effect: { followersMul: 1.02, sentiment: 1, pressure: 2, reputation: 0 }, reaction: '자신감 넘치는 글이 크게 퍼졌다. 기대도 그만큼 커졌다.' }
        : { effect: { followersMul: 1.01, sentiment: -3, pressure: 3, reputation: -2 }, reaction: '"결과부터 내라" 핑계처럼 보인다는 비판이 쏟아졌다.' };
    case 'silent':
      return { effect: { ...none, pressure: -1 }, reaction: '아무 글도 올리지 않았다. 조용히 다음 레이스를 준비한다.' };
    default:
      return { effect: none, reaction: '' };
  }
}

/** 시즌 동안 올린 글의 효과를 합친다(팔로워는 시즌 최대 ×1.5, 여론·압박·평판은 ±20) */
export function sumSnsEffects(effects: SnsEffect[]): SnsEffect {
  const clamp = (v: number) => Math.max(-20, Math.min(20, v));
  let mul = 1;
  let sentiment = 0;
  let pressure = 0;
  let reputation = 0;
  for (const e of effects) { mul *= e.followersMul; sentiment += e.sentiment; pressure += e.pressure; reputation += e.reputation; }
  return { followersMul: Math.min(1.5, mul), sentiment: clamp(sentiment), pressure: clamp(pressure), reputation: clamp(reputation) };
}
