// 실시간 커뮤니티 댓글(SPEC §6.1 v0.30): 레이스 중 사건마다, 그리고 시즌 반응 아래에서 계속 바뀌며 올라오는 짧은 댓글.
// 작성자와 내용은 모두 가상이다. 실존 인물의 말을 지어내지 않는다.

import type { Career, SeasonRecord } from './careerCore';
import { int, pick, rngFor, type Rng } from './rng';
import { PLATFORM_LABEL, type FanPlatform } from './feed';
import { seriesLabel } from './series';

export interface Chat { platform: FanPlatform; author: string; text: string }

export type RaceChatKey =
  | 'start' | 'passMe' | 'lostPlace' | 'leadMe' | 'sc' | 'vsc' | 'red' | 'rain' | 'pitMe' | 'scLonger' | 'scShorter' | 'crashMe' | 'mechMe' | 'ambient'
  | 'win' | 'firstWin' | 'podium' | 'firstPodium' | 'firstPoints' | 'points' | 'noPoints' | 'dnf';

const RACE: Record<RaceChatKey, string[]> = {
  start: ['스타트 집중!!', '1코너만 살아서 나가자', '{name} 출발 반응 좋았다', '오늘 느낌 좋음', '새벽에 깨어 있는 사람 손'],
  passMe: ['나이스 추월!!', '와 저기서 들어가네 ㅋㅋ', '{name} 브레이킹 미쳤다', '방금 거 하이라이트 각', '{code} 그냥 지나가 버렸네', '레이스크래프트 무엇'],
  lostPlace: ['아 뺏겼다', '방어 좀…', '타이어 다 됐나', '괜찮아 아직 랩 많이 남았다', '{code}한테 먹히는 건 좀 아프다'],
  leadMe: ['선두!!!!!!', '{name} P1 실화냐', '이대로만 가자 제발', '심장 떨려서 못 보겠다'],
  sc: ['세이프티카 나왔다! 피트 들어가?', '전략 싸움 시작', '이거 운 좋으면 대박이다', '사고 난 차 괜찮나', '박스 박스?'],
  vsc: ['VSC! 들어가면 싸게 갈아끼운다', 'VSC 금방 끝날 듯', '타이밍 중요한 순간'],
  red: ['레드 플래그 ㄷㄷ', '다들 무사해야 할 텐데', '레드 플래그면 공짜 타이어 교체네'],
  rain: ['비 온다!!', '{name} 비 오면 강하잖아', '인터 갈 타이밍 잘 잡아야 한다', '빗속 레이스 꿀잼 예약'],
  pitMe: ['피트스톱 깔끔!', '몇 초 걸렸냐', '언더컷 노리는 거 맞지?', '타이어 새 걸로 쭉 가자'],
  scLonger: ['세이프티카 길어진다 ㅋㅋ 들어간 사람 승리', '이러면 피트 들어간 게 정답', '안 끝나네 정리 오래 걸리나 봄'],
  scShorter: ['벌써 끝?? 생각보다 빨리 정리했네', '들어간 차들 손해 좀 보겠는데', '아 이건 운이 없다'],
  crashMe: ['안 돼……', '{name} 괜찮은 거지?', '오늘은 여기까지인가 ㅠㅠ', '헬멧 들썩이는 거 보니 괜찮아 보임'],
  mechMe: ['차가 배신했다', '엔진이 말을 안 듣네…', '이건 드라이버 잘못 아님', '정비팀 오늘 잠 못 자겠다'],
  ambient: ['오늘 {code} 페이스 좋다', '중계 카메라 {name} 좀 비춰 줘', '랩타임 꾸준하다', '타이어 관리 잘하는 중', '이 서킷 원래 추월 어렵잖아', '버티면 포인트 각', '라디오 한 번 들려줬으면', '편의점 다녀온 사이 순위 바뀜?'],
  win: ['우승!!!!!!!!!!', '{name} 해냈다ㅠㅠㅠ', '오늘 밤 잠 못 잔다', '국가 나온다 ㅠㅠ', '이 맛에 응원한다'],
  firstWin: ['첫 우승!!!!!!!! 역사적인 날', '{name} 생애 첫 우승 ㅠㅠㅠㅠ', '이 날을 얼마나 기다렸냐', '오늘 캡처 다 해 둔다'],
  podium: ['포디움!!', '샴페인 각', '{name} P{pos} 축하한다', '다음엔 가운데 서자'],
  firstPodium: ['첫 포디움!!! 샴페인 뿌린다', '{name} 포디움 실화냐 ㅠㅠ', '오늘 국뽕 차오른다'],
  firstPoints: ['오 운 좋다 ㅋㅋ 첫 포인트!', '첫 포인트 축하해!!!', '드디어 포인트 ㅠㅠ', '이제 시작이다 {name}', 'P{pos}도 포인트는 포인트지'],
  points: ['포인트 챙겼다', 'P{pos}면 오늘 할 만큼 했다', '꾸준히 쌓는 게 중요함', '좋은 레이스였다'],
  noPoints: ['아쉽다 P{pos}…', '오늘은 차가 안 따라 줬다', '다음 레이스 가자', '그래도 완주했으니까'],
  dnf: ['리타이어 ㅠㅠ', '오늘은 운이 없었다', '다음에 갚아 주자', '마음 아프다…'],
};

const SEASON_EXTRA = {
  champion: ['챔피언!!!!!! 평생 못 잊을 시즌', '{name} {series} 챔피언 ㅠㅠㅠ 울었다', '이 순간 보려고 새벽마다 깼다'],
  firstF1Points: ['오 운 좋다 ㅋㅋ 첫 F1 포인트!', 'F1 첫 포인트 축하한다 {name}', '처음 포인트 땄을 때 소리 지름'],
  winner: ['{wins}승 실화냐', '우승 장면 아직도 돌려 본다', '다음 시즌 타이틀 가즈아'],
  rookie: ['루키 시즌 이 정도면 합격', '{series} 적응 빠르다', '첫해부터 존재감 있네'],
  noSeat: ['시트 좀 줘라 제발', '이 실력에 시트가 없다고?', '기다린다 {name}'],
  military: ['전역 D-day 세는 중', '휴가 나오면 카트장 오나요', '건강하게만 돌아와라'],
};

const REDDIT = ['Undercut_Enjoyer', 'BoxBoxBox', 'SafetyCarSimp', 'DRS_Train', 'PurpleSector', 'TyreWhisperer', 'GravelTrapGuy', 'PitWallPundit'];
const KR = ['피트레인지기', '체커기수집가', 'DRS열림', '언더컷장인', '새벽레이스러', '헤어핀코너', '랩타임중독', '그리드걸음마', '타이어휘파람'];

function author(r: Rng, kr: boolean): { platform: FanPlatform; author: string } {
  const x = r();
  const platform: FanPlatform = kr ? (x < 0.55 ? 'dcinside' : x < 0.85 ? 'x' : 'reddit') : (x < 0.5 ? 'reddit' : x < 0.9 ? 'x' : 'dcinside');
  if (platform === 'reddit') return { platform, author: `u/${pick(r, REDDIT)}_${int(r, 1, 999)}` };
  if (platform === 'dcinside') return { platform, author: r() < 0.7 ? `ㅇㅇ(${int(r, 1, 223)}.${int(r, 0, 255)})` : pick(r, KR) };
  return { platform, author: `@${pick(r, KR)}${int(r, 1, 99)}` };
}

function fill(t: string, v: Record<string, string | number | undefined>): string {
  return t.replace(/\{(\w+)\}/g, (_m, k: string) => String(v[k] ?? ''));
}

/** 레이스 사건 하나에 붙는 댓글(같은 seed·key·n이면 같은 댓글) */
export function raceChat(seed: number, key: RaceChatKey, n: number, opts: { kr: boolean; name: string; code?: string; pos?: number }): Chat {
  const r = rngFor(seed, 'chat', key, n);
  const who = author(r, opts.kr);
  return { ...who, text: fill(pick(r, RACE[key]), { name: opts.name, code: opts.code, pos: opts.pos }) };
}

/** 시즌 반응 아래에서 돌아가며 보이는 댓글 8개 */
export function seasonChatter(c: Career, rec: SeasonRecord): Chat[] {
  const r = rngFor(c.seed, 'season-chat', rec.year);
  const kr = c.driver.nationality === 'KR';
  const v = { name: c.driver.name, series: seriesLabel(rec.series), wins: rec.wins, pos: rec.position ?? '-' };
  const pools: string[][] = [];
  const priorF1Points = c.history.some((h) => h.year < rec.year && h.series === 'f1' && h.points > 0);
  if (rec.military) pools.push(SEASON_EXTRA.military);
  else if (rec.seat === 'none') pools.push(SEASON_EXTRA.noSeat);
  if (rec.champion) pools.push(SEASON_EXTRA.champion);
  if (rec.series === 'f1' && rec.points > 0 && !priorF1Points) pools.push(SEASON_EXTRA.firstF1Points);
  if (rec.wins > 0 && !rec.champion) pools.push(SEASON_EXTRA.winner);
  if (c.history.filter((h) => h.series === rec.series && h.seat === 'race').length === 1 && rec.seat === 'race') pools.push(SEASON_EXTRA.rookie);
  const good = rec.expectedAvg - rec.actualAvg >= 0 && c.media.sentiment >= -20;
  pools.push(good ? RACE.points : RACE.noPoints, RACE.ambient);
  const out: Chat[] = [];
  const used = new Set<string>();
  for (let i = 0; i < 24 && out.length < 8; i++) {
    // 특별한 일이 있으면 그 댓글이 먼저, 자주 보이게
    const pool = pools[Math.min(pools.length - 1, i < 3 ? 0 : Math.floor(r() * pools.length))]!;
    const text = fill(pick(r, pool), v);
    if (used.has(text)) continue;
    used.add(text);
    out.push({ ...author(r, kr), text });
  }
  return out;
}

export const CHAT_PLATFORM_LABEL = PLATFORM_LABEL;
