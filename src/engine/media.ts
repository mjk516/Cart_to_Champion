// 언론·팬 지표(SPEC §6.1). M1에서는 시즌 단위로 갱신하고 헤드라인 1개를 만든다.
// 헤드라인은 가상 매체 이름만 쓰고, 실존 인물을 직접 인용하지 않는다.

import type { SeriesId } from './series';
import type { Personality, WealthTier } from './types';
import { WEALTH_TIERS } from './creation';

export interface Media {
  /** 언론 평판 0~100 */
  reputation: number;
  /** 팔로워 수 */
  followers: number;
  /** 팬 여론 −100~+100 */
  sentiment: number;
  /** 압박 0~100 */
  pressure: number;
}

export function initialMedia(): Media {
  return { reputation: 10, followers: 300, sentiment: 0, pressure: 10 };
}

const FAME: Record<SeriesId, number> = { kart: 0.1, f4: 0.2, freca: 0.3, f3: 0.45, f2: 0.65, f1: 1 };
const OUTLETS = ['패독 데일리', '그리드 위클리', '레이싱 코리아 뉴스'];
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export interface SeasonMediaInput {
  series: SeriesId;
  seriesLabel: string;
  name: string;
  position: number | null;
  fieldSize: number;
  wins: number;
  podiums: number;
  champion: boolean;
  /** 기대 순위 − 실제 순위(+면 기대 이상) */
  perfDelta: number;
  personality: Personality;
  wealthTier: WealthTier;
  raced: boolean;
  pressureRelief: number;
}

export function updateMediaSeason(m: Media, s: SeasonMediaInput): { media: Media; headline: string } {
  const fame = FAME[s.series];
  const wealth = WEALTH_TIERS[s.wealthTier];
  const p = s.personality;
  const pos = s.position ?? s.fieldSize;

  let repDelta = s.raced
    ? s.perfDelta * 1.5 + (s.champion ? 10 : 0) + s.wins * 0.8 + (pos <= 3 ? 4 : pos > s.fieldSize / 2 ? -3 : 0)
    : -6;
  repDelta *= 1 + wealth.reputationGain;
  if (p === 'calm') repDelta *= 0.7;
  const reputation = clamp(m.reputation * 0.85 + repDelta + fame * 8, 0, 100);

  const growth = (fame * 0.6 + s.wins * 0.03 + (s.champion ? 0.5 : 0)) * (p === 'showman' ? 1.3 : p === 'aggressive' ? 1.15 : 1);
  // 로그형: 팔로워가 많을수록 같은 성과로 느는 비율이 줄어든다(SPEC §6.1)
  const followers = Math.round(m.followers * (1 + growth / (1 + m.followers / 500_000)) + fame * 2000);

  const sentiment = clamp(m.sentiment * 0.6 + s.perfDelta * 3 + (s.champion ? 20 : 0) + (p === 'fighter' ? 5 : 0), -100, 100);
  const pressure = clamp(
    m.pressure * 0.5 + fame * 30 - s.perfDelta * 4 + (s.wealthTier >= 4 && s.perfDelta < 0 ? 10 : 0) + (p === 'showman' ? 10 : 0) - s.pressureRelief,
    0, 100,
  );

  const outlet = OUTLETS[(Math.abs(Math.round(s.perfDelta * 10)) + s.wins) % OUTLETS.length] as string;
  const headline = !s.raced
    ? `${outlet}: ${s.name}, 시트 없이 보낸 한 해`
    : s.champion
      ? `${outlet}: ${s.name}, ${s.seriesLabel} 챔피언 등극`
      : s.wins > 0
        ? `${outlet}: ${s.name}, ${s.seriesLabel} ${s.wins}승으로 종합 ${pos}위`
        : s.perfDelta >= 2
          ? `${outlet}: ${s.name}, 차의 한계를 넘은 시즌(종합 ${pos}위)`
          : s.perfDelta <= -2
            ? `${outlet}: ${s.name}, 기대에 못 미친 ${s.seriesLabel} 시즌(종합 ${pos}위)`
            : `${outlet}: ${s.name}, ${s.seriesLabel} 종합 ${pos}위`;

  return { media: { reputation, followers, sentiment, pressure }, headline };
}
