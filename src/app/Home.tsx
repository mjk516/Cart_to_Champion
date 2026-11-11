// 첫 화면(SPEC §10 v0.27): 소개 카드 → 커리어 여정(서킷 위 동그라미 차가 단계를 따라 달린다) → 이어하기·특징 → 하단 고정 시작 버튼.
// 레이아웃 흐름만 장르 관례를 따르고, 그림·문구·색은 이 게임의 것이다(SPEC §11: 참고작 디자인은 복제하지 않는다).

import { useEffect, useState } from 'react';
import { seriesLabel } from '../engine';
import { HelmetView } from './Helmet';
import { useGame } from './store';
import { Button, Card, useConfirm } from './ui';

const JOURNEY = [
  { label: '카트', caption: '열두 살, 동네 카트장의 첫 랩' },
  { label: 'F4', caption: '첫 싱글시터, F4 데뷔' },
  { label: 'F3·F2', caption: '슈퍼 라이선스를 모으는 시간' },
  { label: 'F1 데뷔', caption: '꿈에 그리던 그리드 위에' },
  { label: '챔피언', caption: '월드 챔피언 트로피를 들어 올려' },
];

/** 여정 그림의 트랙과 단계별 차 위치(트랙 위 점) */
const TRACK = 'M30 150 C 70 150 80 96 128 96 S 186 150 232 128 S 280 52 330 52';
const SPOTS: Array<[number, number]> = [[30, 150], [112, 99], [188, 140], [262, 92], [330, 52]];

function Journey() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    // 움직임 줄이기 설정이면 자동으로 넘기지 않고 마지막 장면만 보여 준다
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setStep(JOURNEY.length - 1); return; }
    const id = setInterval(() => setStep((s) => (s + 1) % JOURNEY.length), 1900);
    return () => clearInterval(id);
  }, []);
  const [x, y] = SPOTS[step]!;
  const last = step === JOURNEY.length - 1;
  return (
    <Card>
      <svg viewBox="0 0 360 190" className="w-full" role="img" aria-label={`커리어 여정: ${JOURNEY[step]!.label}`}>
        <defs>
          <linearGradient id="trk" x1="0" x2="1"><stop offset="0" stopColor="#3f3f46" /><stop offset="1" stopColor="#52525b" /></linearGradient>
        </defs>
        <path d={TRACK} fill="none" stroke="url(#trk)" strokeWidth={16} strokeLinecap="round" />
        <path d={TRACK} fill="none" stroke="#a1a1aa" strokeWidth={1.5} strokeDasharray="5 7" strokeLinecap="round" />
        {/* 체커기 결승선 */}
        {[0, 1, 2, 3].map((i) => <rect key={i} x={340 + (i % 2) * 6} y={40 + Math.floor(i / 2) * 6} width={6} height={6} fill={(i + Math.floor(i / 2)) % 2 ? '#fafafa' : '#18181b'} />)}
        {SPOTS.map(([sx, sy], i) => (
          <circle key={i} cx={sx} cy={sy} r={i <= step ? 5 : 4} fill={i <= step ? '#e10600' : '#27272a'} stroke="#09090b" strokeWidth={2} />
        ))}
        <g style={{ transform: `translate(${x}px, ${y}px)`, transition: 'transform 900ms cubic-bezier(.4,0,.2,1)' }}>
          <circle r={11} fill="#e10600" stroke="#fafafa" strokeWidth={3} />
          {last && <text y={-20} textAnchor="middle" fontSize={22}>🏆</text>}
        </g>
      </svg>
      <p className="mt-1 text-center text-base font-black" aria-live="polite">{JOURNEY[step]!.caption}</p>
      <ol className="mt-4 grid grid-cols-5 gap-1 text-center text-[11px]">
        {JOURNEY.map((j, i) => (
          <li key={j.label} className="flex flex-col items-center gap-1">
            <button aria-label={`${j.label} 단계 보기`} onClick={() => setStep(i)} className={`h-2 w-full rounded-full transition-colors ${i <= step ? 'bg-racing' : 'bg-white/10'}`} />
            <span className={i === step ? 'font-bold text-zinc-100' : 'text-zinc-500'}>{j.label}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

const FEATURES = [
  { icon: '🏁', title: '라이브 그랑프리', text: '퀄리파잉부터 결승까지. 세이프티카가 나오면 엔지니어 무전으로 피트 타이밍을 직접 정한다.' },
  { icon: '🗺️', title: '실제 서킷과 2026 그리드', text: '실제 서킷 모양 위를 달리고, 실제 그리드에서 출발한 세계가 내 선택에 따라 갈라진다.' },
  { icon: '✍️', title: '계약서에 직접 서명', text: '매니저 조언을 듣고 팀을 고르고, 기자회견에서 한마디로 여론을 바꾼다.' },
];

export function Home() {
  const { career, go, reset } = useGame();
  const confirmBox = useConfirm();
  const active = career && !career.retired ? career : null;
  const startNew = () => {
    const start = () => { reset(); go('create'); };
    if (active) confirmBox.ask('진행 중인 커리어가 사라집니다. 새로 시작할까요? (설정에서 저장 파일을 내보내 두면 나중에 다시 불러올 수 있습니다)', start, { confirmLabel: '새로 시작', danger: true });
    else start();
  };
  const last = career?.history[career.history.length - 1];

  return (
    <div className="mx-auto max-w-md space-y-3 px-4 pb-36 pt-5">
      {confirmBox.dialog}
      <Card>
        <p className="text-xs font-bold text-racing">열두 살, 동네 카트장에서 시작해요</p>
        <h1 className="mt-2 text-[2.1rem] font-black leading-[1.15] tracking-tight">카트에서<br />챔피언까지</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400 [word-break:keep-all]">
          훈련과 레이스, 계약 하나하나가 쌓여 커리어가 됩니다. F4, F3, F2를 거쳐 F1 월드 챔피언에 도전해 보세요.
        </p>
      </Card>

      <Journey />

      {career && (
        <Card title={active ? '진행 중인 커리어' : '지난 커리어'}>
          <button onClick={() => go(active ? 'dashboard' : 'retired')} className="flex w-full items-center gap-3 rounded-xl bg-white/5 p-3 text-left hover:bg-white/10">
            {career.driver.helmet && <HelmetView helmet={career.driver.helmet} size={48} />}
            <div className="min-w-0 flex-1">
              <div className="truncate font-black">{career.driver.name}{career.driver.number ? <span className="ml-1 text-zinc-400">#{career.driver.number}</span> : null}</div>
              <div className="text-xs text-zinc-400">
                {career.year}년 · {career.age}세{last ? ` · ${seriesLabel(last.series)} ${last.position ? `P${last.position}` : ''}` : ''}{career.totals.f1Titles ? ` · 🏆 ${career.totals.f1Titles}` : ''}
              </div>
            </div>
            <span className="text-sm font-bold text-racing">{active ? '이어하기 ›' : '기록 보기 ›'}</span>
          </button>
        </Card>
      )}

      <div className="grid gap-2">
        {FEATURES.map((f) => (
          <div key={f.title} className="flex gap-3 rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
            <div className="text-2xl" aria-hidden>{f.icon}</div>
            <div>
              <div className="text-sm font-black">{f.title}</div>
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{f.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-center gap-4 pt-1 text-xs text-zinc-400">
        <button onClick={() => go('guide')} className="hover:text-zinc-200">게임 방법</button>
        <button onClick={() => go('settings')} className="hover:text-zinc-200">설정 · 저장 파일</button>
      </div>
      <p className="text-center text-[11px] leading-relaxed text-zinc-500">진행 상황은 이 브라우저에만 저장됩니다. 설정에서 저장 파일을 내보내 두세요.</p>

      {/* 하단 고정 시작 버튼 */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent px-4 pb-5 pt-8">
        <div className="mx-auto flex max-w-md flex-col gap-2">
          {active && <Button className="w-full !py-3.5 text-base" onClick={() => go('dashboard')}>이어하기 · {active.driver.name}</Button>}
          <Button variant={active ? 'ghost' : 'primary'} className="w-full !py-3.5 text-base" onClick={startNew}>새 커리어 시작하기</Button>
        </div>
      </div>
    </div>
  );
}
