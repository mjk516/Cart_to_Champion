import { lazy, Suspense, useEffect, useState } from 'react';
import { Home } from './Home';

// 첫 화면(홈) 밖의 화면은 필요할 때 불러온다(첫 로딩을 가볍게)
const Create = lazy(() => import('./Create').then((m) => ({ default: m.Create })));
const Dashboard = lazy(() => import('./Dashboard').then((m) => ({ default: m.Dashboard })));
const Offseason = lazy(() => import('./Offseason').then((m) => ({ default: m.Offseason })));
const Records = lazy(() => import('./Records').then((m) => ({ default: m.Records })));
const Guide = lazy(() => import('./Guide').then((m) => ({ default: m.Guide })));
const PatchNotes = lazy(() => import('./PatchNotes').then((m) => ({ default: m.PatchNotes })));
const Retired = lazy(() => import('./Retired').then((m) => ({ default: m.Retired })));
const Weekend = lazy(() => import('./Weekend').then((m) => ({ default: m.Weekend })));
const Settings = lazy(() => import('./Screens').then((m) => ({ default: m.Settings })));
import { moveUrl, takeIncomingSave } from './move';
import { onOldSite, SITE_URL } from './site';
import { useConfirm } from './ui';
import { requestPersistentStorage, useGame, type Screen } from './store';

const NAV: Array<{ id: Screen; label: string; always: boolean }> = [
  { id: 'patch', label: '패치노트', always: true },
  { id: 'guide', label: '게임 방법', always: true },
  { id: 'records', label: '업적·기록', always: false },
  { id: 'settings', label: '설정', always: true },
];

// 화면 코드를 미리 받아 둔다(처음 그린 뒤 한가할 때). 화면을 열 때 "불러오는 중"이 거의 안 보인다
const SCREEN_CHUNKS = [() => import('./Dashboard'), () => import('./Weekend'), () => import('./Offseason'), () => import('./Create'),
  () => import('./Records'), () => import('./Retired'), () => import('./Guide'), () => import('./PatchNotes'), () => import('./Screens')];
function prefetchScreens() {
  const run = () => { for (const f of SCREEN_CHUNKS) void f().catch(() => { /* 오프라인 등: 열 때 다시 받는다 */ }); };
  const w = window as Window & { requestIdleCallback?: (cb: () => void) => void };
  if (w.requestIdleCallback) w.requestIdleCallback(run); else setTimeout(run, 1200);
}

function ScreenSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6" role="status" aria-label="불러오는 중">
      <div className="skel h-7 w-40 rounded-lg bg-white/10" />
      <div className="skel h-36 rounded-2xl bg-white/5" />
      <div className="skel h-56 rounded-2xl bg-white/5" />
    </div>
  );
}

export function App() {
  const { screen, career, go, exportSave, importSave, peekSave } = useGame();
  const confirmBox = useConfirm();
  const [moveMsg, setMoveMsg] = useState<string | null>(null);
  // 은퇴한 커리어는 항상 은퇴 화면으로
  const effective = career?.retired && (screen === 'dashboard' || screen === 'offseason') ? 'retired' : screen;
  // 휴대폰 브라우저가 저장 데이터를 지우지 않게 요청(한 번)
  useEffect(() => { requestPersistentStorage(); prefetchScreens(); }, []);
  // 예전 주소에서 넘어온 커리어 받기
  useEffect(() => {
    void takeIncomingSave().then((text) => {
      if (!text) return;
      const p = peekSave(text);
      if (!p.ok) { setMoveMsg(`옮겨 온 커리어를 읽지 못했습니다: ${p.reason}`); return; }
      const what = `${p.name} · ${p.year}${p.retired ? ' (은퇴)' : ''}`;
      const load = () => setMoveMsg(importSave(text) ? `커리어를 옮겨 왔어요: ${what}` : '커리어를 옮기지 못했습니다.');
      const cur = useGame.getState().career;
      if (cur) confirmBox.ask(`예전 주소의 커리어(${what})를 가져올까요? 이 주소의 지금 커리어(${cur.driver.name} · ${cur.year})는 내보내 두지 않으면 사라집니다.`, load, { confirmLabel: '가져오기', danger: true });
      else load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const goWithCareer = async () => { window.location.href = await moveUrl(exportSave()); };
  // 화면이나 시즌이 바뀌면 맨 위부터 보여 준다
  useEffect(() => { window.scrollTo(0, 0); }, [effective, career?.year]);
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-white/10 bg-zinc-950/90 px-4 py-3 backdrop-blur">
        <button onClick={() => go('home')} className="min-w-0 truncate text-sm font-black tracking-tight">
          <span className="text-racing">▍</span>카트에서 챔피언까지
        </button>
        <div className="flex shrink-0 gap-2.5 whitespace-nowrap sm:gap-4">
          {NAV.filter((n) => n.always || career).map((n) => (
            <button key={n.id} onClick={() => go(n.id)} aria-current={effective === n.id ? 'page' : undefined}
              className={`relative py-1 text-xs transition ${effective === n.id ? 'font-bold text-white after:absolute after:inset-x-0 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-racing' : 'text-zinc-400 hover:text-zinc-200'}`}>
              {n.label}
            </button>
          ))}
        </div>
      </nav>
      {onOldSite() && (
        <div role="status" className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-center text-xs leading-relaxed text-amber-100">
          새 주소로 옮겼어요: <a href={SITE_URL} className="font-bold underline">{SITE_URL.replace(/^https:\/\//, '').replace(/\/$/, '')}</a>
          {career
            ? <> · <button onClick={() => void goWithCareer()} className="ml-1 rounded-full bg-amber-300 px-2.5 py-0.5 font-bold text-zinc-900">내 커리어 가지고 새 주소로 가기</button></>
            : <> · 새 주소에서 이어서 플레이하세요.</>}
        </div>
      )}
      {confirmBox.dialog}
      {moveMsg && (
        <div role="status" className="border-b border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-center text-xs text-emerald-100">
          {moveMsg} <button onClick={() => setMoveMsg(null)} className="ml-2 underline">닫기</button>
        </div>
      )}
      {effective === 'home' && <Home />}
      <Suspense fallback={<ScreenSkeleton />}>
      {effective === 'create' && <Create />}
      {effective === 'dashboard' && <Dashboard />}
      {effective === 'offseason' && <Offseason />}
      {effective === 'retired' && <Retired />}
      {effective === 'settings' && <Settings />}
      {effective === 'weekend' && <Weekend />}
      {effective === 'records' && <Records />}
      {effective === 'guide' && <Guide />}
      {effective === 'patch' && <PatchNotes />}
      </Suspense>
      <footer className={`mx-auto max-w-5xl px-4 pt-4 text-[11px] leading-relaxed text-zinc-500 ${effective === 'home' ? 'pb-40' : 'pb-8'}`}>
        비공식 팬 게임입니다. Formula 1, FIA 및 각 팀·드라이버와 아무 관계가 없으며 승인받지 않았습니다. F1, FORMULA 1 및 관련 표장은 Formula One Licensing B.V.의 상표입니다. 경기 결과와 계약은 모두 가상의 시뮬레이션입니다.{' '}
        <button onClick={() => go('settings')} className="underline hover:text-zinc-300">크레딧</button>
      </footer>
    </div>
  );
}
