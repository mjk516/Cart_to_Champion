import { useEffect } from 'react';
import { Create } from './Create';
import { Dashboard } from './Dashboard';
import { Offseason } from './Offseason';
import { Records } from './Records';
import { Guide } from './Guide';
import { Retired } from './Retired';
import { Weekend } from './Weekend';
import { Home } from './Home';
import { Settings } from './Screens';
import { requestPersistentStorage, useGame } from './store';

export function App() {
  const { screen, career, go } = useGame();
  // 은퇴한 커리어는 항상 은퇴 화면으로
  const effective = career?.retired && (screen === 'dashboard' || screen === 'offseason') ? 'retired' : screen;
  // 휴대폰 브라우저가 저장 데이터를 지우지 않게 요청(한 번)
  useEffect(() => { requestPersistentStorage(); }, []);
  // 화면이나 시즌이 바뀌면 맨 위부터 보여 준다
  useEffect(() => { window.scrollTo(0, 0); }, [effective, career?.year]);
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="sticky top-0 z-40 flex items-center justify-between border-b border-white/10 bg-zinc-950/90 px-4 py-3 backdrop-blur">
        <button onClick={() => go('home')} className="text-sm font-black tracking-tight">
          <span className="text-racing">▍</span>카트에서 챔피언까지
        </button>
        <div className="flex gap-4">
          <button onClick={() => go('guide')} className="text-xs text-zinc-400 hover:text-zinc-200">게임 방법</button>
          {career && <button onClick={() => go('records')} className="text-xs text-zinc-400 hover:text-zinc-200">업적·기록</button>}
          <button onClick={() => go('settings')} className="text-xs text-zinc-400 hover:text-zinc-200">설정</button>
        </div>
      </nav>
      {effective === 'home' && <Home />}
      {effective === 'create' && <Create />}
      {effective === 'dashboard' && <Dashboard />}
      {effective === 'offseason' && <Offseason />}
      {effective === 'retired' && <Retired />}
      {effective === 'settings' && <Settings />}
      {effective === 'weekend' && <Weekend />}
      {effective === 'records' && <Records />}
      {effective === 'guide' && <Guide />}
      <footer className={`mx-auto max-w-5xl px-4 pt-4 text-[11px] leading-relaxed text-zinc-500 ${effective === 'home' ? 'pb-40' : 'pb-8'}`}>
        비공식 팬 게임입니다. Formula 1, FIA 및 각 팀·드라이버와 아무 관계가 없으며 승인받지 않았습니다. F1, FORMULA 1 및 관련 표장은 Formula One Licensing B.V.의 상표입니다. 경기 결과와 계약은 모두 가상의 시뮬레이션입니다.{' '}
        <button onClick={() => go('settings')} className="underline hover:text-zinc-300">크레딧</button>
      </footer>
    </div>
  );
}
