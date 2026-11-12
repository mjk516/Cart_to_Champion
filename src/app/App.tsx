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
import { requestPersistentStorage, useGame } from './store';

export function App() {
  const { screen, career, go, exportSave, importSave, peekSave } = useGame();
  const confirmBox = useConfirm();
  const [moveMsg, setMoveMsg] = useState<string | null>(null);
  // 은퇴한 커리어는 항상 은퇴 화면으로
  const effective = career?.retired && (screen === 'dashboard' || screen === 'offseason') ? 'retired' : screen;
  // 휴대폰 브라우저가 저장 데이터를 지우지 않게 요청(한 번)
  useEffect(() => { requestPersistentStorage(); }, []);
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
          <button onClick={() => go('patch')} className="text-xs text-zinc-400 hover:text-zinc-200">패치노트</button>
          <button onClick={() => go('guide')} className="text-xs text-zinc-400 hover:text-zinc-200">게임 방법</button>
          {career && <button onClick={() => go('records')} className="text-xs text-zinc-400 hover:text-zinc-200">업적·기록</button>}
          <button onClick={() => go('settings')} className="text-xs text-zinc-400 hover:text-zinc-200">설정</button>
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
      <Suspense fallback={<div className="mx-auto max-w-5xl px-4 py-10 text-sm text-zinc-500" role="status">불러오는 중…</div>}>
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
