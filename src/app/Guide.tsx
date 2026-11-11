// 처음 하는 사람을 위한 안내(SPEC §10 v0.26): 화면별 첫 안내 카드(Tip)와 "게임 방법" 페이지(Guide).

import type { ReactNode } from 'react';
import { SUPER_LICENCE_MIN_AGE, SUPER_LICENCE_REQUIRED, TRAINING_SLOTS } from '../engine';
import { useGame } from './store';
import { Button, Card } from './ui';

/** 한 번 닫으면 다시 뜨지 않는 안내 카드. 설정의 "안내 다시 보기"로 되살린다 */
export function Tip({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const { seenTips, dismissTip, go } = useGame();
  if (seenTips.includes(id)) return null;
  return (
    <div role="note" className="rounded-2xl border border-sky-400/40 bg-sky-400/5 p-4 text-sm">
      <div className="font-black text-sky-200">💡 {title}</div>
      <div className="mt-1 space-y-1 leading-relaxed text-zinc-200">{children}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button className="!px-3 !py-1.5 text-xs" onClick={() => dismissTip(id)}>알겠어요</Button>
        <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => go('guide')}>게임 방법 전체 보기</Button>
      </div>
    </div>
  );
}

const SECTIONS: Array<{ title: string; body: ReactNode }> = [
  {
    title: '목표',
    body: <p>12세 카트 선수로 시작해 F1 월드 챔피언까지 가는 것이 목표입니다. 한 시즌은 훈련 계획 → 시즌 진행 → 오프시즌(사건·기자회견·이적) 순서로 돌아갑니다. 언제든 은퇴를 선언할 수 있고, 은퇴하면 커리어 전체가 기록으로 남습니다.</p>,
  },
  {
    title: '커리어 사다리',
    body: (
      <>
        <p>카트 → F4 → FRECA(포뮬러 리저널) → FIA F3 → FIA F2 → F1 순서로 올라갑니다. 좋은 성적을 내면 오프시즌에 윗단계 팀의 제안이 옵니다.</p>
        <p>F1 레이스 시트에는 <b>슈퍼 라이선스 {SUPER_LICENCE_REQUIRED}점</b>(최근 3시즌 합계)과 <b>만 {SUPER_LICENCE_MIN_AGE}세</b>가 필요합니다. 점수는 하부 리그 순위로 쌓입니다. F2 상위권이면 하위 팀이 자리를 내주는 신인 보장도 있습니다.</p>
      </>
    ),
  },
  {
    title: '훈련',
    body: <p>시즌마다 훈련 {TRAINING_SLOTS}칸(리저브는 더 많음)을 채웁니다. 프로그램마다 오르는 능력치와 비용이 다릅니다. 휴식이 없으면 컨디션이 떨어지고 부상 위험이 커집니다. "약점 보완 / 강점 극대화 / 균형" 버튼으로 추천 계획을 바로 채울 수 있습니다. 능력치는 잠재력(숨은 값) 근처에서 잘 오르지 않고, 38세부터 떨어지기 시작합니다.</p>,
  },
  {
    title: '시즌과 라이브 레이스',
    body: (
      <>
        <p>하부 리그는 시즌을 한 번에 진행합니다. F1 레이스 시트에 오르면 <b>시즌 라이브로 시작</b>을 눌러 그랑프리마다 프랙티스 → 퀄리파잉 → (스프린트) → 레이스를 직접 볼 수 있습니다.</p>
        <p>레이스 중 세이프티카·비 같은 상황이 오면 <b>엔지니어 무전</b>이 뜹니다. 선택지마다 예상 순위가 함께 나오고 ★가 엔지니어 추천입니다. 사고·추월 같은 순간에는 실제 서킷 모양 위에 차가 동그라미로 보입니다.</p>
        <p>바쁘면 <b>레이스 결과로 바로 가기</b>나 <b>남은 시즌 자동 진행</b>으로 넘어갈 수 있습니다. 이미 고른 무전은 그대로 반영됩니다.</p>
      </>
    ),
  },
  {
    title: '오프시즌',
    body: (
      <>
        <p>시즌이 끝나면 <b>전환점</b>(훈련 제안, 스폰서, 논란, 가족 등)과 <b>기자회견</b>이 먼저 뜹니다. 기자회견은 겸손·자신감·도발 중 하나로 답하고, 성격에 따라 결과가 달라집니다. 설정에서 자동 응답을 켤 수 있습니다.</p>
        <p>그다음 팀들의 <b>제안</b>이 열립니다. 매니저가 제안마다 추천·괜찮음·비추천을 달아 줍니다. 계약서에 서명하면 다음 시즌 팀이 정해집니다. 시트 없이 1년을 보내거나 은퇴할 수도 있습니다.</p>
      </>
    ),
  },
  {
    title: '성격과 기질',
    body: <p>성격은 처음 능력치와 레이스 스타일을 정합니다. 기질이 좋으면 꾸준하지만 월드 챔피언은 어렵고, 기질이 나쁘면 들쑥날쑥하지만 한 방이 있는 대신 팀에서 방출될 위험이 큽니다.</p>,
  },
  {
    title: '돈, 언론, 팬',
    body: <p>하부 리그는 시트를 사야 할 때가 많아 가정 자산과 스폰서가 중요합니다. 언론 평판이 높으면 F1 팀의 평가가 오르고, 압박이 높으면 실수가 늘어납니다. 시즌마다 기사, 해설, 팀 공식 계정, 레딧·F1 갤러리·X 반응이 나옵니다(모두 가상).</p>,
  },
  {
    title: '홈 그랑프리와 캘린더',
    body: <p>그 시즌 캘린더에 자기 나라 그랑프리가 있으면 F1 데뷔 전에 팀들이 더 쳐주고, 홈 그랑프리 주말에는 능력치가 조금 오릅니다(멘탈은 성격에 따라 오르거나 내림). 캘린더는 2027년 공식안 이후 가끔 바뀌고, 21세기에 F1을 치렀던 서킷이 돌아오기도 합니다.</p>,
  },
  {
    title: '기록과 저장',
    body: <p>상단 메뉴의 <b>업적·기록</b>에서 통산 기록, 리그별 최고 성적, 업적을 볼 수 있습니다. 진행 상황은 이 브라우저에만 저장되니, 설정에서 저장 파일을 내보내 두세요.</p>,
  },
];

export function Guide() {
  const { go, career } = useGame();
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-black">게임 방법</h1>
        <Button variant="ghost" onClick={() => go(career ? (career.retired ? 'retired' : 'dashboard') : 'home')}>돌아가기</Button>
      </header>
      {SECTIONS.map((s) => (
        <Card key={s.title} title={s.title}>
          <div className="space-y-2 text-sm leading-relaxed text-zinc-200">{s.body}</div>
        </Card>
      ))}
    </div>
  );
}
