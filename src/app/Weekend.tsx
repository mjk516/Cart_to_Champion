// F1 그랑프리 주말(SPEC §5.3, §5.4): 주말 시작 → 세션마다 클릭 → 레이스 라이브 → 다음 그랑프리

import { useMemo, useState } from 'react';
import {
  circuitType, f1Calendar, f1WeekendFor, homeGpEffect, forecastFinish, ovr, radioKey, runRace,
  type Classified, type F1Weekend, type F1WeekendSession,
} from '../engine';
import { LiveRace } from './LiveRace';
import { F1TeamBadge } from './TeamBadge';
import { useGame } from './store';
import { Bar, Button, Card, Pill, useConfirm } from './ui';

const ME = 'player';
const TYPE_LABEL = { power: '고속 서킷', downforce: '다운포스 서킷', street: '시가지 서킷' } as const;

/** 약자가 겹치는 드라이버는 두 번째부터 숫자를 붙인다(화면 표시용) */
function uniqueCodes<T extends { code: string }>(cars: T[]): T[] {
  const seen = new Map<string, number>();
  return cars.map((car) => {
    const n = (seen.get(car.code) ?? 0) + 1;
    seen.set(car.code, n);
    return n > 1 ? { ...car, code: `${car.code}${n}` } : car;
  });
}

function racePoints(s: F1WeekendSession, skipped: boolean): Classified[] | null {
  if (s.type !== 'race') return null;
  const out = skipped ? runRace({ ...s.input, autoRadio: true }) : s.outcome;
  return out.status === 'finished' ? out.classification : null;
}

export function Weekend() {
  const { career: c, live, updateLive, finishLive, go } = useGame();
  const confirmBox = useConfirm();
  const [doneKey, setDoneKey] = useState<string | null>(null);
  const wk: F1Weekend | null = useMemo(
    () => (c && live && live.year === c.year ? f1WeekendFor(c, live.plan, live.round, live.radio) : null),
    [c, live?.plan, live?.round, live?.radio, live?.year], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const mainRace = wk?.sessions.filter((s) => s.type === 'race').slice(-1)[0];
  const forecast = useMemo(
    () => (mainRace && mainRace.type === 'race' && live?.step === 0 ? forecastFinish({ ...mainRace.input, autoRadio: true }, ME, 80) : null),
    [mainRace, live?.step],
  );
  if (!c || !live || !wk) {
    return <div className="p-6"><Button onClick={() => go('dashboard')}>대시보드로</Button></div>;
  }

  const teamColor = (teamId: string) => c.world.teams.teams.find((t) => t.id === teamId)?.color ?? '#71717a';
  const displayCars = uniqueCodes(wk.cars);
  const codeOf = (id: string) => displayCars.find((x) => x.id === id)?.code ?? id;
  const skipped = live.skipped.includes(live.round);
  const session = live.step > 0 ? wk.sessions[live.step - 1] : undefined;
  const raceKey = session?.type === 'race' ? `${live.round}:${session.kind}` : null;
  const raceDone = raceKey !== null && (doneKey === raceKey || skipped);
  const canNext = !session || session.type === 'quali' || raceDone;
  const rounds = f1Calendar(c).length;
  const home = homeGpEffect(c, wk.circuit);
  const lastRound = live.round >= rounds - 1;
  const lastStep = live.step >= wk.sessions.length;

  const addPoints = (rows: Classified[] | null, pts: Record<string, number>) => {
    if (rows) for (const r of rows) pts[r.id] = (pts[r.id] ?? 0) + r.points;
  };
  const next = () => {
    const pts = { ...live.points };
    if (session?.type === 'race') addPoints(racePoints(session, skipped), pts);
    if (!lastStep) { updateLive({ step: live.step + 1, points: pts }); return; }
    if (lastRound) { finishLive(); return; }
    updateLive({ round: live.round + 1, step: 0, points: pts });
  };
  const skipToResult = () => {
    // 남은 레이스는 엔지니어 추천으로 끝내고, 마지막 레이스 결과를 보여 준다
    const pts = { ...live.points };
    for (let i = live.step; i < wk.sessions.length - 1; i++) addPoints(racePoints(wk.sessions[i]!, true), pts);
    updateLive({ step: wk.sessions.length, points: pts, skipped: [...live.skipped, live.round] });
  };

  const teams = [...c.world.teams.teams].sort((a, b) => b.quality - a.quality);
  const myTeam = c.contract?.teamId;
  const carRank = teams.findIndex((t) => t.id === myTeam) + 1;
  const driverRank = [...wk.cars].sort((a, b) => ovr(b.stats) - ovr(a.stats)).findIndex((x) => x.id === ME) + 1;
  const standings = Object.entries(live.points).sort((a, b) => b[1] - a[1]);
  const myPos = standings.findIndex(([id]) => id === ME) + 1;

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      {confirmBox.dialog}
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-xs text-zinc-400">{c.year} F1 · 라운드 {live.round + 1}/{rounds}</div>
          <h1 className="text-2xl font-black">{wk.circuit.name}</h1>
          <div className="mt-1 flex flex-wrap gap-1">
            <Pill>{TYPE_LABEL[circuitType(wk.circuit)]}</Pill>
            {wk.circuit.sprint && <Pill tone="amber">스프린트 주말</Pill>}
            <Pill tone="blue">비 확률 {Math.round(wk.circuit.rainChance * 100)}%</Pill>
            {home && <Pill tone="green">홈 그랑프리</Pill>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1 text-xs">
          {['주말 시작', ...wk.sessions.map((s) => s.label)].map((l, i) => (
            <span key={i} className={`rounded-full px-2 py-1 font-bold ${i === live.step ? 'bg-racing text-white' : i < live.step ? 'bg-white/15' : 'bg-white/5 text-zinc-500'}`}>{l}</span>
          ))}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_17rem]">
        <Card>
          {live.step === 0 && (
            <div className="space-y-4">
              <div className="text-lg font-black">이번 주말 전망</div>
              {forecast && (
                <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                  {[['예상 순위', `P${forecast.p10}~P${forecast.p90}`], ['포인트', `${Math.round(forecast.points * 100)}%`], ['포디움', `${Math.round(forecast.podium * 100)}%`], ['우승', `${Math.round(forecast.win * 100)}%`]].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-white/5 p-2"><div className="text-[11px] text-zinc-400">{k}</div><div className="text-xl font-black">{v}</div></div>
                  ))}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div><div className="flex justify-between text-sm"><span>차 성능</span><b>{carRank}위 / {teams.length}팀</b></div><Bar value={teams.length - carRank + 1} max={teams.length} color="bg-sky-400" /></div>
                <div><div className="flex justify-between text-sm"><span>드라이버 실력</span><b>{driverRank}위 / {wk.cars.length}명</b></div><Bar value={wk.cars.length - driverRank + 1} max={wk.cars.length} color="bg-emerald-400" /></div>
              </div>
              {home && (
                <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-3 text-sm">
                  <div className="font-bold">홈 그랑프리</div>
                  <div className="text-zinc-300">{home.line}</div>
                  <div className="mt-1 text-xs text-zinc-400">이번 주말 능력치 +{home.boost} · 일관성 {home.mental >= 0 ? '+' : ''}{home.mental}</div>
                </div>
              )}
              <p className="text-xs text-zinc-500">예상 순위는 이번 주말을 80번 미리 돌린 결과의 80% 구간입니다.</p>
            </div>
          )}

          {session?.type === 'quali' && (
            <div>
              <div className="mb-2 text-lg font-black">{session.label} 결과</div>
              <ol className="grid gap-x-6 text-sm sm:grid-cols-2">
                {session.result.order.map((id, i) => {
                  const t0 = session.result.times[session.result.order[0]!] ?? 0;
                  const elim = !session.display && (session.result.eliminatedQ1.includes(id) ? 'Q1 탈락' : session.result.eliminatedQ2.includes(id) ? 'Q2 탈락' : '');
                  return (
                    <li key={id} className={`flex items-center gap-2 border-b border-white/5 py-1 ${id === ME ? 'font-bold text-racing' : ''}`}>
                      <span className="w-6 text-right text-zinc-400">{i + 1}</span>
                      <F1TeamBadge teamId={wk.cars.find((x) => x.id === id)?.teamId} size={18} />
                      <span className="w-12">{codeOf(id)}</span>
                      <span className="flex-1 text-right tabular-nums text-zinc-400">{i === 0 ? '최고 기록' : `+${((session.result.times[id] ?? 0) - t0).toFixed(3)}`}</span>
                      {elim && <span className="text-xs text-zinc-500">{elim}</span>}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {session?.type === 'race' && (
            <div>
              <div className="mb-2 text-lg font-black">{session.label}</div>
              <LiveRace
                key={`${live.round}:${session.kind}:${skipped}`}
                input={session.input}
                realLayout
                cars={displayCars}
                colorOfTeam={teamColor}
                instant={skipped}
                onRadio={(d, o) => updateLive({ radio: { ...live.radio, [radioKey(live.round, session.kind, d)]: o } })}
                onDone={() => setDoneKey(`${live.round}:${session.kind}`)}
              />
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
            <Button onClick={next} disabled={!canNext}>
              {lastStep ? (lastRound ? '시즌 마치기' : '다음 그랑프리') : '다음 세션'}
            </Button>
            {!lastStep && <Button variant="ghost" onClick={skipToResult}>레이스 결과로 바로 가기</Button>}
            <Button variant="ghost" className="ml-auto" onClick={() => confirmBox.ask(<>남은 {rounds - live.round}개 라운드를 자동으로 진행하고 시즌을 마칠까요? 지금까지 고른 무전은 그대로 반영되고, 남은 무전은 엔지니어 추천을 따릅니다.</>, finishLive, { confirmLabel: '남은 시즌 자동 진행' })}>남은 시즌 자동 진행</Button>
          </div>
        </Card>

        <Card title="챔피언십 순위">
          {standings.length === 0 ? <p className="text-sm text-zinc-400">아직 치른 레이스가 없습니다.</p> : (
            <ol className="space-y-1 text-sm">
              {standings.slice(0, 10).map(([id, p], i) => (
                <li key={id} className={`flex items-center gap-2 ${id === ME ? 'font-bold text-racing' : ''}`}><span className="w-5 text-right text-zinc-500">{i + 1}</span><F1TeamBadge teamId={wk.cars.find((x) => x.id === id)?.teamId} size={16} /><span className="flex-1">{codeOf(id)}</span><span>{p}</span></li>
              ))}
              {myPos > 10 && <li className="flex gap-2 font-bold text-racing"><span className="w-5 text-right">{myPos}</span><span className="flex-1">{codeOf(ME)}</span><span>{live.points[ME] ?? 0}</span></li>}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
