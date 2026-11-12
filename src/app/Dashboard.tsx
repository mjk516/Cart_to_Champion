// 대시보드(SPEC §10 화면 3): 현재 팀·능력치·XP·계약·자금·언론 지표, 훈련 계획, 시즌 진행, 커리어 기록

import { useEffect, useMemo, useState } from 'react';
import {
  circuitById, coachAdvice, enduranceOdds, enduranceOffer, followsCoach, inMilitary, seasonChatter, isF1RaceSeason, managerOf, MANAGER_STYLE_LABEL, ovr, PERSONALITIES, recommendedPlan, seriesLabel, STAT_KEYS, superLicencePoints, TRAINING, TRAINING_SLOTS,
  TRAINING_SLOTS_RESERVE, xpNeeded, type TrainingId,
} from '../engine';
import { formatMoney, nameAside } from './format';
import { FeedList, RollingComments } from './FeedList';
import { useGame } from './store';
import { F1TeamBadge } from './TeamBadge';
import { HelmetView } from './Helmet';
import { Tip } from './Guide';
import { Bar, Button, Card, Pill, SEAT_LABELS, STAT_LABELS, TEMPERAMENT_LABELS, useConfirm } from './ui';

const MODES = [
  { id: 'weakness', label: '약점 보완' },
  { id: 'strength', label: '강점 극대화' },
  { id: 'balanced', label: '균형' },
] as const;

/** 훈련 한 칸이 올리는 능력치(▲ 하나가 경험치 50쯤). 멘탈·휴식은 능력치 대신 다른 효과 */
function TrainingEffect({ id }: { id: TrainingId }) {
  const p = TRAINING[id];
  const ups = STAT_KEYS.filter((k) => (p.xp[k] ?? 0) > 0).sort((a, b) => (p.xp[b] ?? 0) - (p.xp[a] ?? 0));
  return (
    <span className="flex flex-wrap gap-1 text-[11px]">
      {ups.map((k) => (
        <span key={k} className="rounded-full bg-emerald-400/10 px-1.5 py-0.5 font-bold text-emerald-300">{STAT_LABELS[k]} {'▲'.repeat(Math.max(1, Math.round((p.xp[k] ?? 0) / 50)))}</span>
      ))}
      {p.pressureRelief && <span className="rounded-full bg-sky-400/10 px-1.5 py-0.5 font-bold text-sky-300">압박 −{p.pressureRelief}</span>}
      {p.fatigue < 0 && <span className="rounded-full bg-sky-400/10 px-1.5 py-0.5 font-bold text-sky-300">컨디션 회복</span>}
    </span>
  );
}

export function Dashboard() {
  const { career: c, showKrw, playSeason, live, startLive, finishLive, retire, go, planDraft, setPlanDraft } = useGame();
  const [running, setRunning] = useState(false);
  const confirmBox = useConfirm();
  const slots = c?.contract?.seat === 'race' || !c?.contract ? TRAINING_SLOTS : TRAINING_SLOTS_RESERVE;
  // 짜던 훈련 계획은 저장해 두었다가 다시 열면 그대로 보여 준다(같은 시즌일 때만)
  const draftFor = (year: number | undefined) => (planDraft && planDraft.year === year && planDraft.plan.length >= slots ? planDraft : null);
  const [plan, setPlanState] = useState<TrainingId[]>(() => draftFor(c?.year)?.plan ?? (c ? recommendedPlan(c.driver.stats, 'weakness', slots, c.driver.focus) : []));
  const [endurance, setEnduranceState] = useState(() => draftFor(c?.year)?.endurance ?? false);
  useEffect(() => {
    const d = draftFor(c?.year);
    if (c) setPlanState(d?.plan ?? recommendedPlan(c.driver.stats, 'weakness', slots, c.driver.focus));
    setEnduranceState(d?.endurance ?? false);
    setRunning(false);
  }, [c?.year, slots]); // eslint-disable-line react-hooks/exhaustive-deps
  const setPlan = (p: TrainingId[]) => { setPlanState(p); if (c) setPlanDraft({ year: c.year, plan: p, endurance }); };
  const setEndurance = (v: boolean) => { setEnduranceState(v); if (c) setPlanDraft({ year: c.year, plan, endurance: v }); };
  const planCost = useMemo(() => plan.reduce((a, id) => a + TRAINING[id].cost, 0), [plan]);
  if (!c || c.retired) return null;

  const d = c.driver;
  const pdef = PERSONALITIES[d.personality];
  const temper = TEMPERAMENT_LABELS[pdef.temperament]!;
  const contract = c.contract;
  const series = contract?.series ?? c.history[c.history.length - 1]?.series ?? 'kart';
  const sl = superLicencePoints(c);
  const lastChamp = c.world.champions[c.world.champions.length - 1];
  const lastRec = c.history[c.history.length - 1];
  const lastFeed = lastRec?.feed ?? [];
  const recentEvents = (c.eventLog ?? []).filter((e) => e.year === c.year - 1);

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      {confirmBox.dialog}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-zinc-400">{c.year} 시즌 · {c.age}세</div>
          <h1 className="flex items-center gap-2 text-2xl font-black">{d.helmet && <HelmetView helmet={d.helmet} size={44} />}{d.name}{d.number && <span className="text-base font-black text-zinc-400">#{d.number}</span>}</h1>
          {nameAside(d) && <div className="text-xs text-zinc-400" aria-label="본명·별명">{nameAside(d)}</div>}
          <div className="mt-1 flex flex-wrap gap-2">
            <Pill>{pdef.label}</Pill>
            <Pill tone={temper.tone}>{temper.label}</Pill>
            {c.academy && <Pill tone="blue">{c.academy}</Pill>}
            <Pill tone="blue">매니저 {managerOf(c).name} · {MANAGER_STYLE_LABEL[managerOf(c).style]}</Pill>
            {c.management && <Pill tone="amber">매니지먼트 후원(F1 연봉 {Math.round(c.management.share * 100)}%)</Pill>}
          </div>
        </div>
        <div className="shrink-0 rounded-2xl border border-racing/30 bg-racing/10 px-3 py-2 text-right">
          <div className="text-[11px] font-bold tracking-widest text-red-200/80">OVR</div>
          <div className="text-3xl font-black leading-none text-racing sm:text-4xl">{ovr(d.stats).toFixed(1)}</div>
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
            <div className="space-y-2">
              <p className="text-sm text-zinc-300">{inMilitary(c) ? '군 복무 중입니다.' : '시트가 없습니다. 이번 시즌은 훈련만 합니다.'}</p>
              <Button variant="danger" size="sm" onClick={() => confirmBox.ask(<>지금 은퇴할까요? <b>되돌릴 수 없습니다.</b> 지금까지의 커리어가 은퇴 화면에 기록됩니다.</>, retire, { confirmLabel: '은퇴 선언', danger: true })}>은퇴 선언</Button>
            </div>
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
                <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
                  <span className="shrink-0 whitespace-nowrap">다음 상승</span><Bar value={d.xp[k]} max={need} color="bg-zinc-500" thin />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {inMilitary(c) && c.military && (
        <Card title="군 복무 중">
          <div className="space-y-2 text-sm">
            <p className="text-zinc-200">{c.military.start}~{c.military.end}시즌 동안 군 복무로 레이스를 쉽니다. 레이스 감각(속도·레이스크래프트·우천·타이어)은 시즌마다 조금씩 무뎌지고, 일관성은 조금 오르며 압박은 줄어듭니다.</p>
            <p className="text-xs text-zinc-400">{c.military.end}시즌을 마친 오프시즌부터 다시 팀들의 제안을 받을 수 있습니다.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button disabled={running} onClick={() => { setRunning(true); setTimeout(() => playSeason([]), 30); }}>{running ? '시즌 진행 중…' : `${c.year} 시즌 복무하기`}</Button>
              <Button variant="danger" size="sm" onClick={() => confirmBox.ask(<>지금 은퇴할까요? <b>되돌릴 수 없습니다.</b></>, retire, { confirmLabel: '은퇴 선언', danger: true })}>은퇴 선언</Button>
            </div>
          </div>
        </Card>
      )}
      {!inMilitary(c) && <>
      <Tip id="dashboard" title="여기가 커리어 본부입니다">
        <p>시즌을 시작하기 전에 <b>훈련 계획</b> 칸을 채우세요. 프로그램마다 오르는 능력치와 비용이 다르고, 휴식을 빼면 컨디션이 떨어집니다. 잘 모르겠으면 "약점 보완"을 누르면 추천 계획이 채워집니다.</p>
        <p>준비가 되면 아래의 시즌 진행 버튼을 누르세요. 시즌이 끝나면 오프시즌으로 넘어가 다음 팀을 고릅니다.</p>
      </Tip>
      <Card title={`훈련 계획 (${plan.length}칸)`} right={
        <div className="flex gap-1">
          {MODES.map((m) => (
            <button key={m.id} onClick={() => setPlan(recommendedPlan(d.stats, m.id, slots, d.focus))} className="rounded-lg border border-white/15 px-2 py-1 text-xs hover:bg-white/5">{m.label}</button>
          ))}
        </div>
      }>
        {(() => {
          const adv = coachAdvice(c);
          const following = followsCoach(c, plan);
          const locked = !!live && live.year === c.year;
          const person = (role: string, p: { name: string; skill: number }, lines: string[]) => (
            <div className="flex gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-sm font-black text-emerald-200" aria-hidden>{p.name.slice(0, 1)}</div>
              <div className="min-w-0">
                <div className="text-xs text-zinc-400"><b className="text-zinc-200">{role} {p.name}</b> · 실력 {'★'.repeat(p.skill)}{'☆'.repeat(5 - p.skill)}</div>
                {lines.map((l, i) => <p key={i} className="mt-0.5 text-sm text-zinc-100">“{l}”</p>)}
              </div>
            </div>
          );
          return (
            <div aria-label="코치 조언" className={`mb-3 rounded-xl border p-3 ${following ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-white/10 bg-white/5'}`}>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <span className="font-bold text-zinc-200">코치진</span><span>{adv.staff.source}</span>
                {following ? <Pill tone="green">조언대로 짠 계획</Pill> : <Pill tone="zinc">조언과 다른 계획</Pill>}
              </div>
              <div className="space-y-2">
                {person('드라이빙 코치', adv.staff.coach, adv.coachLines)}
                {person('피지컬 트레이너', adv.staff.trainer, adv.trainerLines)}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <span>조언대로 하면 손해 보지 않습니다: 과훈련·압박 실수·자금 부족으로 인한 훈련 축소가 없고, 훈련 효과 +{Math.round((adv.bonus - 1) * 100)}%.</span>
                {!following && !locked && <Button size="sm" className="ml-auto" onClick={() => setPlan([...adv.plan])}>코치 조언대로 짜기</Button>}
              </div>
            </div>
          );
        })()}
        <div className="grid gap-2 sm:grid-cols-3">
          {plan.map((id, i) => (
            <div key={i} className="flex flex-col gap-1">
              <select aria-label={`훈련 ${i + 1}칸`} value={id} onChange={(e) => setPlan(plan.map((x, j) => (j === i ? (e.target.value as TrainingId) : x)))}
                className="rounded-xl border border-white/15 bg-zinc-950 px-2 py-2 text-sm">
                {(Object.keys(TRAINING) as TrainingId[]).map((t) => (
                  <option key={t} value={t}>{TRAINING[t].label}{TRAINING[t].cost ? ` · ${formatMoney(TRAINING[t].cost, false)}` : ''}</option>
                ))}
              </select>
              <TrainingEffect id={id} />
            </div>
          ))}
        </div>
        <details className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
          <summary className="cursor-pointer font-bold text-zinc-200">훈련 프로그램별로 오르는 능력치</summary>
          <ul className="mt-2 space-y-2">
            {(Object.keys(TRAINING) as TrainingId[]).map((t) => (
              <li key={t}>
                <div className="flex flex-wrap items-center gap-2"><b>{TRAINING[t].label}</b><TrainingEffect id={t} />{TRAINING[t].cost ? <span className="text-xs text-zinc-500">{formatMoney(TRAINING[t].cost, showKrw)}/칸</span> : <span className="text-xs text-zinc-500">무료</span>}</div>
                <p className="text-xs leading-relaxed text-zinc-400">{TRAINING[t].desc}</p>
              </li>
            ))}
          </ul>
        </details>
        {(() => {
          const offer = enduranceOffer(c);
          if (!offer) return null;
          const locked = !!live && live.year === c.year;
          const on = locked ? !!live.endurance : endurance;
          return (
            <label className={`mt-3 flex items-start gap-3 rounded-xl border p-3 text-sm ${on ? 'border-amber-400/50 bg-amber-400/10' : 'border-white/10 bg-white/5'}`}>
              <input type="checkbox" className="mt-1 h-4 w-4 accent-amber-400" checked={on} disabled={locked} onChange={(e) => setEndurance(e.target.checked)} aria-label="내구레이스 출전" />
              <span>
                <b>🏁 {offer.when} · {offer.name} 출전</b>
                <span className="mt-0.5 block text-xs leading-relaxed text-zinc-400">
                  이 팀에서 {offer.teamSeasons}시즌을 보내며 팀메이트를 앞섰고, 입지가 단단해져서 팀이 그랑프리 사이 내구레이스 출전을 허락했습니다.
                  지금 실력이면 포디움 약 {Math.round((1 - enduranceOdds(ovr(d.stats)).dnf) * enduranceOdds(ovr(d.stats)).podium * 100)}%. 포디움에 오르면 능력치가 실제로 오릅니다(우승: 레이스크래프트 +2·우천·일관성·타이어 +1, 2·3위: 일관성·타이어 +1 등). 포디움 밖이면 능력치는 그대로, 사고 10%(압박 +, 방출 위험 +). {offer.hours}시간 · {offer.cls} 클래스 {offer.classCars}대. 시즌을 라이브로 진행하면 하이라이트 중계로 출발·{offer.hours >= 20 ? '야간' : '해 질 녘'}·마지막 스틴트 전략을 직접 고릅니다(공격하면 포디움 확률↑, 사고 위험↑).
                  {locked ? ' 시즌이 시작되어 바꿀 수 없습니다.' : ''}
                </span>
              </span>
            </label>
          );
        })()}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-zinc-400">훈련 비용 {formatMoney(planCost, showKrw)}</span>
          {!plan.includes('rest') && <Pill tone="amber">휴식이 없으면 컨디션이 떨어지고 부상 위험이 커진다</Pill>}
          {isF1RaceSeason(c) ? (
            <div className="ml-auto flex flex-wrap gap-2">
              {live && live.year === c.year ? (
                <Button onClick={() => go('weekend')}>진행 중인 시즌 이어하기 (라운드 {live.round + 1})</Button>
              ) : (
                <Button onClick={() => startLive(plan, endurance)}>{c.year} 시즌 라이브로 시작</Button>
              )}
              {/* 라이브 시즌을 진행하던 중이면 지금까지의 무전 선택을 살려 남은 라운드를 마저 진행한다 */}
              <Button variant="ghost" disabled={running} onClick={() => {
                const inLive = live && live.year === c.year;
                setRunning(true);
                setTimeout(() => (inLive ? finishLive() : playSeason(plan, endurance)), 30);
              }}>
                {running ? '시즌 진행 중…' : live && live.year === c.year ? '남은 시즌 한 번에 진행' : '한 번에 진행'}
              </Button>
            </div>
          ) : (
            <Button className="ml-auto" disabled={running} onClick={() => { setRunning(true); setTimeout(() => playSeason(plan, endurance), 30); }}>
              {running ? '시즌 진행 중…' : `${c.year} 시즌 진행`}
            </Button>
          )}
        </div>
      </Card>
      </>}

      {(lastFeed.length > 0 || recentEvents.length > 0) && (
        <Card title="최근 소식">
          {recentEvents.map((e) => (
            <div key={`${e.year}-${e.id}`} className="mb-2 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
              <div className="text-xs text-zinc-400">{e.year} 겨울 · {e.title} · {e.option}</div>
              <p className="mt-1">{e.text}</p>
            </div>
          ))}
          <FeedList items={lastFeed} />
          {lastRec && <RollingComments comments={seasonChatter(c, lastRec)} />}
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
                    <td className="max-w-[10rem] truncate">{h.military ? '🎖 군 복무' : h.team ?? '—'}{h.seat === 'reserve' ? ' (리저브)' : ''}</td>
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
          {(() => {
            const last = c.world.calendarLog?.[c.world.calendarLog.length - 1];
            return last && <div>최근 캘린더 변화: <b>{last.season} {circuitById(last.in).name} 복귀</b> · {circuitById(last.out).name} 제외</div>;
          })()}
          {[...new Set(c.world.news.filter((n) => n.kind !== 'calendar').map((n) => n.text))].slice(-3).reverse().map((t) => <div key={t} className="text-zinc-400">· {t}</div>)}
          {series !== 'f1' && <div className="text-xs text-zinc-500">하부 리그는 시즌 단위로 진행합니다. F1 레이스 시트에 오르면 그랑프리마다 라이브로 진행할 수 있습니다.</div>}
        </div>
      </Card>
    </div>
  );
}
