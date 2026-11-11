// 홈 · 설정 화면 (은퇴 화면은 Retired.tsx)

import { useRef, useState } from 'react';
import { useGame } from './store';
import { Button, Card, useConfirm } from './ui';

export function Home() {
  const { career, go, reset } = useGame();
  const confirmBox = useConfirm();
  return (
    <div className="mx-auto flex min-h-[80vh] max-w-xl flex-col justify-center gap-6 px-4 py-10">
      {confirmBox.dialog}
      <div>
        <div className="text-xs font-bold tracking-[0.4em] text-racing">KART TO CHAMPION</div>
        <h1 className="mt-2 text-4xl font-black leading-tight">카트에서<br />챔피언까지</h1>
        <p className="mt-3 text-zinc-400">12세 카트 유망주에서 F1 월드 챔피언까지. 훈련, 이적, 계약 하나하나가 커리어를 만듭니다.</p>
      </div>
      <div className="flex flex-col gap-2">
        {career && !career.retired && <Button onClick={() => go('dashboard')}>이어하기 · {career.driver.name} ({career.year}, {career.age}세)</Button>}
        {career?.retired && <Button variant="ghost" onClick={() => go('retired')}>지난 커리어 보기 · {career.driver.name}</Button>}
        <Button variant={career && !career.retired ? 'ghost' : 'primary'} onClick={() => {
          const start = () => { reset(); go('create'); };
          if (career && !career.retired) confirmBox.ask('진행 중인 커리어가 사라집니다. 새로 시작할까요? (설정에서 저장 파일을 내보내 두면 나중에 다시 불러올 수 있습니다)', start, { confirmLabel: '새로 시작', danger: true });
          else start();
        }}>새 커리어</Button>
        <Button variant="ghost" onClick={() => go('guide')}>게임 방법</Button>
        <Button variant="ghost" onClick={() => go('settings')}>설정 · 저장 파일</Button>
      </div>
      <p className="text-xs leading-relaxed text-zinc-500">
        진행 상황은 이 브라우저에만 저장됩니다. 시크릿 모드를 닫거나 브라우저 데이터를 지우면 사라지니, 설정에서 저장 파일을 내보내 두세요.
      </p>
    </div>
  );
}

export function Settings() {
  const { showKrw, setShowKrw, exportSave, importSave, peekSave, go, career, interviewAuto, setInterviewAuto, seenTips, resetTips } = useGame();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const confirmBox = useConfirm();
  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
      {confirmBox.dialog}
      <Card title="표시">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showKrw} onChange={(e) => setShowKrw(e.target.checked)} /> 금액 옆에 원화 환산 보기
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <Button variant="ghost" className="!px-3 !py-1.5 text-xs" disabled={seenTips.length === 0} onClick={resetTips}>처음 안내 다시 보기</Button>
          <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => go('guide')}>게임 방법</Button>
        </div>
      </Card>
      <Card title="기자회견 자동 응답">
        <p className="mb-2 text-xs text-zinc-400">켜 두면 시즌 결산 기자회견을 고른 톤으로 바로 처리하고 결과만 보여 줍니다. 다른 전환점 이벤트는 그대로 직접 고릅니다.</p>
        <div className="flex flex-wrap gap-2">
          {([[null, '직접 고르기'], ['humble', '항상 겸손'], ['confident', '항상 자신감'], ['bold', '항상 도발']] as const).map(([v, label]) => (
            <button key={label} onClick={() => setInterviewAuto(v)} className={`rounded-full px-3 py-1.5 text-sm font-bold ${interviewAuto === v ? 'bg-racing text-white' : 'bg-white/5 text-zinc-300 hover:bg-white/10'}`}>{label}</button>
          ))}
        </div>
      </Card>
      <Card title="저장 파일">
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" disabled={!career} onClick={() => {
            const blob = new Blob([exportSave()], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `kart-to-champion-${career?.driver.name ?? 'save'}-${career?.year ?? ''}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
          }}>내보내기</Button>
          <Button variant="ghost" onClick={() => file.current?.click()}>가져오기</Button>
          <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = ''; // 같은 파일을 다시 고를 수 있게
            if (!f) return;
            const text = await f.text();
            const p = peekSave(text);
            if (!p.ok) { setMsg(p.reason); return; }
            const what = `${p.name} · ${p.year}${p.retired ? ' (은퇴)' : ''}`;
            const load = () => setMsg(importSave(text) ? `불러왔습니다: ${what}` : '불러오지 못했습니다.');
            if (career) confirmBox.ask(`지금 커리어(${career.driver.name} · ${career.year})를 ${what} 저장 파일로 바꿀까요? 지금 커리어는 내보내 두지 않으면 사라집니다.`, load, { confirmLabel: '불러오기', danger: true });
            else load();
          }} />
        </div>
        <p className="mt-2 text-xs text-zinc-500">진행 상황은 이 브라우저에만 저장됩니다. 다른 기기로 옮기거나 브라우저 데이터를 지우기 전에 내보내 두세요. 진행 중인 라이브 시즌, 서명, 계약서 보관함까지 함께 저장됩니다.</p>
        {msg && <p className="mt-2 text-sm text-zinc-300">{msg}</p>}
      </Card>
      <Card title="크레딧">
        <ul className="space-y-1 text-xs leading-relaxed text-zinc-400">
          <li>서킷 레이아웃: <a className="underline" href="https://github.com/bacinger/f1-circuits" target="_blank" rel="noreferrer">bacinger/f1-circuits</a> · Copyright (c) 2019-2025 Tomislav Bacinger · MIT License</li>
          <li>실제 드라이버 능력치 산정에 쓴 경기 기록: <a className="underline" href="https://github.com/jolpica/jolpica-f1" target="_blank" rel="noreferrer">Jolpica F1 API</a>(Ergast 호환)</li>
          <li>글꼴: Noto Sans KR, Nanum Pen Script(Google Fonts, SIL Open Font License)</li>
          <li>팀 엠블럼은 팀 색과 약자로 만든 자체 디자인이며 실제 로고가 아닙니다. 언론·팬 반응의 매체, 작성자, 내용은 모두 가상입니다.</li>
        </ul>
      </Card>
      <Button variant="ghost" onClick={() => go(career ? (career.retired ? 'retired' : 'dashboard') : 'home')}>돌아가기</Button>
    </div>
  );
}
