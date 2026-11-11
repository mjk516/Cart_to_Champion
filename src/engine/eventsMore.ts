// M3 이벤트 확장(SPEC §6 v0.20, v0.30): 시즌 뒤 기자회견 20개 + 일반 이벤트 28개.
// 기자회견은 질문 1개에 답변 톤 4개(겸손·자신감·도발·농담). 결과 확률은 기질(tempMul)에 따라 달라진다.
// 실존 인물의 말을 지어내거나 실존 인물·팀을 깎아내리는 내용은 넣지 않는다(SPEC §11).

import type { EventCtx, EventDef, EventOption } from './events';

const JUNIOR = (x: EventCtx) => x.series !== 'f1';
const bad = (x: EventCtx) => (x.temperament === 'bad' ? 2.5 : x.temperament === 'neutral' ? 1.2 : 0.5);

/** 기자회견 답변 세 가지. 각 질문이 결과 문구만 바꿔 넣는다 */
function tones(t: {
  humble: [string, string];
  confident: [string, string];
  bold: [string, string];
  /** 농담으로 넘기기. 없으면 공통 문구 */
  joke?: [string, string];
  /** 자신감 답변이 역풍을 맞기 쉬운 상황(성적 부진 등) */
  riskyConfidence?: boolean;
}): EventOption[] {
  const rc = t.riskyConfidence ? 0.55 : 0.25;
  const joke = t.joke ?? ['농담 한마디에 회견장이 웃음바다가 됐다. 짧은 클립이 하루 종일 돌았다.', '농담이 전혀 먹히지 않았다. 어색한 침묵이 그대로 영상에 남았다.'];
  return [
    { id: 'humble', label: '겸손하게 답한다', hint: '팬 여론 +, 압박 −', outcomes: [
      { p: 0.8, text: t.humble[0], effect: { sentiment: 6, pressure: -6, reputation: 1 } },
      { p: 0.2, text: t.humble[1], effect: { sentiment: 2, pressure: -3, reputation: -1 } },
    ] },
    { id: 'confident', label: '자신 있게 답한다', hint: '언론 평판 +, 성적이 나쁘면 역풍', outcomes: [
      { p: 1 - rc, text: t.confident[0], effect: { reputation: 5, followersMul: 1.04, pressure: 3 } },
      { p: rc, text: t.confident[1], effect: { reputation: -3, sentiment: -5, pressure: 8 } },
    ] },
    { id: 'bold', label: '도발적으로 답한다', hint: '팬 수 크게 +, 여론 갈림, 팀 내 입지 −', outcomes: [
      { p: 0.5, text: t.bold[0], effect: { followersMul: 1.15, sentiment: 6, reputation: 2, flags: { releaseRisk: 0.02 } }, tempMul: { bad: 1.4, good: 0.7 } },
      { p: 0.5, text: t.bold[1], effect: { followersMul: 1.08, sentiment: -10, reputation: -4, pressure: 6, flags: { releaseRisk: 0.05 } }, tempMul: { bad: 0.8, good: 1.3 } },
    ] },
    { id: 'joke', label: '농담으로 넘긴다', hint: '잘 먹히면 팬 여론·팔로워 +, 아니면 평판 −', outcomes: [
      { p: 0.55, text: joke[0], effect: { sentiment: 5, followersMul: 1.06, pressure: -4 }, tempMul: { good: 1.2, bad: 0.9 } },
      { p: 0.45, text: joke[1], effect: { reputation: -3, sentiment: -2, pressure: 2 } },
    ] },
  ];
}

export const INTERVIEWS: EventDef[] = [
  {
    id: 'iv_champion', category: 'interview', title: '챔피언 기자회견',
    text: '"챔피언이 된 소감과 함께, 다음 목표를 말해 주세요."',
    when: (x) => x.champion, weight: () => 5,
    options: tones({
      humble: ['"팀 덕분입니다." 한마디에 박수가 쏟아졌다.', '너무 담담한 소감에 "챔피언답지 않다"는 말도 나왔다.'],
      confident: ['"이건 시작일 뿐입니다." 다음 날 1면 제목이 됐다.', '"당연한 결과"라는 말이 오만하게 들렸다는 반응이 나왔다.'],
      bold: ['"내년엔 더 크게 이깁니다. 다들 각오하세요." 영상 조회수가 폭발했다.', '라이벌을 겨냥한 말이 논란이 됐다. 우승의 기쁨이 묻혔다.'],
    }),
  },
  {
    id: 'iv_winner', category: 'interview', title: '우승자 기자회견',
    text: '"올 시즌 레이스 우승을 거뒀습니다. 타이틀 경쟁에서 밀린 이유는 뭐라고 보세요?"',
    when: (x) => x.wins > 0 && !x.champion, weight: () => 3,
    options: tones({
      humble: ['"아직 배울 게 많습니다." 성숙하다는 평이 나왔다.', '"그래서 이길 수 있겠냐"는 냉소적인 기사도 있었다.'],
      confident: ['"다음 시즌 타이틀은 제 겁니다." 팬들이 들썩였다.', '자신감이 지나치다는 지적과 함께 기대치가 확 올라갔다.'],
      bold: ['"차만 받쳐 주면 아무도 못 따라옵니다." 팬들은 열광했다.', '팀을 탓하는 말로 들렸다. 팀 분위기가 싸늘해졌다.'],
    }),
  },
  {
    id: 'iv_slump', category: 'interview', title: '부진 질문',
    text: '"기대에 못 미친 시즌이었습니다. 원인이 뭐라고 생각하세요?"',
    when: (x) => x.perf <= -1.5, weight: () => 4,
    options: tones({
      humble: ['"제 실수가 많았습니다." 솔직함에 팬들이 응원을 보냈다.', '변명 없는 답이었지만 "그래서 대책은?"이라는 질문이 이어졌다.'],
      confident: ['"내년엔 다를 겁니다." 반등을 기대하는 기사가 나왔다.', '성적이 안 나왔는데 큰소리를 친다는 역풍이 불었다.'],
      bold: ['"이 차로는 누구도 못 했을 겁니다." 팬들은 공감했다.', '팀을 공개적으로 깎아내렸다는 비판이 쏟아졌다.'],
      riskyConfidence: true,
    }),
  },
  {
    id: 'iv_breakthrough', category: 'interview', title: '돌풍의 주인공',
    text: '"차 성능 이상의 결과를 냈습니다. 비결이 뭔가요?"',
    when: (x) => x.perf >= 2 && x.wins === 0, weight: () => 3,
    options: tones({
      humble: ['"팀이 만든 결과입니다." 팀 관계자들이 흐뭇해했다.', '공을 너무 돌린 탓에 존재감이 덜 드러났다.'],
      confident: ['"원래 이 정도는 합니다." 상위 팀 관계자들이 관심을 보였다.', '"한 시즌 반짝"이라는 냉소가 따라붙었다.'],
      bold: ['"더 좋은 차를 주면 우승합니다." 영입 루머가 돌기 시작했다.', '지금 팀을 떠나고 싶다는 말로 읽혔다.'],
    }),
  },
  {
    id: 'iv_f1_rookie', category: 'interview', title: 'F1 루키 시즌 결산',
    text: '"F1 첫 시즌을 마쳤습니다. 하부 리그와 가장 달랐던 점은요?"',
    when: (x) => x.f1Rookie, weight: () => 5,
    options: tones({
      humble: ['"매 랩이 배움이었습니다." 성실한 루키라는 평이 나왔다.', '무난한 답이라 기사 한 줄로 끝났다.'],
      confident: ['"이미 적응은 끝났습니다." 2년 차를 기대하는 목소리가 커졌다.', '첫 시즌 성적에 비해 말이 크다는 반응이 나왔다.'],
      bold: ['"선배들도 이제 저를 신경 써야 할 겁니다." 패독이 술렁였다.', '루키가 선을 넘었다는 말이 나왔다.'],
    }),
  },
  {
    id: 'iv_teammate', category: 'interview', title: '팀메이트 질문',
    text: '"팀메이트와의 비교가 계속 나옵니다. 어떻게 생각하세요?"',
    when: (x) => x.hasTeammate && x.seat === 'race', weight: (x) => 1 + bad(x) * 0.4,
    options: tones({
      humble: ['"서로 밀어 주는 사이입니다." 팀이 만족했다.', '"경쟁심이 없다"는 해석도 나왔다.'],
      confident: ['"숫자가 말해 줄 겁니다." 팬들이 데이터를 뒤지기 시작했다.', '팀메이트 팬들이 발끈했다.'],
      bold: ['"비교 대상이 아니죠." 클립이 퍼지며 팔로워가 늘었다.', '팀 안에서 불편한 기류가 생겼다.'],
    }),
  },
  {
    id: 'iv_f1_dream', category: 'interview', title: 'F1 꿈에 대한 질문',
    text: '"F1까지 얼마나 남았다고 보세요?"',
    when: (x) => JUNIOR(x) && x.age >= 15 && x.seat === 'race', weight: () => 1.5,
    options: tones({
      humble: ['"한 계단씩 가겠습니다." 차분한 유망주라는 평이 나왔다.', '야망이 부족해 보인다는 스카우트 메모가 남았다.'],
      confident: ['"2~3년 안에 그리드에 서겠습니다." 스카우트들이 이름을 적어 갔다.', '아직 이르다는 반응과 함께 부담이 커졌다.'],
      bold: ['"F1 팀들이 먼저 연락하게 만들겠습니다." 화제가 됐다.', '건방지다는 평이 하부 리그 패독에 돌았다.'],
    }),
  },
  {
    id: 'iv_money', category: 'interview', title: '"돈으로 산 시트" 질문',
    text: '"집안 후원 덕에 시트를 얻었다는 말이 있습니다."',
    when: (x) => x.wealthTier >= 4 && x.seat === 'race', weight: () => 2,
    options: tones({
      humble: ['"결과로 증명하겠습니다." 깔끔한 답이라는 평가를 받았다.', '말보다 결과를 보자는 냉정한 반응이 많았다.'],
      confident: ['"기록을 보시면 됩니다." 실력파 이미지가 조금 생겼다.', '기록이 따라 주지 않아 말이 공허하게 들렸다.'],
      bold: ['"부러우면 지는 겁니다." 밈이 됐다.', '최악의 답변이라는 기사가 줄을 이었다.'],
      riskyConfidence: true,
    }),
  },
  {
    id: 'iv_veteran', category: 'interview', title: '은퇴 질문',
    text: '"은퇴 시점에 대한 질문이 많아지고 있습니다."',
    when: (x) => x.age >= 33, weight: () => 2.5,
    options: tones({
      humble: ['"몸이 허락하는 한 달리겠습니다." 응원이 쏟아졌다.', '"이제 마지막인가"라는 기사가 나왔다.'],
      confident: ['"아직 제가 제일 빠릅니다." 베테랑의 자존심에 박수가 나왔다.', '나이 질문을 피했다는 반응이 나왔다.'],
      bold: ['"은퇴 얘기는 제가 질 때나 하세요." 명언이 됐다.', '예민하게 반응했다는 말이 돌았다.'],
    }),
  },
  {
    id: 'iv_rival', category: 'interview', title: '라이벌 질문',
    text: '"올 시즌 가장 까다로운 상대는 누구였나요?"',
    when: (x) => x.pct >= 0.6 && x.seat === 'race', weight: () => 1.5,
    options: tones({
      humble: ['"모두가 강했습니다." 존중하는 태도가 좋다는 평이 나왔다.', '답을 피했다는 말도 나왔다.'],
      confident: ['"까다로운 상대는 없었습니다." 기자들이 웃었다.', '오만하다는 반응이 라이벌 팬들 사이에서 퍼졌다.'],
      bold: ['"내년엔 그 친구가 저를 까다로워할 겁니다." 라이벌 구도가 생겼다.', '라이벌 팬들과 설전이 붙었다.'],
    }),
  },
  {
    id: 'iv_home', category: 'interview', title: '홈 팬 질문',
    text: '"다음 시즌 홈 그랑프리를 앞두고 한마디 해 주세요."',
    when: (x) => x.home && x.f1, weight: () => 2,
    options: tones({
      humble: ['"응원만으로 힘이 납니다." 홈 팬들이 감동했다.', '조금 밋밋하다는 반응이었다.'],
      confident: ['"홈에서 포디움에 서겠습니다." 티켓 문의가 늘었다.', '홈 팬의 기대가 부담으로 돌아왔다.'],
      bold: ['"홈에선 아무도 저를 못 이깁니다." 관중석이 들썩였다.', '홈 팬들의 기대치가 지나치게 올라갔다.'],
    }),
  },
  {
    id: 'iv_strategy', category: 'interview', title: '팀 전략 질문',
    text: '"레이스 중 팀 전략에 불만을 보인 장면이 있었습니다."',
    when: (x) => x.hasTeammate && x.seat === 'race', weight: (x) => 0.4 * bad(x),
    options: tones({
      humble: ['"팀과 충분히 이야기했습니다." 불씨가 꺼졌다.', '그래도 불화설이 완전히 가라앉지는 않았다.'],
      confident: ['"제 판단이 맞았다고 봅니다." 데이터가 뒷받침해 줬다.', '팀 수뇌부가 불편해했다.'],
      bold: ['"다음엔 제 뜻대로 하겠습니다." 팬들은 박수를 쳤다.', '팀 오더를 무시하겠다는 선언으로 받아들여졌다.'],
    }),
  },  {
    id: 'iv_dnf', category: 'interview', title: '리타이어 질문',
    text: '"올 시즌 리타이어가 잦았습니다. 차 문제인가요, 운전 문제인가요?"',
    when: (x) => x.seat === 'race' && x.perf <= -0.5, weight: () => 2,
    options: tones({
      humble: ['"둘 다 제가 더 잘했어야 합니다." 팀 정비사들이 고마워했다.', '"결국 본인 실수라는 거냐"는 제목이 붙었다.'],
      confident: ['"끝까지 달린 레이스만 보세요." 완주 레이스 기록이 재조명됐다.', '리타이어 영상이 다시 돌면서 말이 무색해졌다.'],
      bold: ['"차가 버텨 주면 제가 끝까지 갑니다." 팬들은 고개를 끄덕였다.', '정비팀을 겨냥한 말로 들려 차고 분위기가 무거워졌다.'],
      joke: ['"올해는 집에 일찍 가는 게 취미였나 봐요." 자조 섞인 농담에 다들 웃었다.', '자기 리타이어를 농담으로 넘기자 "진지함이 없다"는 비판이 나왔다.'],
      riskyConfidence: true,
    }),
  },
  {
    id: 'iv_rain', category: 'interview', title: '빗속의 레이스',
    text: '"비가 오면 유독 강해 보입니다. 비법이 있나요?"',
    when: (x) => x.seat === 'race' && x.pct >= 0.5, weight: () => 1,
    options: tones({
      humble: ['"카트 시절부터 비를 좋아했어요." 소박한 답이 호감을 샀다.', '비법을 숨긴다는 농담 섞인 기사가 나왔다.'],
      confident: ['"빗속에선 제가 제일 빠릅니다." 레인 마스터라는 별명이 붙었다.', '다음 우천 레이스에서 증명하라는 압박이 생겼다.'],
      bold: ['"매 레이스 비가 왔으면 좋겠네요." 팬들이 기우제 밈을 만들었다.', '다른 드라이버들이 "두고 보자"고 받아쳤다.'],
      joke: ['"우산을 안 들고 다녀서요." 회견장이 웃음으로 가득 찼다.', '아무도 웃지 않았다. 기자가 다음 질문으로 넘어갔다.'],
    }),
  },
  {
    id: 'iv_social', category: 'interview', title: 'SNS 논란 질문',
    text: '"SNS에 올린 영상이 화제가 됐습니다. 레이스에 집중하고 있는 건가요?"',
    when: (x) => x.followers >= 200_000, weight: () => 1.5,
    options: tones({
      humble: ['"앞으로는 트랙에 더 집중하겠습니다." 논란이 금방 잦아들었다.', '사과처럼 들려 오히려 영상이 더 퍼졌다.'],
      confident: ['"트랙에서도, 밖에서도 제 모습입니다." 팬들이 지지했다.', '"성적부터 내라"는 댓글이 쏟아졌다.'],
      bold: ['"다음 영상도 기대하세요." 조회수가 두 배가 됐다.', '팀 홍보 담당자가 머리를 감쌌다.'],
      joke: ['"편집은 제가 안 했어요." 영상 편집자까지 유명해졌다.', '농담이 또 다른 짤이 되어 놀림감이 됐다.'],
    }),
  },
  {
    id: 'iv_contract', category: 'interview', title: '이적설 질문',
    text: '"다른 팀과 접촉했다는 보도가 있습니다. 사실인가요?"',
    when: (x) => x.seat === 'race' && x.pct >= 0.55, weight: () => 1.5,
    options: tones({
      humble: ['"지금 팀에 집중하고 있습니다." 팀이 안도했다.', '부인하지 않았다는 해석이 나왔다.'],
      confident: ['"좋은 드라이버에게는 연락이 오기 마련이죠." 몸값이 올랐다는 기사가 나왔다.', '팀이 협상 테이블에서 불쾌해했다.'],
      bold: ['"더 좋은 제안이 오면 생각해 보겠습니다." 이적 시장이 술렁였다.', '지금 팀과의 관계가 차갑게 식었다.'],
      joke: ['"제 전화기는 늘 무음이에요." 기자들이 웃으며 받아 적었다.', '답을 피한 농담이 오히려 이적설에 불을 붙였다.'],
    }),
  },
  {
    id: 'iv_young_star', category: 'interview', title: '최연소 기록 질문',
    text: '"이 나이에 이 정도 성적은 드뭅니다. 부담은 없나요?"',
    when: (x) => x.age <= 19 && x.pct >= 0.7 && x.seat === 'race', weight: () => 2,
    options: tones({
      humble: ['"아직 학생이에요. 숙제가 더 무섭습니다." 귀엽다는 반응이 많았다.', '너무 어려 보인다는 스카우트 메모가 남았다.'],
      confident: ['"나이는 숫자일 뿐입니다." 차세대 스타라는 기사가 쏟아졌다.', '기대가 지나치게 커졌다.'],
      bold: ['"기록은 깨라고 있는 거죠." 패독 전체가 이름을 기억하게 됐다.', '어린 나이에 건방지다는 평이 따라붙었다.'],
    }),
  },
  {
    id: 'iv_family', category: 'interview', title: '가족 질문',
    text: '"가정을 꾸린 뒤 레이스 스타일이 달라졌다는 말이 있습니다."',
    when: (x) => x.family && x.seat === 'race', weight: () => 2,
    options: tones({
      humble: ['"가족이 저를 더 단단하게 해 줍니다." 따뜻한 기사가 나왔다.', '"승부욕이 줄었다"는 해석이 붙었다.'],
      confident: ['"여전히 빠릅니다. 더 똑똑해졌을 뿐이죠." 베테랑다운 답이라는 평가를 받았다.', '기록이 받쳐 주지 않아 설득력이 떨어졌다.'],
      bold: ['"아이에게 우승 트로피를 보여 줄 겁니다." 팬들이 응원을 보냈다.', '사생활 질문에 날을 세웠다는 기사가 나왔다.'],
      joke: ['"요즘 제일 무서운 건 기저귀 갈기예요." 회견장이 웃음바다가 됐다.', '가족 얘기를 농담거리로 삼았다는 지적이 나왔다.'],
    }),
  },
  {
    id: 'iv_team_car', category: 'interview', title: '차 성능 질문',
    text: '"차가 경쟁 팀보다 느리다는 평가가 많습니다. 드라이버로서 어떤가요?"',
    when: (x) => x.f1 && x.seat === 'race' && x.teamRank >= 6 && x.teamRank < 99, weight: () => 2.5,
    options: tones({
      humble: ['"팀이 열심히 개발하고 있습니다." 팀 공장에서 박수가 나왔다.', '"그래서 언제 빨라지냐"는 질문이 이어졌다.'],
      confident: ['"이 차에서 뽑을 건 다 뽑았습니다." 상위 팀들이 관심을 보였다.', '팀이 들으면 서운할 말이라는 반응이 나왔다.'],
      bold: ['"좋은 차 주시면 바로 보여 드리죠." 영입 루머가 돌았다.', '팀 대표가 공개적으로 불쾌감을 드러냈다.'],
      joke: ['"직선에서 경치 구경할 시간은 충분합니다." 밈이 됐다.', '팀 엔지니어들이 웃지 않았다.'],
      riskyConfidence: true,
    }),
  },
  {
    id: 'iv_fan_question', category: 'interview', title: '팬 질문 코너',
    text: '"팬 질문입니다. 레이스 전날 밤에는 뭘 하세요?"',
    when: (x) => x.seat === 'race', weight: () => 0.8,
    options: tones({
      humble: ['"일찍 자요. 그게 전부입니다." 성실하다는 반응이 나왔다.', '너무 재미없는 답이라는 댓글이 달렸다.'],
      confident: ['"온보드 영상을 백 번 봅니다." 프로답다는 평이 나왔다.', '"그런데 왜 실수하냐"는 반응도 있었다.'],
      bold: ['"우승 세리머니를 연습합니다." 팬들이 열광했다.', '다음 레이스에서 못 이기자 놀림감이 됐다.'],
      joke: ['"게임에서 제 팀으로 우승합니다." 팬들이 따라 하기 시작했다.', '농담인지 진심인지 헷갈린다는 반응이었다.'],
    }),
  },
];

export const MORE_EVENTS: EventDef[] = [
  // ── 훈련 7 ────────────────────────────────────────────────────────
  {
    id: 'data_session', category: 'training', title: '데이터 분석 세션',
    text: '엔지니어가 지난 시즌 텔레메트리를 같이 보자고 한다. 하루 종일 걸린다.',
    when: (x) => x.age >= 15,
    options: [
      { id: 'yes', label: '끝까지 본다', hint: '타이어 관리·피드백 성장', outcomes: [
        { p: 0.8, text: '브레이크 포인트마다 0.1초씩 남기고 있었다는 걸 알았다.', effect: { stats: { tyre: 1, feedback: 2 } } },
        { p: 0.2, text: '숫자에 파묻혀 머리만 아팠다.', effect: { stats: { feedback: 1 }, pressure: 3 } },
      ] },
      { id: 'no', label: '감각을 믿는다', outcomes: [{ p: 1, text: '데이터보다 몸이 기억하는 걸 믿기로 했다.', effect: { stats: { pace: 1 } } }] },
    ],
  },
  {
    id: 'reaction_training', category: 'training', title: '반응 속도 훈련',
    text: '스포츠 과학 연구소가 반응 속도 훈련 프로그램 참가를 제안했다. 비용은 {amount}.',
    amountUnits: -2, when: (x) => x.age >= 13,
    options: [
      { id: 'join', label: '참가한다', hint: '속도·레이스크래프트 성장, 비용', outcomes: [
        { p: 0.7, text: '스타트 반응이 확실히 빨라졌다.', effect: { stats: { pace: 1, racecraft: 1 }, fundsUnits: -2 } },
        { p: 0.3, text: '효과는 미미했다. 그래도 루틴 하나는 생겼다.', effect: { stats: { consistency: 1 }, fundsUnits: -2 } },
      ] },
      { id: 'skip', label: '건너뛴다', outcomes: [{ p: 1, text: '돈은 아꼈다.', effect: {} }] },
    ],
  },
  {
    id: 'tyre_test', category: 'training', title: '타이어 개발 테스트',
    text: '타이어 공급사가 신형 컴파운드 테스트 드라이버를 찾는다. 사례비가 나온다.',
    when: (x) => x.age >= 17 && (x.series === 'f2' || x.series === 'f3' || x.f1),
    options: [
      { id: 'yes', label: '맡는다', hint: '타이어 관리 성장, 자금 +', outcomes: [
        { p: 0.85, text: '타이어가 무너지는 순간을 몸으로 배웠다.', effect: { stats: { tyre: 2 }, fundsUnits: 2 } },
        { p: 0.15, text: '긴 런 끝에 허리가 고장 났다. 회복에 시간이 걸렸다.', effect: { stats: { tyre: 1 }, fundsUnits: 2, pressure: 5 } },
      ] },
      { id: 'no', label: '휴식을 택한다', outcomes: [{ p: 1, text: '겨울을 푹 쉬었다.', effect: { pressure: -5 } }] },
    ],
  },
  {
    id: 'night_driving', category: 'training', title: '야간 주행 연습',
    text: '시가지·야간 레이스를 대비한 야간 주행 연습 기회가 생겼다.',
    when: (x) => x.age >= 16,
    options: [
      { id: 'yes', label: '연습한다', hint: '일관성 성장', outcomes: [
        { p: 0.8, text: '조명 아래 거리 감각이 잡혔다.', effect: { stats: { consistency: 2 } } },
        { p: 0.2, text: '가드레일에 살짝 긁혔다. 그래도 배운 건 있다.', effect: { stats: { consistency: 1 }, fundsUnits: -1 } },
      ] },
      { id: 'no', label: '다음에 한다', outcomes: [{ p: 1, text: '이번엔 넘겼다.', effect: {} }] },
    ],
  },
  {
    id: 'race_engineer_swap', category: 'training', title: '레이스 엔지니어 교체',
    text: '{team}이 새 레이스 엔지니어를 붙여 주겠다고 한다. 지금 엔지니어와는 손발이 잘 맞는다.',
    when: (x) => x.seat === 'race' && x.age >= 16,
    options: [
      { id: 'new', label: '새 엔지니어와 해 본다', hint: '모험: 크게 오르거나 흔들림', outcomes: [
        { p: 0.6, text: '새 엔지니어의 셋업 철학이 딱 맞았다.', effect: { stats: { feedback: 2, tyre: 1 } } },
        { p: 0.4, text: '무전 호흡이 어긋났다. 적응에 한 시즌이 걸릴 것 같다.', effect: { stats: { consistency: -1 }, pressure: 6 } },
      ] },
      { id: 'keep', label: '지금 엔지니어를 지킨다', hint: '팀 내 입지 단단', outcomes: [{ p: 1, text: '익숙한 목소리가 계속 무전에서 들린다.', effect: { stats: { consistency: 1 }, flags: { releaseRisk: -0.01 } } }] },
    ],
  },
  {
    id: 'rally_cross', category: 'training', title: '랠리크로스 이벤트',
    text: '겨울 랠리크로스 이벤트에 초청받았다. 미끄러운 노면에서 차를 다루는 법을 배울 수 있다.',
    when: (x) => x.age >= 16 && JUNIOR(x),
    options: [
      { id: 'go', label: '나간다', hint: '우천·레이스크래프트 성장, 부상 위험', outcomes: [
        { p: 0.75, text: '흙길에서 배운 차 컨트롤이 빗길에서 빛날 것 같다.', effect: { stats: { wet: 2, racecraft: 1 }, followersMul: 1.03 } },
        { p: 0.25, text: '전복 사고로 손목을 다쳤다. 겨울 훈련이 꼬였다.', effect: { stats: { wet: 1 }, pressure: 8 } },
      ] },
      { id: 'no', label: '사양한다', outcomes: [{ p: 1, text: '위험은 피했다.', effect: {} }] },
    ],
  },
  {
    id: 'mental_coach', category: 'training', title: '멘탈 코치',
    text: '멘탈 코치와 겨울 동안 상담을 해 보자는 제안이 왔다. 비용은 {amount}.',
    amountUnits: -2, when: (x) => x.age >= 15, weight: (x) => (x.temperament === 'bad' ? 2 : 1),
    options: [
      { id: 'yes', label: '받아 본다', hint: '일관성 +, 압박 −', outcomes: [
        { p: 0.75, text: '실수 뒤에 무너지지 않는 법을 배웠다.', effect: { stats: { consistency: 2 }, pressure: -10, fundsUnits: -2 }, tempMul: { bad: 0.8 } },
        { p: 0.25, text: '마음을 여는 데 시간이 걸렸다. 효과는 아직 모르겠다.', effect: { pressure: -4, fundsUnits: -2 }, tempMul: { bad: 1.6 } },
      ] },
      { id: 'no', label: '혼자 이겨 낸다', outcomes: [{ p: 1, text: '내 방식대로 버티기로 했다.', effect: {} }] },
    ],
  },
  // ── 패독 밖 7 ─────────────────────────────────────────────────────
  {
    id: 'esports', category: 'offtrack', title: '심레이싱 대회 초청',
    text: '온라인 심레이싱 대회에 초청받았다. 방송으로 생중계된다.',
    when: (x) => x.age >= 14,
    options: [
      { id: 'join', label: '참가한다', hint: '팔로워 +', outcomes: [
        { p: 0.6, text: '실제 드라이버답게 우승했다. 클립이 퍼졌다.', effect: { followersMul: 1.12, sentiment: 5 } },
        { p: 0.4, text: '게이머들에게 처참하게 졌다. 그래도 재미있었다.', effect: { followersMul: 1.05, reputation: -1 } },
      ] },
      { id: 'no', label: '훈련에 집중한다', outcomes: [{ p: 1, text: '조용한 겨울을 보냈다.', effect: {} }] },
    ],
  },
  {
    id: 'fashion_brand', category: 'offtrack', title: '패션 브랜드 협업',
    text: '패션 브랜드가 협업 컬렉션을 제안했다. 계약금이 나온다.',
    when: (x) => x.followers >= 20_000,
    options: [
      { id: 'yes', label: '한다', hint: '자금·팔로워 +, 압박 +', outcomes: [
        { p: 0.8, text: '컬렉션이 매진됐다.', effect: { fundsUnits: 6, followersMul: 1.1, pressure: 4 } },
        { p: 0.2, text: '"레이스보다 화보"라는 비아냥이 나왔다.', effect: { fundsUnits: 6, reputation: -3, pressure: 6 } },
      ] },
      { id: 'no', label: '레이스에 집중한다', outcomes: [{ p: 1, text: '본업이 먼저라고 답했다.', effect: { reputation: 1 } }] },
    ],
  },
  {
    id: 'podcast', category: 'offtrack', title: '팟캐스트 출연',
    text: '인기 모터스포츠 팟캐스트에서 출연 요청이 왔다. 녹화는 두 시간이다.',
    when: (x) => x.age >= 15,
    options: [
      { id: 'honest', label: '솔직하게 다 말한다', hint: '팔로워 +, 논란 위험', outcomes: [
        { p: 0.65, text: '진솔한 이야기에 청취자들이 반했다.', effect: { followersMul: 1.08, sentiment: 6 } },
        { p: 0.35, text: '팀 이야기를 너무 많이 했다. 팀 홍보 담당이 전화했다.', effect: { followersMul: 1.06, flags: { releaseRisk: 0.02 } } },
      ] },
      { id: 'safe', label: '무난하게 답한다', outcomes: [{ p: 1, text: '무난했다. 크게 남는 건 없었다.', effect: { reputation: 1 } }] },
    ],
  },
  {
    id: 'fan_meeting', category: 'offtrack', title: '팬 미팅',
    text: '팬 클럽이 겨울 팬 미팅을 열자고 한다.',
    when: (x) => x.followers >= 3_000,
    options: [
      { id: 'yes', label: '연다', hint: '팬 여론 +', outcomes: [
        { p: 0.9, text: '사인을 500장 했다. 손목은 아프지만 마음은 따뜻하다.', effect: { sentiment: 10, followersMul: 1.04 } },
        { p: 0.1, text: '준비가 엉망이었다. 기다리다 지친 팬들이 불만을 쏟아냈다.', effect: { sentiment: -4 } },
      ] },
      { id: 'no', label: '다음에 한다', outcomes: [{ p: 1, text: '팬들에게 사과 영상을 올렸다.', effect: { sentiment: -1 } }] },
    ],
  },
  {
    id: 'deepfake', category: 'offtrack', title: '가짜 인터뷰 영상',
    text: '{name}이 하지 않은 말을 담은 가짜 영상이 돌고 있다.',
    when: (x) => x.followers >= 50_000,
    options: [
      { id: 'legal', label: '법적 대응한다', hint: '비용, 평판 회복', outcomes: [
        { p: 0.8, text: '영상이 내려갔다. 단호한 대응이 좋은 평가를 받았다.', effect: { fundsUnits: -2, reputation: 3 } },
        { p: 0.2, text: '시간이 걸리는 사이 영상은 더 퍼졌다.', effect: { fundsUnits: -2, sentiment: -4 } },
      ] },
      { id: 'joke', label: '유머로 넘긴다', hint: '팔로워 +', outcomes: [
        { p: 0.7, text: '"제 목소리가 저렇게 좋지 않아요." 해명 영상이 더 떴다.', effect: { followersMul: 1.06, sentiment: 5 } },
        { p: 0.3, text: '가볍게 넘긴다는 비판이 나왔다.', effect: { reputation: -2 } },
      ] },
    ],
  },
  {
    id: 'national_tv', category: 'offtrack', title: '예능 프로그램 섭외',
    text: '예능 프로그램에서 출연 섭외가 왔다.',
    when: (x) => x.age >= 16 && x.followers >= 10_000,
    options: [
      { id: 'yes', label: '출연한다', hint: '팔로워 크게 +, 압박 +', outcomes: [
        { p: 0.75, text: '모터스포츠를 처음 본 시청자들이 팬이 됐다.', effect: { followersMul: 1.2, sentiment: 6, pressure: 4 } },
        { p: 0.25, text: '편집이 이상하게 됐다. 뜻하지 않은 별명이 붙었다.', effect: { followersMul: 1.1, reputation: -2, pressure: 6 } },
      ] },
      { id: 'no', label: '거절한다', outcomes: [{ p: 1, text: '아직은 레이스로만 알려지고 싶었다.', effect: {} }] },
    ],
  },
  {
    id: 'helmet_design', category: 'offtrack', title: '헬멧 디자인 공모',
    text: '팬들에게 새 시즌 헬멧 디자인을 공모해 보자는 아이디어가 나왔다.',
    when: (x) => x.age >= 14,
    options: [
      { id: 'yes', label: '공모한다', hint: '팬 여론·팔로워 +', outcomes: [
        { p: 0.85, text: '어린 팬의 디자인이 뽑혔다. 사연이 화제가 됐다.', effect: { sentiment: 8, followersMul: 1.05 } },
        { p: 0.15, text: '디자인 표절 논란이 생겼다. 급히 수습했다.', effect: { sentiment: -3 } },
      ] },
      { id: 'no', label: '전문 디자이너에게 맡긴다', outcomes: [{ p: 1, text: '깔끔한 헬멧이 나왔다.', effect: { reputation: 1 } }] },
    ],
  },
  // ── 커리어 7 ──────────────────────────────────────────────────────
  {
    id: 'contract_bonus', category: 'career', title: '성과 보너스 조항',
    text: '{team}이 기본급을 줄이는 대신 성과 보너스를 크게 거는 조항을 제안했다.',
    when: (x) => x.seat === 'race' && x.age >= 17,
    options: [
      { id: 'bonus', label: '보너스에 건다', hint: '성적이 좋으면 자금 +', outcomes: [
        { p: 0.55, text: '포인트를 쌓을 때마다 보너스가 들어왔다.', effect: { fundsUnits: 6, pressure: 4 } },
        { p: 0.45, text: '보너스 조건을 못 채웠다. 기본급만 줄었다.', effect: { fundsUnits: -3, pressure: 6 } },
      ] },
      { id: 'base', label: '기본급을 지킨다', outcomes: [{ p: 1, text: '안정이 먼저다.', effect: { pressure: -2 } }] },
    ],
  },
  {
    id: 'test_day_rival', category: 'career', title: '라이벌 팀 테스트 제안',
    text: '다른 팀이 비공식 테스트에 와 보라고 연락했다. 지금 팀이 알면 좋아하지 않을 것이다.',
    when: (x) => x.seat === 'race' && x.age >= 16, weight: (x) => (x.pct >= 0.6 ? 1.5 : 0.7),
    options: [
      { id: 'go', label: '몰래 간다', hint: '다음 오프시즌 관심 +, 들키면 입지 −', outcomes: [
        { p: 0.6, text: '테스트 기록이 좋았다. 그 팀이 이름을 기억해 뒀다.', effect: { flags: { scoutBonus: 0.15 } } },
        { p: 0.4, text: '사진이 찍혔다. 지금 팀이 불쾌해했다.', effect: { flags: { scoutBonus: 0.1, releaseRisk: 0.05 } } },
      ] },
      { id: 'no', label: '정중히 거절한다', hint: '팀 내 입지 단단', outcomes: [{ p: 1, text: '지금 팀이 그 사실을 알고 고마워했다.', effect: { flags: { releaseRisk: -0.02 } } }] },
    ],
  },
  {
    id: 'reserve_role', category: 'career', title: 'F1 팀 시뮬레이터 드라이버',
    text: 'F1 팀이 시뮬레이터 개발 드라이버 자리를 제안했다. 하부 리그 시즌과 병행해야 한다.',
    when: (x) => (x.series === 'f2' || x.series === 'f3') && x.pct >= 0.4,
    options: [
      { id: 'yes', label: '병행한다', hint: '피드백 성장·스카우트 +, 피로', outcomes: [
        { p: 0.75, text: 'F1 엔지니어들과 일하며 시야가 넓어졌다.', effect: { stats: { feedback: 2 }, flags: { scoutBonus: 0.1 }, pressure: 4 } },
        { p: 0.25, text: '이동과 일정에 지쳤다.', effect: { stats: { feedback: 1 }, pressure: 10 } },
      ] },
      { id: 'no', label: '본 시즌에 집중한다', outcomes: [{ p: 1, text: '내 레이스에 집중하기로 했다.', effect: { pressure: -2 } }] },
    ],
  },
  {
    id: 'number_change', category: 'career', title: '카 넘버 고르기',
    text: '내년부터 쓸 고유 번호를 정할 수 있다. 직접 고를지, 팬 투표에 맡길지.',
    when: (x) => x.f1,
    options: [
      { id: 'fans', label: '팬 투표에 맡긴다', hint: '팬 여론 +', outcomes: [{ p: 1, text: '팬들이 고른 번호가 차에 붙었다.', effect: { sentiment: 6, followersMul: 1.03 } }] },
      { id: 'self', label: '내가 정한다', outcomes: [{ p: 1, text: '어릴 때 카트 번호를 다시 달았다.', effect: { reputation: 1 } }] },
    ],
  },
  {
    id: 'team_principal_talk', category: 'career', title: '팀 대표와의 면담',
    text: '시즌 결산 면담에서 팀 대표가 내년 목표를 묻는다.',
    when: (x) => x.seat === 'race' && x.age >= 16,
    options: [
      { id: 'team', label: '팀 목표에 맞춘다', hint: '팀 내 입지 +', outcomes: [{ p: 1, text: '팀 대표가 고개를 끄덕였다.', effect: { flags: { releaseRisk: -0.02 }, pressure: -2 } }] },
      { id: 'demand', label: '더 좋은 대우를 요구한다', hint: '자금 +, 입지 흔들림', outcomes: [
        { p: 0.5, text: '요구가 받아들여졌다.', effect: { fundsUnits: 4 } },
        { p: 0.5, text: '"생각해 보겠다"는 답만 돌아왔다. 분위기가 냉랭해졌다.', effect: { flags: { releaseRisk: 0.04 } } },
      ] },
    ],
  },
  {
    id: 'junior_mentor', category: 'career', title: '주니어 드라이버 멘토',
    text: '팀이 아카데미 주니어 드라이버의 멘토를 맡아 달라고 한다.',
    when: (x) => x.f1 && x.age >= 24,
    options: [
      { id: 'yes', label: '맡는다', hint: '평판 +, 팀 내 입지 +', outcomes: [
        { p: 0.85, text: '주니어가 첫 우승을 하고 가장 먼저 연락했다.', effect: { reputation: 4, flags: { releaseRisk: -0.02 } } },
        { p: 0.15, text: '시간을 많이 뺏겼다.', effect: { reputation: 2, pressure: 4 } },
      ] },
      { id: 'no', label: '내 레이스에 집중한다', outcomes: [{ p: 1, text: '정중히 거절했다.', effect: {} }] },
    ],
  },
  {
    id: 'penalty_points', category: 'career', title: '벌점 누적 경고',
    text: '시즌 동안 쌓인 벌점 때문에 스튜어드에게서 경고를 받았다.',
    when: (x) => x.seat === 'race' && x.age >= 16, weight: (x) => 0.5 * bad(x),
    options: [
      { id: 'careful', label: '스타일을 다듬는다', hint: '일관성 +, 레이스크래프트 −', outcomes: [{ p: 1, text: '무리한 추월을 줄이기로 했다.', effect: { stats: { consistency: 2, racecraft: -1 } } }] },
      { id: 'same', label: '내 스타일대로 간다', hint: '압박 +', outcomes: [
        { p: 0.6, text: '조심스럽게 선을 지켰다.', effect: { pressure: 4 } },
        { p: 0.4, text: '다시 벌점을 받았다. 팀이 경고를 보냈다.', effect: { pressure: 8, flags: { releaseRisk: 0.03 } }, tempMul: { bad: 1.4 } },
      ] },
    ],
  },
  {
    id: 'endurance_race', category: 'career', title: '내구레이스 출전 제안',
    text: '팀 안에서 입지가 단단해졌다. 팀이 그랑프리 사이 빈 주말에 GT 내구레이스에 나가 보는 것을 허락했다.',
    // v0.32부터 오프시즌 이벤트로는 뜨지 않는다. 훈련 계획의 시즌 중 출전 선택(endurance.ts)이 이 결과표를 쓴다
    when: () => false,
    weight: () => 1.5,
    options: [
      { id: 'race', label: '출전한다', hint: '레이스크래프트·우천·일관성 성장, 팬 크게 +, 사고 위험', outcomes: [
        { p: 0.45, text: '새벽 빗속 스틴트에서 차이를 벌렸다. 클래스 우승. 내구레이스 팬들까지 이름을 외웠다.', effect: { stats: { racecraft: 1, wet: 1, consistency: 1 }, followersMul: 1.15, reputation: 5, sentiment: 6 } },
        { p: 0.43, text: '팀과 교대로 24시간을 버텨 완주했다. 긴 레이스에서 페이스를 지키는 법을 배웠다.', effect: { stats: { consistency: 1, tyre: 1 }, followersMul: 1.06, reputation: 2 } },
        { p: 0.12, text: '밤사이 다른 차와 얽혀 리타이어했다. F1 팀이 "다음엔 신중하자"고 했다.', effect: { followersMul: 1.03, pressure: 8, flags: { releaseRisk: 0.03 } } },
      ] },
      { id: 'no', label: 'F1 준비에 집중한다', outcomes: [{ p: 1, text: '빈 주말에 시뮬레이터와 체력 훈련에 집중했다.', effect: { pressure: -3 } }] },
    ],
  },
  // ── 생활 7 ────────────────────────────────────────────────────────
  {
    id: 'injury_scare', category: 'life', title: '훈련 중 부상',
    text: '체력 훈련 중 어깨를 다쳤다. 의사는 4주 휴식을 권한다.',
    when: (x) => x.age >= 14,
    options: [
      { id: 'rest', label: '푹 쉰다', hint: '안전', outcomes: [{ p: 1, text: '완전히 회복했다.', effect: { pressure: -2 } }] },
      { id: 'push', label: '재활하며 훈련한다', hint: '모험', outcomes: [
        { p: 0.6, text: '재활 훈련이 오히려 몸을 단단하게 만들었다.', effect: { stats: { consistency: 1 } } },
        { p: 0.4, text: '부상이 도졌다. 시즌 초반 몸이 무거웠다.', effect: { stats: { pace: -1 }, pressure: 6 } },
      ] },
    ],
  },
  {
    id: 'school_choice', category: 'life', title: '진학 고민',
    text: '대학 진학과 레이싱 사이에서 고민이 깊어진다.',
    when: (x) => x.age >= 17 && x.age <= 19 && JUNIOR(x),
    options: [
      { id: 'online', label: '온라인 강의로 병행한다', hint: '압박 −', outcomes: [{ p: 1, text: '공학 수업이 셋업 이해에 도움이 됐다.', effect: { stats: { feedback: 1 }, pressure: -3 } }] },
      { id: 'race', label: '레이싱에 올인한다', hint: '성장 +, 압박 +', outcomes: [{ p: 1, text: '돌아갈 길을 끊었다. 그만큼 절실해졌다.', effect: { stats: { pace: 1, racecraft: 1 }, pressure: 6 } }] },
    ],
  },
  {
    id: 'hometown_hero', category: 'life', title: '고향 명예 시민',
    text: '고향에서 명예 시민으로 위촉하겠다고 한다. 행사에 참석해야 한다.',
    when: (x) => x.pct >= 0.7 || x.champion,
    options: [
      { id: 'yes', label: '참석한다', hint: '팬 여론 +', outcomes: [{ p: 1, text: '어릴 때 다니던 카트장에 이름이 붙었다.', effect: { sentiment: 8, followersMul: 1.04 } }] },
      { id: 'no', label: '영상으로 인사한다', outcomes: [{ p: 1, text: '아쉬워하는 목소리도 있었다.', effect: { sentiment: 1 } }] },
    ],
  },
  {
    id: 'investment', category: 'life', title: '투자 제안',
    text: '지인이 유망한 사업이라며 투자를 권한다. 금액은 {amount}.',
    amountUnits: -5, when: (x) => x.funds > 0 && x.age >= 18,
    options: [
      { id: 'invest', label: '투자한다', hint: '모험', outcomes: [
        { p: 0.4, text: '사업이 잘됐다. 두 배로 돌아왔다.', effect: { fundsUnits: 5 } },
        { p: 0.6, text: '사업이 접혔다. 돈은 돌아오지 않았다.', effect: { fundsUnits: -5, pressure: 5 } },
      ] },
      { id: 'no', label: '거절한다', outcomes: [{ p: 1, text: '레이싱에만 돈을 쓰기로 했다.', effect: {} }] },
    ],
  },
  {
    id: 'pet', category: 'life', title: '반려견 입양',
    text: '보호소에서 만난 강아지가 눈에 밟힌다.',
    when: (x) => x.age >= 16,
    options: [
      { id: 'adopt', label: '입양한다', hint: '압박 −, 팬 여론 +', outcomes: [{ p: 1, text: '패독에 강아지가 나타나자 카메라가 몰렸다.', effect: { pressure: -8, sentiment: 5, followersMul: 1.03 } }] },
      { id: 'no', label: '지금은 어렵다', outcomes: [{ p: 1, text: '시즌 중엔 돌볼 시간이 없다.', effect: {} }] },
    ],
  },
  {
    id: 'sleep', category: 'life', title: '시차와 수면 문제',
    text: '잦은 장거리 이동으로 수면 리듬이 무너졌다.',
    when: (x) => x.f1 || x.series === 'f2',
    options: [
      { id: 'expert', label: '수면 전문가와 관리한다', hint: '비용, 일관성 +', outcomes: [{ p: 1, text: '시차 적응 루틴이 생겼다.', effect: { stats: { consistency: 1 }, fundsUnits: -1, pressure: -4 } }] },
      { id: 'ignore', label: '버틴다', outcomes: [
        { p: 0.6, text: '어떻게든 버텼다.', effect: { pressure: 3 } },
        { p: 0.4, text: '레이스 주말에 집중력이 떨어졌다.', effect: { stats: { consistency: -1 }, pressure: 5 } },
      ] },
    ],
  },
  {
    id: 'start_family', category: 'life', title: '가정을 꾸릴까',
    text: '오래 만난 사람과 미래를 이야기했다. 결혼하고 아이를 갖는 것도 생각해 볼 때다.',
    when: (x) => x.age >= 25 && !x.family, weight: (x) => (x.age >= 29 ? 2 : 1),
    options: [
      { id: 'family', label: '가정을 꾸린다', hint: '멘탈 안정(일관성 +, 압박 −), 레이스 공격성 −', outcomes: [
        { p: 1, text: '집에 돌아갈 이유가 생겼다. 마음은 편해졌지만, 예전처럼 무리하게 틈을 파고들지는 않게 됐다.', effect: { family: true, stats: { consistency: 2, racecraft: -1 }, pressure: -12, sentiment: 6 } },
      ] },
      { id: 'later', label: '지금은 레이싱이 먼저다', outcomes: [{ p: 1, text: '커리어가 자리 잡을 때까지 미루기로 했다.', effect: {} }] },
    ],
  },
  {
    id: 'family_visit', category: 'life', title: '가족 방문',
    text: '가족이 시즌 개막전에 응원 오고 싶어 한다.',
    when: (x) => x.age >= 14,
    options: [
      { id: 'invite', label: '초대한다', hint: '압박 −', outcomes: [
        { p: 0.85, text: '관중석의 가족을 보고 힘이 났다.', effect: { pressure: -6, sentiment: 3 } },
        { p: 0.15, text: '오히려 더 긴장했다.', effect: { pressure: 3 }, tempMul: { bad: 1.5 } },
      ] },
      { id: 'later', label: '시즌 중반에 오라고 한다', outcomes: [{ p: 1, text: '개막전엔 혼자 집중하기로 했다.', effect: {} }] },
    ],
  },
];
