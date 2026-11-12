// 업적·기록 화면(SPEC §9 v0.22): 통산 기록, 리그별 최고 성적, 업적 목록.

import { ACHIEVEMENT_GROUP_LABEL, achievements, careerRecords, DIFFICULTY_INFO, difficultyOf, enduranceRecords, LADDER, REAL_YOUNGEST, REAL_YOUNGEST_HOLDER, seriesLabel, type AchievementGroup } from '../engine';
import { formatMoney } from './format';
import { useGame } from './store';
import { Button, Card } from './ui';

type YoungKey = keyof typeof REAL_YOUNGEST;
/** 최연소 기록 한 줄: 내 기록과 실제 F1 기준(보유자·나이) */
function youngRow(label: string, r: { age: number; year: number; beatsReal: boolean } | null, key: YoungKey): [string, string, string] {
  const real = `${REAL_YOUNGEST_HOLDER[key]} ${REAL_YOUNGEST[key]}세`;
  return [label, r ? `${r.age}세 (${r.year})` : '—', r?.beatsReal ? `실제 기록(${real})보다 어림 🏅` : `실제 기록 ${real}`];
}

export function Records() {
  const { career: c, showKrw, go } = useGame();
  if (!c) return <div className="p-6"><Button onClick={() => go('home')}>처음으로</Button></div>;
  const t = c.totals;
  const list = achievements(c);
  const rec = careerRecords(c);
  const endur = enduranceRecords(c);
  const recRows: Array<[string, string, string?]> = [
    youngRow('최연소 F1 우승', rec.youngestWin, 'winner'),
    youngRow('최연소 F1 포디움', rec.youngestPodium, 'podium'),
    youngRow('최연소 폴 포지션', rec.youngestPole, 'pole'),
    youngRow('최연소 월드 챔피언', rec.youngestChampion, 'champion'),
    ['단일 시즌 최다 우승', rec.mostWinsSeason ? `${rec.mostWinsSeason.wins}승 / ${rec.mostWinsSeason.races}경기 (${rec.mostWinsSeason.year} ${rec.mostWinsSeason.team ?? ''})` : '—'],
    ['최다 연속 챔피언', rec.titleStreak ? `${rec.titleStreak.count}연패 (${rec.titleStreak.from}${rec.titleStreak.to !== rec.titleStreak.from ? `~${rec.titleStreak.to}` : ''})` : '—'],
    ['한 팀 최장 기간', rec.longestStint ? `${rec.longestStint.team} ${rec.longestStint.seasons}시즌 (${rec.longestStint.from}~${rec.longestStint.to})` : '—'],
  ];
  const done = list.filter((a) => a.year !== null).length;
  const f1Seasons = c.history.filter((h) => h.series === 'f1' && h.seat === 'race').length;
  const earnings = c.history.reduce((a, h) => a + h.income, 0);
  const best = LADDER.map((s) => {
    const hs = c.history.filter((h) => h.series === s && h.seat === 'race' && h.position);
    if (!hs.length) return null;
    const top = [...hs].sort((a, b) => (a.position ?? 99) - (b.position ?? 99) || b.wins - a.wins)[0]!;
    return { s, seasons: hs.length, top, wins: hs.reduce((a, h) => a + h.wins, 0), titles: hs.filter((h) => h.champion).length };
  }).filter((x) => x !== null);
  const tiles: Array<[string, string | number]> = [
    ['월드 챔피언', t.f1Titles], ['F1 출전', t.f1Starts], ['F1 우승', t.f1Wins], ['F1 포디움', t.f1Podiums], ['F1 폴', t.f1Poles],
    ['F1 승률', t.f1Starts ? `${((t.f1Wins / t.f1Starts) * 100).toFixed(1)}%` : '—'], ['F1 시즌', f1Seasons],
    ['하부 리그 타이틀', t.juniorTitles.length], ['최고 OVR', t.bestOvr], ['통산 수입', formatMoney(earnings, showKrw)],
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-xs text-zinc-400">{c.driver.name} · {c.history.length}시즌 · 난이도 {DIFFICULTY_INFO[difficultyOf(c)].label}</div>
          <h1 className="text-2xl font-black">업적·기록</h1>
        </div>
        <Button variant="ghost" onClick={() => go(c.retired ? 'retired' : 'dashboard')}>돌아가기</Button>
      </header>

      <Card title="통산 기록">
        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
          {tiles.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white/5 p-2"><div className="text-[11px] text-zinc-400">{k}</div><div className="text-lg font-black">{v}</div></div>
          ))}
        </div>
      </Card>

      {rec.legend && (
        <div className="rounded-2xl border border-amber-400/50 bg-gradient-to-r from-amber-400/15 to-transparent p-4">
          <div className="text-xs font-bold text-amber-300">팀 레전드</div>
          <div className="mt-1 flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-amber-300 text-2xl font-black text-amber-200">#{rec.legend.number}</div>
            <div>
              <div className="text-lg font-black">{rec.legend.team}, {c.driver.name}의 #{rec.legend.number}를 영구결번</div>
              <div className="text-sm text-zinc-300">{rec.legend.seasons}시즌 · 챔피언 {rec.legend.titles}회 · {rec.legend.year}년 레전드 등극</div>
            </div>
          </div>
        </div>
      )}

      <Card title="커리어 기록">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {recRows.map(([k, v, note]) => (
            <div key={k} className="flex flex-wrap items-baseline justify-between gap-x-2 border-b border-white/5 pb-1">
              <dt className="text-zinc-400">{k}</dt>
              <dd className="text-right font-bold">{v}{note && <span className="ml-1 text-xs font-normal text-amber-300">· {note}</span>}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {endur.starts > 0 && (
        <Card title="내구레이스 기록">
          <div className="grid grid-cols-4 gap-2 text-center">
            {([['출전', endur.starts], ['클래스 우승', endur.wins], ['포디움', endur.podiums], ['리타이어', endur.dnfs]] as const).map(([k, v]) => (
              <div key={k} className="rounded-xl bg-white/5 p-2"><div className="text-[11px] text-zinc-400">{k}</div><div className="text-lg font-black">{v}</div></div>
            ))}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm" aria-label="대회별 최고 성적">
              <thead><tr className="text-left text-xs text-zinc-400"><th className="py-1">대회</th><th>출전</th><th>최고 성적</th></tr></thead>
              <tbody>
                {endur.best.map((b) => (
                  <tr key={b.name} className="border-t border-white/5">
                    <td className="py-1.5 font-bold">{b.best === 1 ? '🏆 ' : ''}{b.name}</td>
                    <td>{b.starts}회</td>
                    <td>{b.best === null ? '완주 못 함' : b.best === 1 ? `클래스 우승 (${b.bestYear})` : `클래스 ${b.best}위 (${b.bestYear})`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-3 space-y-0.5 text-xs text-zinc-400">
            {endur.list.map((e) => <li key={e.year}>{e.year} · {e.name} — {e.position === null ? '리타이어' : e.position === 1 ? '클래스 우승' : `클래스 ${e.position}위 / ${e.classCars}대`}</li>)}
          </ul>
        </Card>
      )}

      <Card title="리그별 최고 성적">
        {best.length === 0 ? <p className="text-sm text-zinc-400">아직 레이스 시트로 치른 시즌이 없습니다.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-zinc-400"><tr><th className="text-left">리그</th><th>시즌</th><th>최고 순위</th><th>우승</th><th>타이틀</th></tr></thead>
              <tbody>
                {best.map((b) => (
                  <tr key={b.s} className="border-t border-white/5 text-center">
                    <td className="py-1 text-left">{seriesLabel(b.s)}</td>
                    <td>{b.seasons}</td>
                    <td>{b.top.champion ? '🏆 ' : ''}P{b.top.position} <span className="text-xs text-zinc-500">({b.top.year} {b.top.team})</span></td>
                    <td>{b.wins}</td>
                    <td>{b.titles}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`업적 ${done} / ${list.length}`}>
        {(['junior', 'f1', 'special'] as AchievementGroup[]).map((g) => (
          <div key={g} className="mb-4 last:mb-0">
            <div className="mb-2 text-xs font-bold text-zinc-400">{ACHIEVEMENT_GROUP_LABEL[g]}</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.filter((a) => a.def.group === g).map(({ def, year }) => (
                <div key={def.id} className={`rounded-xl border p-3 ${year !== null ? 'border-amber-400/40 bg-amber-400/5' : 'border-white/10 opacity-50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-sm">{year !== null ? '🏅' : '🔒'} {def.title}</b>
                    {year ? <span className="text-xs text-amber-300">{year}</span> : year === 0 ? <span className="text-xs text-amber-300">달성</span> : null}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-400">{def.desc}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
