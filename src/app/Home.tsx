// 첫 화면(SPEC §10 v0.27): 소개 카드 → 커리어 여정(서킷 위 동그라미 차가 단계를 따라 달린다) → 이어하기·특징 → 하단 고정 시작 버튼.
// 레이아웃 흐름만 장르 관례를 따르고, 그림·문구·색은 이 게임의 것이다(SPEC §11: 참고작 디자인은 복제하지 않는다).

import { useEffect, useState } from 'react';
import { f1Calendar, seriesLabel, type Career } from '../engine';
import { HelmetView } from './Helmet';
import { deleteBackup, listBackups, resumeScreen, useGame, type BackupEntry, type LiveSeason } from './store';
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

/** 이어하기 버튼 아래에 보여 줄 "멈춘 곳" */
function stoppedAt(career: Career, live: LiveSeason | null, hasPlanDraft: boolean): string {
  const where = resumeScreen(career, live);
  if (where === 'weekend' && live) {
    const circuit = f1Calendar(career)[live.round];
    const lap = live.raceLap && live.raceLap.key === `${live.round}:${live.step}` && live.raceLap.lap > 0 ? ` · 레이스 ${live.raceLap.lap}랩째` : '';
    return `${career.year} 시즌 ${live.round + 1}라운드${circuit ? ` ${circuit.name}` : ''} · ${live.step === 0 ? '주말 시작' : `세션 ${live.step}`}${lap}`;
  }
  if (where === 'offseason') return `${career.year} 시즌을 마치고 오프시즌`;
  return `${career.year} 시즌 시작 전 · 훈련 계획${hasPlanDraft ? '(짜던 계획 저장됨)' : ''}`;
}

function ago(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min}분 전`;
  if (min < 60 * 24) return `${Math.round(min / 60)}시간 전`;
  return `${Math.round(min / 60 / 24)}일 전`;
}

export function Home() {
  const { career, go, reset, live, planDraft, createDraft, resume, importSave } = useGame();
  const confirmBox = useConfirm();
  const active = career && !career.retired ? career : null;
  const startNew = () => {
    const start = () => { reset(); go('create'); };
    if (active) confirmBox.ask('진행 중인 커리어가 사라집니다. 새로 시작할까요? (지금 커리어는 자동 백업에 남아 이 화면에서 다시 불러올 수 있습니다)', start, { confirmLabel: '새로 시작', danger: true });
    else if (createDraft) confirmBox.ask('만들던 드라이버를 버리고 처음부터 만들까요?', start, { confirmLabel: '처음부터', danger: true });
    else start();
  };
  const last = career?.history[career.history.length - 1];
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  useEffect(() => setBackups(listBackups()), [career?.seed]);
  const others = backups.filter((b) => b.seed !== career?.seed);
  const restore = (b: BackupEntry) => {
    const run = () => { if (!importSave(b.data)) confirmBox.ask('백업을 읽을 수 없습니다.', () => {}, { confirmLabel: '확인' }); };
    if (active) confirmBox.ask(<>지금 커리어({active.driver.name})를 두고 <b>{b.name}</b>의 커리어를 불러올까요? 지금 커리어도 자동 백업에 남습니다.</>, run, { confirmLabel: '불러오기' });
    else run();
  };
  const remove = (b: BackupEntry) => confirmBox.ask(
    <><b>{b.name}</b>({b.year}년{b.retired ? ' · 은퇴' : ''})의 자동 백업을 지울까요? 지우면 되돌릴 수 없습니다. 필요하면 먼저 불러와서 설정 → 내보내기로 파일을 받아 두세요.</>,
    () => setBackups(deleteBackup(b.seed)), { confirmLabel: '삭제', danger: true });

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
          <button onClick={() => (active ? resume() : go('retired'))} className="flex w-full items-center gap-3 rounded-xl bg-white/5 p-3 text-left hover:bg-white/10">
            {career.driver.helmet && <HelmetView helmet={career.driver.helmet} size={48} />}
            <div className="min-w-0 flex-1">
              <div className="truncate font-black">{career.driver.name}{career.driver.number ? <span className="ml-1 text-zinc-400">#{career.driver.number}</span> : null}</div>
              <div className="text-xs text-zinc-400">
                {career.year}년 · {career.age}세{last ? ` · ${seriesLabel(last.series)} ${last.position ? `P${last.position}` : ''}` : ''}{career.totals.f1Titles ? ` · 🏆 ${career.totals.f1Titles}` : ''}
              </div>
            </div>
            <span className="text-sm font-bold text-racing">{active ? '이어하기 ›' : '기록 보기 ›'}</span>
          </button>
          {active && <p className="mt-2 text-xs text-zinc-400" aria-label="멈춘 곳">⏸ 멈춘 곳: {stoppedAt(active, live, !!planDraft && planDraft.year === active.year)}</p>}
        </Card>
      )}

      {!career && createDraft && (
        <Card title="만들던 드라이버">
          <button onClick={resume} className="flex w-full items-center gap-3 rounded-xl bg-white/5 p-3 text-left hover:bg-white/10">
            <div className="min-w-0 flex-1">
              <div className="truncate font-black">{createDraft.name || '이름 없음'}</div>
              <div className="text-xs text-zinc-400">커리어 만들기 {createDraft.step + 1}단계에서 멈춤</div>
            </div>
            <span className="text-sm font-bold text-racing">이어 만들기 ›</span>
          </button>
        </Card>
      )}

      {others.length > 0 && (
        <Card title="자동 백업">
          <p className="mb-2 text-xs text-zinc-400">커리어마다 마지막 상태가 이 기기에 자동으로 남습니다(최근 3개). 새 커리어를 시작했어도 지난 커리어를 다시 불러올 수 있습니다.</p>
          <div className="space-y-2">
            {others.map((b) => (
              <div key={b.seed} className="flex items-stretch gap-1.5">
                <button onClick={() => restore(b)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-white/5 p-3 text-left hover:bg-white/10">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{b.name}</div>
                    <div className="text-xs text-zinc-400">{b.year}년{b.retired ? ' · 은퇴' : ''} · {ago(b.savedAt)} 저장</div>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-racing">불러오기 ›</span>
                </button>
                <button onClick={() => remove(b)} aria-label={`백업 삭제: ${b.name}`} title="백업 삭제"
                  className="flex w-11 shrink-0 items-center justify-center rounded-xl bg-white/5 text-zinc-400 hover:bg-red-500/15 hover:text-red-300">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
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
      <p className="text-center text-[11px] leading-relaxed text-zinc-500">진행 상황은 이 기기 브라우저에 자동 저장되어, 중간에 닫아도 멈춘 곳부터 이어집니다(레이스는 보던 랩부터). 다른 기기로 옮기려면 설정에서 저장 파일을 내보내 그 기기에서 가져오세요.</p>

      {/* 하단 고정 시작 버튼 */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent px-4 pb-5 pt-8">
        <div className="mx-auto flex max-w-md flex-col gap-2">
          {active && <Button className="w-full !py-3.5 text-base" onClick={resume}>이어하기 · {active.driver.name}</Button>}
          {!career && createDraft && <Button className="w-full !py-3.5 text-base" onClick={resume}>만들던 드라이버 이어 만들기</Button>}
          <Button variant={active ? 'ghost' : 'primary'} className="w-full !py-3.5 text-base" onClick={startNew}>새 커리어 시작하기</Button>
        </div>
      </div>
    </div>
  );
}
