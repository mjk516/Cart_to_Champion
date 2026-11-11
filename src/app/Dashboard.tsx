// 대시보드(SPEC §10 화면 3): 현재 팀·능력치·XP·계약·자금·언론 지표, 훈련 계획, 시즌 진행, 커리어 기록

import { useEffect, useMemo, useState } from 'react';
import {
  isF1RaceSeason, managerOf, MANAGER_STYLE_LABEL, ovr, PERSONALITIES, recommendedPlan, seriesLabel, STAT_KEYS, superLicencePoints, TRAINING, TRAINING_SLOTS,
  TRAINING_SLOTS_RESERVE, xpNeeded, type TrainingId,
} from '../engine';
import { formatMoney } from './format';
import { FeedList } from './FeedList';
import { useGame } from './store';
import { F1TeamBadge } from './TeamBadge';
import { Bar, Button, Card, Pill, SEAT_LABELS, STAT_LABELS, TEMPERAMENT_LABELS } from './ui';

const MODES = [
  { id: 'weakness', label: '약점 보완' },
  { id: 'strength', label: '강점 극대화' },
  { id: 'balanced', label: '균형' },
] as const;

export function Dashboard() {
  const { career: c, showKrw, playSeason, live, startLive, go } = useGame();
  const [running, setRunning] = useState(false);
  const slots = c?.contract?.seat === 'race' || !c?.contract ? TRAINING_SLOTS : TRAINING_SLOTS_RESERVE;
  const [plan, setPlan] = useState<TrainingId[]>(() => (c ? recommendedPlan(c.driver.stats, 'weakness', slots, c.driver.focus) : []));
  useEffect(() => {
    if (c) setPlan(recommendedPlan(c.driver.stats, 'weakness', slots, c.driver.focus));
    setRunning(false);
  }, [c?.year, slots]); // eslint-disable-line react-hooks/exhaustive-deps

  const planCost = useMemo(() => plan.reduce((a, id) => a + TRAINING[id].cost, 0), [plan]);
  if (!c || c.retired) return null;

  const d = c.driver;
  const pdef = PERSONALITIES[d.personality];
  const temper = TEMPERAMENT_LABELS[pdef.temperament]!;
  const contract = c.contract;
  const series = contract?.series ?? c.history[c.history.length - 1]?.series ?? 'kart';
  const sl = superLicencePoints(c);
  const lastChamp = c.world.champions[c.world.champions.length - 1];
  const lastFeed = c.history[c.history.length - 1]?.feed ?? [];
  const recentEvents = (c.eventLog ?? []).filter((e) => e.year === c.year - 1);

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs text-zinc-400">{c.year} 시즌 · {c.age}세</div>
          <h1 className="text-2xl font-black">{d.name}</h1>
          <div className="mt-1 flex flex-wrap gap-2">
            <Pill>{pdef.label}</Pill>
            <Pill tone={temper.tone}>{temper.label}</Pill>
            {c.academy && <Pill tone="blue">{c.academy}</Pill>}
            <Pill tone="blue">매니저 {managerOf(c).name} · {MANAGER_STYLE_LABEL[managerOf(c).style]}</Pill>
            {c.management && <Pill tone="amber">매니지먼트 후원(F1 연봉 {Math.round(c.management.share * 100)}%)</Pill>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-zinc-400">OVR</div>
          <div className="text-4xl font-black text-racing">{ovr(d.stats).toFixed(1)}</div>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="이번 시즌">
          {contract ? (
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2 text-lg font-black">{contract.series === 'f1' && <F1TeamBadge teamId={contract.teamId} size={30} />}{seriesLabel(contract.series)} · {contract.team}</div>
              <div className="text-zinc-300">{SEAT_LABELS[contract.seat]} · 계약 {contract.endYear}년까지</div>
              {contract.salary > 0 && <div>연봉 {formatMoney(contract.salary, showKrw)}</div>}
              {contract.seatCost > 0 && (
                <div>시트 비용 {formatMoney(contract.seatCost, showKrw)}{(contract.management || (c.academy && contract.series !== 'f1')) && ' — 후원으로 충당'}</div>
              )}
            </div>
          ) : (
            <p className="text-sm text-zinc-300">시트가 없습니다. 이번 시즌은 훈련만 합니다.</p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-white/5 p-2"><div className="text-xs text-zinc-400">자금</div><b>{formatMoney(c.funds, showKrw)}</b></div>
            <div className="rounded-xl bg-white/5 p-2"><div className="text-xs text-zinc-400">슈퍼 라이선스(3시즌)</div><b>{sl} / 40</b></div>
          </div>
        </Card>

        <Card title="언론과 팬">
          {[
            ['언론 평판', c.media.reputation, 100, 'bg-sky-400'],
            ['팬 여론', c.media.sentiment + 100, 200, 'bg-emerald-400'],
            ['압박', c.media.pressure, 100, 'bg-amber-400'],
          ].map(([label, v, max, color]) => (
            <div key={label as string} className="mb-2">
              <div className="flex justify-between text-xs text-zinc-400"><span>{label}</span><span>{label === '팬 여론' ? Math.round((v as number) - 100) : Math.round(v as number)}</span></div>
              <Bar value={v as number} max={max as number} color={color as string} />
            </div>
          ))}
          <div className="text-sm">팔로워 <b>{c.media.followers.toLocaleString('ko-KR')}</b>명</div>
        </Card>
      </div>

      <Card title="능력치">
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {STAT_KEYS.map((k) => {
            const need = xpNeeded(d.stats[k], d.hidden.potential);
            return (
              <div key={k}>
                <div className="flex justify-between text-sm"><span>{STAT_LABELS[k]}</span><b>{d.stats[k]}</b></div>
                <Bar value={d.stats[k]} />
                <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
                  <span className="w-20">다음 상승까지</span><Bar value={d.xp[k]} max={need} color="bg-zinc-400" className="h-1" />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title={`훈련 계획 (${plan.length}칸)`} right={
        <div className="flex gap-1">
          {MODES.map((m) => (
            <button key={m.id} onClick={() => setPlan(recommendedPlan(d.stats, m.id, slots, d.focus))} className="rounded-lg border border-white/15 px-2 py-1 text-xs hover:bg-white/5">{m.label}</button>
          ))}
        </div>
      }>
        <div className="grid gap-2 sm:grid-cols-3">
          {plan.map((id, i) => (
            <select key={i} value={id} onChange={(e) => setPlan(plan.map((x, j) => (j === i ? (e.target.value as TrainingId) : x)))}
              className="rounded-xl border border-white/15 bg-zinc-950 px-2 py-2 text-sm">
              {(Object.keys(TRAINING) as TrainingId[]).map((t) => (
                <option key={t} value={t}>{TRAINING[t].label}{TRAINING[t].cost ? ` · ${formatMoney(TRAINING[t].cost, false)}` : ''}</option>
              ))}
            </select>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-zinc-400">훈련 비용 {formatMoney(planCost, showKrw)}</span>
          {!plan.includes('rest') && <Pill tone="amber">휴식이 없으면 컨디션이 떨어지고 부상 위험이 커진다</Pill>}
          {isF1RaceSeason(c) ? (
            <div className="ml-auto flex flex-wrap gap-2">
              {live && live.year === c.year ? (
                <Button onClick={() => go('weekend')}>진행 중인 시즌 이어하기 (라운드 {live.round + 1})</Button>
              ) : (
                <Button onClick={() => startLive(plan)}>{c.year} 시즌 라이브로 시작</Button>
              )}
              <Button variant="ghost" disabled={running} onClick={() => { setRunning(true); setTimeout(() => playSeason(plan), 30); }}>
                {running ? '시즌 진행 중…' : '한 번에 진행'}
              </Button>
            </div>
          ) : (
            <Button className="ml-auto" disabled={running} onClick={() => { setRunning(true); setTimeout(() => playSeason(plan), 30); }}>
              {running ? '시즌 진행 중…' : `${c.year} 시즌 진행`}
            </Button>
          )}
        </div>
      </Card>

      {(lastFeed.length > 0 || recentEvents.length > 0) && (
        <Card title="최근 소식">
          {recentEvents.map((e) => (
            <div key={`${e.year}-${e.id}`} className="mb-2 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
              <div className="text-xs text-zinc-400">{e.year} 겨울 · {e.title} · {e.option}</div>
              <p className="mt-1">{e.text}</p>
            </div>
          ))}
          <FeedList items={lastFeed} />
        </Card>
      )}

      <Card title="커리어 기록">
        {c.history.length === 0 ? (
          <p className="text-sm text-zinc-400">아직 치른 시즌이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-xs text-zinc-400">
                <tr><th className="py-1 text-left">연도</th><th className="text-left">나이</th><th className="text-left">시리즈</th><th className="text-left">팀</th><th>순위</th><th>승</th><th>포디움</th><th>OVR</th></tr>
              </thead>
              <tbody>
                {[...c.history].reverse().map((h) => (
                  <tr key={h.year} className="border-t border-white/5">
                    <td className="py-1.5">{h.year}</td><td>{h.age}</td><td>{seriesLabel(h.series)}</td>
                    <td className="max-w-[10rem] truncate">{h.team ?? '—'}{h.seat === 'reserve' ? ' (리저브)' : ''}</td>
                    <td className="text-center">{h.position ? `${h.champion ? '🏆 ' : ''}P${h.position}` : '—'}</td>
                    <td className="text-center">{h.wins}</td><td className="text-center">{h.podiums}</td>
                    <td className="text-center">{h.ovrStart.toFixed(0)}→{h.ovrEnd.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="F1 세계">
        <div className="space-y-1 text-sm text-zinc-300">
          <div>F1 팀 {c.world.teams.teams.length}개{c.world.teams.pending.length ? ` · 준비 중 ${c.world.teams.pending.length}개` : ''}</div>
          {lastChamp && <div>최근 월드 챔피언: <b>{lastChamp.year} {lastChamp.driverId === 'player' ? d.name : lastChamp.name}</b></div>}
          {c.world.news.slice(-3).reverse().map((n, i) => <div key={i} className="text-zinc-400">· {n.text}</div>)}
          {series !== 'f1' && <div className="text-xs text-zinc-500">F1 라이브 레이스 화면은 다음 업데이트에서 붙습니다. 지금은 시즌 단위로 진행합니다.</div>}
        </div>
      </Card>
    </div>
  );
}
