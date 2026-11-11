import { useEffect } from 'react';
import { Create } from './Create';
import { Dashboard } from './Dashboard';
import { Offseason } from './Offseason';
import { Home, Retired, Settings } from './Screens';
import { useGame } from './store';

export function App() {
  const { screen, career, go } = useGame();
  // 은퇴한 커리어는 항상 은퇴 화면으로
  const effective = career?.retired && (screen === 'dashboard' || screen === 'offseason') ? 'retired' : screen;
  // 화면이나 시즌이 바뀌면 맨 위부터 보여 준다
  useEffect(() => { window.scrollTo(0, 0); }, [effective, career?.year]);
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="sticky top-0 z-40 flex items-center justify-between border-b border-white/10 bg-zinc-950/90 px-4 py-3 backdrop-blur">
        <button onClick={() => go('home')} className="text-sm font-black tracking-tight">
          <span className="text-racing">▍</span>카트에서 챔피언까지
        </button>
        <button onClick={() => go('settings')} className="text-xs text-zinc-400 hover:text-zinc-200">설정</button>
      </nav>
      {effective === 'home' && <Home />}
      {effective === 'create' && <Create />}
      {effective === 'dashboard' && <Dashboard />}
      {effective === 'offseason' && <Offseason />}
      {effective === 'retired' && <Retired />}
      {effective === 'settings' && <Settings />}
    </div>
  );
}
