// 레이스 무전·사건 피드(SPEC v0.55): 트랙 뷰 배속 아래에 레이스 사건, 팀(엔지니어) 무전, 내 무전을 랩 순서로 보여 준다.
// 같은 레이스면 같은 무전이 나온다(시드). 욕설은 글자를 보이지 않고 ********로만 나온다.

import { rngFor, TYRE_NAME, type Classified, type Incident, type LapRecord, type Personality } from '../engine';

export type FeedFrom = 'team' | 'me' | 'event';
export interface FeedItem { lap: number; from: FeedFrom; text: string }

const BLEEP = '********';

/** 성격별 내 무전. swear: 화났을 때(추월당함·사고·팀 불만) 욕(********)을 섞는 확률 */
const ME_LINES: Record<Personality, { swear: number; overtook: string[]; passed: string[]; crash: string[]; gripe: string[]; win: string[]; podium: string[]; points: string[]; out: string[]; pit: string[] }> = {
  aggressive: {
    swear: 1,
    overtook: ['비켜! 여긴 내 자리야.', '하나 잡았다. 다음 차 누구야?', '문 닫을 줄 모르네. 그대로 지나갔어.'],
    passed: [`${BLEEP}! 저 차 블로킹 봤어?!`, `${BLEEP}, 저걸 그냥 보내줘?`, `${BLEEP}! 타이어가 하나도 안 잡혀!`],
    crash: [`${BLEEP}!!! 들이받았어! 차 끝났어!`, `${BLEEP}! 저 차가 날 밀었어!`],
    gripe: [`${BLEEP}! 이게 무슨 전략이야!`, `${BLEEP}, 날 왜 막아? 내가 더 빨라!`],
    win: ['봤지?! 처음부터 끝까지 내 레이스였어!', '이게 나야! 다 비켜!'],
    podium: ['포디움이다! 다음엔 맨 위로 간다.', '좋아, 근데 난 더 위를 원해.'],
    points: ['포인트는 챙겼어. 근데 이 정도로 만족 못 해.'],
    out: [`${BLEEP}... 오늘은 운이 없었어.`],
    pit: ['빨리빨리! 1초도 버리지 마!'],
  },
  instinctive: {
    swear: 0.6,
    overtook: ['느낌 왔어! 그냥 들어갔어!', '안쪽 비었길래 바로 찔렀어!'],
    passed: [`아 ${BLEEP}! 다시 잡을게!`, '아 진짜! 브레이크가 늦었어.'],
    crash: [`${BLEEP}! 순간 잃어버렸어...`, '미안해, 내가 너무 밀었어.'],
    gripe: [`${BLEEP}, 지금 들어가는 게 맞아?`, '감이 안 와, 이 전략 믿어도 돼?'],
    win: ['와아아! 믿기지가 않아!', '느낌대로 갔더니 우승이야!'],
    podium: ['포디움! 오늘 감 좋았어!'],
    points: ['포인트! 조금만 더 갔으면 좋았는데.'],
    out: ['미안해 다들... 다음엔 꼭.'],
    pit: ['들어간다! 빨리 보내줘!'],
  },
  fighter: {
    swear: 0.5,
    overtook: ['됐어! 끝까지 안 놓친다고 했지.', '하나씩 되찾는 중이야.'],
    passed: [`${BLEEP}! 아직 안 끝났어, 다시 간다.`, '잠깐 내줬을 뿐이야. 다시 붙는다.'],
    crash: [`${BLEEP}! 이렇게 끝나면 안 되는데...`],
    gripe: ['다시 생각해 봐. 나 아직 싸울 수 있어.'],
    win: ['끝까지 싸운 보람이 있어! 다들 고마워!'],
    podium: ['포디움! 포기 안 한 덕분이야.'],
    points: ['포인트 지켰어. 다음엔 더 위다.'],
    out: ['오늘은 졌지만 다음엔 안 진다.'],
    pit: ['좋아, 새 타이어로 다시 싸운다.'],
  },
  showman: {
    swear: 0,
    overtook: ['카메라 잡았지? 방금 거 하이라이트 각이야!', '팬들 함성 들려? 하나 더 간다!'],
    passed: ['괜찮아, 쇼는 이제부터야.', '잠깐 비켜준 거야. 더 멋지게 되찾을게.'],
    crash: ['이건... 하이라이트엔 안 나왔으면 좋겠다.'],
    gripe: ['이 전략, 팬들이 좋아할까?'],
    win: ['우승이다! 시상대에서 제대로 보여줄게!'],
    podium: ['포디움 세리머니 준비됐어!'],
    points: ['포인트! 팬들한테 손 흔들어도 되지?'],
    out: ['팬들한테 미안하네. 다음엔 더 멋진 쇼로.'],
    pit: ['피트 크루, 오늘도 멋지게 부탁해!'],
  },
  calm: {
    swear: 0,
    overtook: ['깔끔하게 넘었어. 페이스 유지할게.', '자리 잡았어. 타이어 아끼면서 간다.'],
    passed: ['알겠어. 타이어 아끼고 다시 붙을게.', '괜찮아, 아직 랩 많이 남았어.'],
    crash: ['미안해. 차 상태 확인해 줘.'],
    gripe: ['이유가 있겠지. 일단 따를게.'],
    win: ['고마워, 다들. 정말 완벽한 하루였어.'],
    podium: ['좋은 결과야. 팀 덕분이야.'],
    points: ['포인트 챙겼어. 차분하게 잘 버텼다.'],
    out: ['어쩔 수 없지. 다음 레이스 준비하자.'],
    pit: ['알겠어, 들어간다.'],
  },
  analytical: {
    swear: 0,
    overtook: ['예상한 대로 섹터 2에서 넘었어.', '탈출 속도가 좋았어. 데이터 확인해 줘.'],
    passed: ['저 차 직선 속도가 빨라. 섹터 2에서 다시 노릴게.', '앞 타이어가 먼저 갔어. 데이터 봐줘.'],
    crash: ['리어가 갑자기 빠졌어. 원인 분석 부탁해.'],
    gripe: ['이 판단 근거가 뭐야? 데이터로 설명해 줘.'],
    win: ['계획대로 됐어. 모델이 맞았네.'],
    podium: ['좋아. 남은 차이는 데이터로 줄이자.'],
    points: ['포인트 확보. 타이어 데이터 정리해 둘게.'],
    out: ['원인부터 정확히 찾아보자.'],
    pit: ['계산한 랩이야. 들어간다.'],
  },
};

const fmtLap = (sec: number) => `${Math.floor(sec / 60)}:${(sec % 60).toFixed(3).padStart(6, '0')}`;

/** 욕을 덜 하는 성격이면 ********를 빼고 말한다 */
function soften(t: string): string {
  return t.replaceAll(`${BLEEP}!!! `, '').replaceAll(`${BLEEP}! `, '').replaceAll(`${BLEEP}, `, '').replaceAll(`아 ${BLEEP}! `, '아! ').replaceAll(`${BLEEP}... `, '').trim();
}

export function buildRaceFeed(o: {
  seed: number; laps: LapRecord[]; incidents: Incident[]; classification: Classified[] | null; totalLaps: number; baseLap: number;
  me: string; mate?: string; name: string; personality: Personality; codeOf: (id: string) => string;
}): FeedItem[] {
  const out: FeedItem[] = [];
  const r = rngFor(o.seed, 'race-radio');
  const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)]!;
  const lines = ME_LINES[o.personality];
  const team = (lap: number, text: string) => out.push({ lap, from: 'team', text });
  const me = (lap: number, text: string) => out.push({ lap, from: 'me', text: text.includes(BLEEP) && r() >= lines.swear ? soften(text) || text : text });
  const event = (lap: number, text: string) => out.push({ lap, from: 'event', text });
  const posAt = (lap: number) => { const rec = o.laps[lap - 1]; return rec ? rec.order.findIndex((e) => e.id === o.me) + 1 : 0; };
  const gapAhead = (lap: number) => {
    const rec = o.laps[lap - 1];
    if (!rec) return null;
    const i = rec.order.findIndex((e) => e.id === o.me);
    if (i <= 0) return null;
    return { code: o.codeOf(rec.order[i - 1]!.id), gap: rec.order[i]!.gap - rec.order[i - 1]!.gap };
  };
  const rainStart = o.incidents.find((i) => i.type === 'rain_start')?.lap;
  const myOut = o.incidents.find((i) => (i.type === 'crash' || i.type === 'mech_dnf') && i.car === o.me);

  // 출발 전 날씨 예보
  team(1, rainStart ? `날씨: 레이더상 ${rainStart}랩쯤 비가 올 수 있어. 타이어 상태 계속 알려줘.` : '날씨: 레이스 내내 맑음. 비 걱정은 없어.');
  let lastGripe = -99;
  let ordered = -99;
  for (let lap = 1; lap <= o.totalLaps; lap++) {
    if (myOut && lap > myOut.lap) break;
    const rec = o.laps[lap - 1];
    const here = o.incidents.filter((i) => i.lap === lap);
    if (lap === 1) {
      const p0 = posAt(1);
      team(1, p0 ? `스타트 끝. 지금 P${p0}.` : '스타트 끝.');
    }
    if (rainStart && lap === rainStart - 3) team(lap, '날씨: 3랩 뒤 비가 온다. 피트 준비해 둘게.');
    for (const i of here) {
      switch (i.type) {
        case 'overtake':
          if (i.by === o.me) { me(lap, pick(lines.overtook)); if (r() < 0.6) team(lap, pick(['좋아, 깔끔했어!', `잘했어, P${i.position}.`, '그대로 가자!'])); }
          else if (i.on === o.me) { me(lap, pick(lines.passed)); team(lap, pick(['침착해. 다음 직선에서 DRS 있어.', '괜찮아, 랩 많이 남았어.', '타이어 아껴. 막판에 다시 잡자.'])); }
          break;
        case 'lead_change': event(lap, `${o.codeOf(i.leader)} 선두`); break;
        case 'pit':
          if (i.car === o.me) {
            team(lap, `박스, 박스. ${TYRE_NAME[i.compound]}로 간다.`);
            me(lap, pick(lines.pit));
            if (r() < 0.25 && lap - lastGripe > 8) { me(lap, pick(lines.gripe)); team(lap, '전략 그대로 가. 믿어줘.'); lastGripe = lap; }
          } else if (rec && rec.order.findIndex((e) => e.id === i.car) < 6) event(lap, `${o.codeOf(i.car)} 피트인 → ${TYRE_NAME[i.compound]}`);
          break;
        case 'crash':
        case 'mech_dnf':
          if (i.car === o.me) {
            me(lap, pick(lines.crash));
            team(lap, i.type === 'crash' ? '괜찮아? 다친 데 없으면 그걸로 됐어. 차 세우고 나와.' : '엔진 문제야. 차 세워. 정말 미안해.');
          } else event(lap, `${o.codeOf(i.car)} ${i.type === 'crash' ? '사고' : '기계 결함'} · OUT`);
          break;
        case 'sc_deploy': event(lap, '세이프티카 출동'); team(lap, '세이프티카. 델타 지키고 타이어 온도 유지해.'); break;
        case 'vsc_deploy': event(lap, 'VSC 발령'); team(lap, 'VSC. 델타 지켜, 앞차 간격 유지.'); break;
        case 'red_flag': event(lap, '레드 플래그 · 세션 중단'); team(lap, '레드 플래그. 피트레인으로 들어와.'); break;
        case 'restart': team(lap, '곧 재시작. 타이어 데워 둬.'); break;
        case 'sc_end': case 'vsc_end': event(lap, i.type === 'sc_end' ? '세이프티카 복귀' : 'VSC 해제'); break;
        case 'rain_start': event(lap, '비 시작'); team(lap, '비 온다. 브레이킹 일찍 가져가.'); break;
        case 'rain_stop': event(lap, '비 그침'); team(lap, '트랙이 마르고 있어. 라인 따라 달려.'); break;
        default: break;
      }
    }
    // 팀메이트와 붙어 달리면 팀 오더
    if (o.mate && rec && lap - ordered > 12 && lap > 3 && rec.phase === 'green') {
      const mi = rec.order.findIndex((e) => e.id === o.me), ti = rec.order.findIndex((e) => e.id === o.mate);
      if (mi >= 0 && ti >= 0 && Math.abs(mi - ti) === 1 && Math.abs(rec.order[mi]!.gap - rec.order[ti]!.gap) < 1.2) {
        ordered = lap;
        if (ti < mi) {
          team(lap, `팀 오더: ${o.codeOf(o.mate)} 공격하지 마. 포지션 유지해.`);
          me(lap, pick(lines.gripe));
        } else team(lap, `팀 오더: ${o.codeOf(o.mate)}랑 싸우지 마. 타이어 아껴.`);
      }
    }
    // 5랩마다 랩타임·앞차 간격·페이스
    if (lap % 5 === 0 && rec && rec.phase === 'green' && lap < o.totalLaps) {
      const prev = o.laps[lap - 2];
      const g = rec.order.find((e) => e.id === o.me)?.gap ?? 0, gp = prev?.order.find((e) => e.id === o.me)?.gap ?? g;
      const lt = o.baseLap * (rec.wet ? 1.06 : 1) + (g - gp) + r() * 0.35;
      const ahead = gapAhead(lap);
      const before = posAt(Math.max(1, lap - 5)), now = posAt(lap);
      const pace = now < before ? '페이스 좋아, 이대로 가자.' : now > before ? '페이스가 떨어지고 있어. 타이어 확인해.' : '페이스 안정적이야.';
      team(lap, `랩타임 ${fmtLap(lt)} · ${ahead ? (ahead.gap < 0.1 ? `앞차 ${ahead.code} 바로 뒤` : `앞차 ${ahead.code}와 ${ahead.gap.toFixed(1)}초`) : '선두야'} · ${pace}`);
    }
  }
  // 결과: 우승·포디움 축하, 포인트 격려, 포인트 밖·리타이어 위로
  const res = o.classification?.find((c) => c.id === o.me);
  if (res && !myOut) {
    const L = o.totalLaps;
    if (res.position === 1) { team(L, `우승이야!!! 최고야, ${o.name}! P1!`); me(L, pick(lines.win)); }
    else if (res.position <= 3) { team(L, `포디움! P${res.position}! 대단했어!`); me(L, pick(lines.podium)); }
    else if (res.points > 0) { team(L, `P${res.position}, 포인트 챙겼어. 잘했어, 다음엔 더 위로 가자.`); me(L, pick(lines.points)); }
    else { team(L, `P${res.position}. 힘든 레이스였어. 데이터 보고 다시 준비하자. 고생했어.`); me(L, pick(lines.out)); }
  } else if (myOut) {
    me(myOut.lap, pick(lines.out));
    team(myOut.lap, '오늘은 운이 없었어. 다음 레이스에서 갚아주자.');
  }
  return out;
}
