// 홈 · 은퇴 · 설정 화면

import { useRef, useState } from 'react';
import { PERSONALITIES, seriesLabel } from '../engine';
import { formatMoney } from './format';
import { SignatureView } from './SignatureView';
import { useGame } from './store';
import { Button, Card, Pill, SEAT_LABELS } from './ui';

export function Home() {
  const { career, go, reset } = useGame();
  return (
    <div className="mx-auto flex min-h-[80vh] max-w-xl flex-col justify-center gap-6 px-4 py-10">
      <div>
        <div className="text-xs font-bold tracking-[0.4em] text-racing">KART TO CHAMPION</div>
        <h1 className="mt-2 text-4xl font-black leading-tight">카트에서<br />챔피언까지</h1>
        <p className="mt-3 text-zinc-400">12세 카트 유망주에서 F1 월드 챔피언까지. 훈련, 이적, 계약 하나하나가 커리어를 만듭니다.</p>
      </div>
      <div className="flex flex-col gap-2">
        {career && !career.retired && <Button onClick={() => go('dashboard')}>이어하기 · {career.driver.name} ({career.year}, {career.age}세)</Button>}
        {career?.retired && <Button variant="ghost" onClick={() => go('retired')}>지난 커리어 보기 · {career.driver.name}</Button>}
        <Button variant={career && !career.retired ? 'ghost' : 'primary'} onClick={() => {
          if (career && !career.retired && !confirm('진행 중인 커리어가 사라집니다. 새로 시작할까요?')) return;
          reset();
          go('create');
        }}>새 커리어</Button>
        <Button variant="ghost" onClick={() => go('settings')}>설정 · 저장 파일</Button>
      </div>
      <p className="text-xs leading-relaxed text-zinc-500">
        진행 상황은 이 브라우저에만 저장됩니다. 시크릿 모드를 닫거나 브라우저 데이터를 지우면 사라지니, 설정에서 저장 파일을 내보내 두세요.
      </p>
    </div>
  );
}

export function Retired() {
  const { career: c, firstF1Signature, signature, contracts, showKrw, go, reset } = useGame();
  if (!c) return null;
  const t = c.totals;
  const sig = firstF1Signature ?? signature;
  const best = c.history.reduce((a, h) => (h.position && (!a || h.position < (a.position ?? 99)) && h.series === 'f1' ? h : a), null as (typeof c.history)[number] | null);
  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <Card className="bg-gradient-to-br from-zinc-900 to-racing/30">
        <div className="text-xs tracking-[0.3em] text-zinc-400">CAREER CARD</div>
        <h1 className="mt-1 text-3xl font-black">{c.driver.name}</h1>
        <div className="mt-1 flex flex-wrap gap-2">
          <Pill>{PERSONALITIES[c.driver.personality].label}</Pill>
          <Pill>{c.age}세 은퇴</Pill>
          {c.f1Debut && <Pill tone="red">F1 데뷔 {c.f1Debut}</Pill>}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
          {[
            ['월드 챔피언', t.f1Titles], ['F1 출전', t.f1Starts], ['F1 우승', t.f1Wins],
            ['포디움', t.f1Podiums], ['폴', t.f1Poles], ['최고 OVR', t.bestOvr],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-xl bg-black/30 p-2"><div className="text-[11px] text-zinc-400">{k}</div><div className="text-2xl font-black">{v}</div></div>
          ))}
        </div>
        <div className="mt-3 text-sm text-zinc-300">
          주니어 타이틀: {t.juniorTitles.length ? t.juniorTitles.join(', ') : '없음'} · 통산 수입 {formatMoney(t.earnings, showKrw)} · 방출 {t.releases}회
          {best && ` · F1 최고 시즌 ${best.year} P${best.position}`}
        </div>
        {sig && (
          <div className="mt-4 max-w-xs rounded-xl bg-[#f6f1e7] p-2 text-zinc-900">
            <SignatureView sig={sig} className="h-16 w-full" />
            <div className="text-center text-[10px] text-zinc-500">{firstF1Signature ? '첫 F1 계약 서명' : '서명'}</div>
          </div>
        )}
      </Card>

      <Card title="커리어 히스토리">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <tbody>
              {c.history.map((h) => (
                <tr key={h.year} className="border-t border-white/5">
                  <td className="py-1.5">{h.year}</td><td>{h.age}세</td><td>{seriesLabel(h.series)}</td><td>{h.team ?? '—'}</td>
                  <td>{h.position ? `${h.champion ? '🏆 ' : ''}P${h.position}` : SEAT_LABELS[h.seat]}</td><td className="text-zinc-400">{h.headline.split(': ')[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`계약서 보관함 (${contracts.length})`}>
        <div className="grid gap-2 sm:grid-cols-2">
          {contracts.map((k, i) => (
            <div key={i} className="rounded-xl bg-[#f6f1e7] p-3 text-zinc-900">
              <div className="text-xs text-zinc-500">{k.year} · {seriesLabel(k.series as never)} · {SEAT_LABELS[k.seat]}</div>
              <div className="font-black">{k.team}</div>
              <SignatureView sig={k.signature} className="h-10 w-40" />
            </div>
          ))}
        </div>
      </Card>

      <div className="flex justify-center"><Button onClick={() => { reset(); go('create'); }}>새 커리어 시작</Button></div>
    </div>
  );
}

export function Settings() {
  const { showKrw, setShowKrw, exportSave, importSave, go, career } = useGame();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <Card title="표시">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showKrw} onChange={(e) => setShowKrw(e.target.checked)} /> 금액 옆에 원화 환산 보기
        </label>
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
          <input ref={file} type="file" accept="application/json" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setMsg(importSave(await f.text()) ? '불러왔습니다.' : '이 게임의 저장 파일이 아닙니다.');
          }} />
        </div>
        {msg && <p className="mt-2 text-sm text-zinc-300">{msg}</p>}
      </Card>
      <Card title="정보">
        <p className="text-xs leading-relaxed text-zinc-400">
          비공식 팬 게임입니다. Formula 1, FIA 및 각 팀·드라이버와 아무 관계가 없으며 승인받지 않았습니다. F1, FORMULA 1 및 관련 표장은 Formula One Licensing B.V.의 상표입니다. 경기 결과와 계약은 모두 가상의 시뮬레이션입니다.
        </p>
      </Card>
      <Button variant="ghost" onClick={() => go(career ? (career.retired ? 'retired' : 'dashboard') : 'home')}>돌아가기</Button>
    </div>
  );
}
