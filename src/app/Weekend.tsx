// F1 그랑프리 주말(SPEC §5.3, §5.4): 주말 시작 → 세션마다 클릭 → 레이스 라이브 → 다음 그랑프리

import { useMemo, useState } from 'react';
import { midPlanFor, midTrainingAdvice, midTrainingPreview, midTrainingRound, TRAINING, type Career, type TrainingId,
  circuitType, strategyKey, enduranceOffer, f1Calendar, f1WeekendFor, homeGpEffect, forecastFinish, ovr, radioKey, runRace,
  type Classified, type F1Weekend, type F1WeekendSession,
} from '../engine';
import { LiveRace } from './LiveRace';
import { gpName, RaceAftermath } from './RaceAftermath';
import { StrategyMeeting } from './StrategyMeeting';
import { EnduranceBroadcast } from './EnduranceBroadcast';
import { F1TeamBadge } from './TeamBadge';
import { Tip } from './Guide';
import { advanceToMidTraining, beforeMidTraining, useGame, type LiveSeason } from './store';
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

const STAT_KO: Record<string, string> = { pace: '페이스', racecraft: '레이스크래프트', consistency: '일관성', wet: '우천', tyre: '타이어 관리', feedback: '피드백' };

/** 시즌 중 훈련 세션(SPEC v0.48): 그랑프리 사이 2칸. 이후 레이스 실력과 앞으로의 능력치에 그대로 남는다 */
function MidTrainingSession({ c, live, rounds, onTrain, onAuto, onJoin }: {
  c: Career; live: LiveSeason; rounds: number; onTrain: (plan: TrainingId[]) => void; onAuto: () => void; onJoin: () => void;
}) {
  const [sel, setSel] = useState<TrainingId[]>(() => live.midPlan ?? midTrainingAdvice(c));
  const plan = live.midDone && live.midPlan ? live.midPlan : sel;
  const gains = useMemo(() => midTrainingPreview(c, plan), [c, plan]);
  const ups = Object.entries(gains).map(([k, v]) => `${STAT_KO[k]} +${v}`);
  const cost = plan.reduce((a, id) => a + (id === 'sim' ? 0 : TRAINING[id].cost), 0);
  return (
    <div className="rounded-xl border border-emerald-400/40 bg-emerald-400/5 p-3 text-sm" aria-label="시즌 중 훈련 세션">
      <div className="font-bold">🏋️ 시즌 중 훈련 세션 · 라운드 {midTrainingRound(rounds)}와 {midTrainingRound(rounds) + 1} 사이</div>
      {!live.midDone ? (
        <>
          <p className="mt-1 text-xs text-zinc-400">그랑프리 사이 훈련 2칸입니다. 오른 능력치는 이번 주말부터 레이스에 반영되고, 다음 시즌 이후에도 그대로 남습니다.{live.autoPaused ? ' 자동 진행을 잠시 멈췄습니다.' : ''}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {sel.map((id, i) => (
              <select key={i} aria-label={`시즌 중 훈련 ${i + 1}칸`} value={id} onChange={(e) => setSel(sel.map((x, j) => (j === i ? (e.target.value as TrainingId) : x)))}
                className="rounded-xl border border-white/15 bg-zinc-950 px-2 py-2 text-sm">
                {(Object.keys(TRAINING) as TrainingId[]).map((t) => <option key={t} value={t}>{TRAINING[t].label}{t !== 'sim' && TRAINING[t].cost ? ` · €${TRAINING[t].cost / 1000}k` : ''}</option>)}
              </select>
            ))}
          </div>
          <p className="mt-2 text-xs text-emerald-200">{ups.length ? `예상: ${ups.join(', ')}` : '이번 훈련으로 바로 오르는 능력치는 없습니다(경험치는 쌓입니다).'}{cost ? ` · 비용 €${cost / 1000}k` : ''}</p>
          <div className="mt-2"><Button size="sm" onClick={() => onTrain(sel)}>훈련하기</Button></div>
        </>
      ) : (
        <>
          <p className="mt-1 text-zinc-200">훈련 완료: {plan.map((id) => TRAINING[id].label).join(', ')}{ups.length ? ` → ${ups.join(', ')}` : ''}. 이번 주말부터 반영됩니다.</p>
          {live.autoPaused && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" onClick={onAuto}>남은 시즌 자동 진행</Button>
              <Button size="sm" variant="ghost" onClick={onJoin}>이 그랑프리부터 직접 참여</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function Weekend() {
  const { career: c, live, updateLive, finishLive, go } = useGame();
  const confirmBox = useConfirm();
  const [doneKey, setDoneKey] = useState<string | null>(null);
  const [skipAsk, setSkipAsk] = useState(false);
  const wk: F1Weekend | null = useMemo(
    () => (c && live && live.year === c.year ? f1WeekendFor(c, live.plan, live.round, live.radio, live.strategy ?? {}, live.midPlan) : null),
    [c, live?.plan, live?.round, live?.radio, live?.year, live?.strategy, live?.midPlan], // eslint-disable-line react-hooks/exhaustive-deps
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
  const rounds = f1Calendar(c).length;
  // 시즌 중 훈련 세션(SPEC v0.48): 이 라운드 주말을 시작하기 전에 훈련을 마쳐야 한다
  const midHere = live.round === midTrainingRound(rounds) && !!midPlanFor(c, live.midPlan);
  const needTraining = midHere && !live.midDone;
  const canNext = (!session || session.type === 'quali' || raceDone) && !needTraining && !live.autoPaused;
  const home = homeGpEffect(c, wk.circuit);
  const lastRound = live.round >= rounds - 1;
  const lastStep = live.step >= wk.sessions.length;
  // 프랙티스는 결과에 영향이 없으므로 첫 퀄리파잉으로 건너뛸 수 있다(step은 세션 번호 + 1)
  const qualiStep = wk.sessions.findIndex((x) => x.type === 'quali' && !x.display) + 1;
  // 지난 그랑프리와 이번 주말 사이에 내구레이스가 있었다
  const endur = enduranceOffer(c);
  const endurHere = endur && live.round === endur.afterRound + 1 ? endur : null;

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
  // 레이스 도중 넘기기(SPEC v0.48): 이 세션(과 '다음 그랑프리'면 남은 세션)을 엔지니어 판단으로 끝낸다
  const skipSession = (to: 'session' | 'gp') => {
    const pts = { ...live.points };
    const last = to === 'gp' ? wk.sessions.length : live.step;
    for (let i = live.step - 1; i < last; i++) addPoints(racePoints(wk.sessions[i]!, true), pts);
    if (to === 'session' && !lastStep) { updateLive({ step: live.step + 1, points: pts }); return; }
    if (lastRound) { updateLive({ points: pts, skipped: [...live.skipped, live.round] }); finishLive(); return; }
    updateLive({ round: live.round + 1, step: 0, points: pts, skipped: [...live.skipped, live.round] });
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
          <div className="flex items-center gap-2 text-xs text-zinc-400"><span>{c.year} F1 · 라운드 {live.round + 1}/{rounds}</span><button onClick={() => go('dashboard')} className="rounded-md border border-white/15 px-1.5 py-0.5 hover:bg-white/5">대시보드</button></div>
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

      {/* 세션 중에는 챔피언십 순위를 한 줄로 줄이고, 전체 표는 주말 시작 화면에서만 보여 준다 */}
      {live.step > 0 && standings.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400" aria-label="챔피언십 요약">
          <span className="font-bold text-zinc-300">챔피언십</span>
          {standings.slice(0, 3).map(([id, p], i) => <span key={id} className={id === ME ? 'font-bold text-racing' : ''}>{i + 1}. {codeOf(id)} {p}</span>)}
          {myPos > 3 && <span className="font-bold text-racing">{myPos}. {codeOf(ME)} {live.points[ME] ?? 0}</span>}
        </div>
      )}
      <div className={`grid gap-4 ${live.step === 0 ? 'lg:grid-cols-[1fr_17rem]' : ''}`}>
        <Card>
          {live.step === 0 && (
            <div className="space-y-4">
              <Tip id="weekend" title="그랑프리 주말">
                <p>위쪽 단계 표시처럼 <b>다음 세션</b>을 누를 때마다 프랙티스 → 퀄리파잉 → 레이스로 넘어갑니다. 레이스와 스프린트는 첫 랩부터 체커기까지 트랙 뷰로 진행되고(배속은 ×2부터, 트랙 뷰 안 버튼으로 바꿈), 세이프티카·비가 오면 <b>엔지니어 무전</b>을 고릅니다. 세이프티카 때는 사고 지점·크기·예상 시간이 함께 나옵니다.</p>
                <p>바쁘면 "레이스 결과로 바로 가기"나 "남은 시즌 자동 진행"을 쓰세요.</p>
              </Tip>
              {midHere && (
                <MidTrainingSession c={c} live={live} rounds={rounds}
                  onTrain={(plan) => updateLive({ midPlan: plan, midDone: true })}
                  onAuto={finishLive} onJoin={() => updateLive({ autoPaused: false })} />
              )}
              {endurHere && (
                <div className={`rounded-xl border p-3 text-sm ${live.endurance ? 'border-amber-400/40 bg-amber-400/5' : 'border-white/10 bg-white/5'}`} aria-label="내구레이스">
                  <div className="font-bold">🏁 {endurHere.when} · {endurHere.name}</div>
                  <div className="mt-1">
                    {live.endurance
                      ? <EnduranceBroadcast c={c} offer={endurHere} choices={live.enduranceChoices ?? {}} done={!!live.enduranceDone}
                          onChoose={(next) => updateLive({ enduranceChoices: next })} onDone={() => updateLive({ enduranceDone: true })} />
                      : <span className="text-zinc-300">이번에는 나가지 않고 F1 준비에 집중했다.</span>}
                  </div>
                </div>
              )}
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

          {session?.type === 'race' && !skipped && !(live.strategyDone ?? []).includes(strategyKey(live.round, session.kind)) && (
            <div>
              <div className="mb-2 text-lg font-black">{session.label}</div>
              <StrategyMeeting
                c={c} circuit={wk.circuit} kind={session.kind} laps={session.outcome.totalLaps} seed={session.input.seed}
                initial={live.strategy?.[strategyKey(live.round, session.kind)]}
                onConfirm={(choice) => updateLive({
                  strategy: { ...(live.strategy ?? {}), [strategyKey(live.round, session.kind)]: choice },
                  strategyDone: [...(live.strategyDone ?? []), strategyKey(live.round, session.kind)],
                })}
              />
            </div>
          )}
          {session?.type === 'race' && (skipped || (live.strategyDone ?? []).includes(strategyKey(live.round, session.kind))) && (
            <div>
              <div className="mb-2 text-lg font-black">{session.label}</div>
              <LiveRace
                key={`${live.round}:${session.kind}:${skipped}`}
                input={session.input}
                realLayout
                cars={displayCars}
                colorOfTeam={teamColor}
                instant={skipped}
                startAt={live.raceLap?.key === `${live.round}:${live.step}` ? live.raceLap.lap : 0}
                onProgress={(lap) => updateLive({ raceLap: { key: `${live.round}:${live.step}`, lap } })}
                chat={{
                  kr: c.driver.nationality === 'KR', name: c.driver.name,
                  hadPoints: c.history.some((h) => h.series === 'f1' && h.points > 0) || (live.points[ME] ?? 0) > 0,
                  hadPodium: c.history.some((h) => h.series === 'f1' && h.podiums > 0),
                  hadWin: c.totals.f1Wins > 0,
                }}
                onRadio={(d, o) => updateLive({ radio: { ...live.radio, [radioKey(live.round, session.kind, d)]: o } })}
                onDone={() => setDoneKey(`${live.round}:${session.kind}`)}
              />
              {raceDone && (() => {
                const out = skipped ? runRace({ ...session.input, autoRadio: true }) : session.outcome;
                if (out.status !== 'finished') return null;
                return (
                  <RaceAftermath
                    c={c} round={live.round} kind={session.kind} gp={gpName(c, wk.circuit, f1Calendar(c))} rows={out.classification} incidents={out.incidents} cars={wk.cars}
                    chosen={live.sns?.[String(live.round)]}
                    onPick={(id) => updateLive({ sns: { ...(live.sns ?? {}), [String(live.round)]: id } })}
                  />
                );
              })()}
            </div>
          )}

          {session?.type === 'race' && !raceDone && (
            <div className="mt-3 flex justify-start">
              <Button variant="ghost" size="sm" onClick={() => setSkipAsk(true)}>⏭ 이 {session.kind === 'sprint' ? '스프린트' : '레이스'} 넘기기</Button>
            </div>
          )}
          {skipAsk && session?.type === 'race' && (
            <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-3 sm:items-center" role="alertdialog" aria-modal="true" onClick={() => setSkipAsk(false)}>
              <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <p className="text-sm leading-relaxed text-zinc-100">이 {session.kind === 'sprint' ? '스프린트' : '레이스'}를 넘겨도 될까요? 남은 랩은 엔지니어 판단으로 끝나고 결과만 반영됩니다.</p>
                <div className="mt-5 grid gap-2">
                  {!lastStep && <Button onClick={() => { setSkipAsk(false); skipSession('session'); }}>넘기고 다음 세션으로</Button>}
                  <Button variant={lastStep ? 'primary' : 'ghost'} onClick={() => { setSkipAsk(false); skipSession('gp'); }}>{lastRound ? '넘기고 시즌 마치기' : '넘기고 다음 그랑프리로'}</Button>
                  <Button variant="ghost" onClick={() => setSkipAsk(false)}>계속 보기</Button>
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
            <Button onClick={next} disabled={!canNext}>
              {lastStep ? (lastRound ? '시즌 마치기' : '다음 그랑프리') : '다음 세션'}
            </Button>
            {qualiStep > live.step && <Button variant="ghost" onClick={() => updateLive({ step: qualiStep })}>{wk.circuit.sprint ? '스프린트 퀄리파잉으로 바로 가기' : '퀄리파잉으로 바로 가기'}</Button>}
            {!lastStep && <Button variant="ghost" onClick={skipToResult}>레이스 결과로 바로 가기</Button>}
            <Button variant="ghost" onClick={() => beforeMidTraining(c, live)
              ? confirmBox.ask(<>시즌 중 훈련 세션(라운드 {midTrainingRound(rounds) + 1})까지 자동으로 진행할까요? 훈련을 고른 뒤 남은 시즌을 계속 자동으로 돌리거나 직접 참여할 수 있습니다.</>, () => updateLive(advanceToMidTraining(c, live)), { confirmLabel: '훈련 세션까지 자동 진행' })
              : confirmBox.ask(<>남은 {rounds - live.round}개 라운드를 자동으로 진행하고 시즌을 마칠까요? 지금까지 고른 무전은 그대로 반영되고, 남은 무전은 엔지니어 추천을 따릅니다.</>, finishLive, { confirmLabel: '남은 시즌 자동 진행' })}>남은 시즌 자동 진행</Button>
          </div>
        </Card>

        {live.step === 0 && <Card title="챔피언십 순위">
          {standings.length === 0 ? <p className="text-sm text-zinc-400">아직 치른 레이스가 없습니다.</p> : (
            <ol className="space-y-1 text-sm">
              {standings.slice(0, 10).map(([id, p], i) => (
                <li key={id} className={`flex items-center gap-2 ${id === ME ? 'font-bold text-racing' : ''}`}><span className="w-5 text-right text-zinc-500">{i + 1}</span><F1TeamBadge teamId={wk.cars.find((x) => x.id === id)?.teamId} size={16} /><span className="flex-1">{codeOf(id)}</span><span>{p}</span></li>
              ))}
              {myPos > 10 && <li className="flex gap-2 font-bold text-racing"><span className="w-5 text-right">{myPos}</span><span className="flex-1">{codeOf(ME)}</span><span>{live.points[ME] ?? 0}</span></li>}
            </ol>
          )}
        </Card>}
      </div>
    </div>
  );
}
