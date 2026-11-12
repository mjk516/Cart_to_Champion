// 내구레이스 하이라이트 중계(SPEC v0.42): 출발·밤·마지막 세 구간을 빠르게 보여 주고, 구간마다 한 번 고른다.

import { useEffect, useMemo, useState } from 'react';
import {
  ENDURANCE_DEFAULT, ENDURANCE_STAGES, enduranceArticle, enduranceLine, enduranceResult, enduranceRun,
  type Career, type EnduranceChoices, type EnduranceOffer,
} from '../engine';
import { Button, Pill } from './ui';

const KIND_ICON: Record<string, string> = { info: '•', swap: '🔄', incident: '⚠️', rain: '🌧️', finish: '🏁', dnf: '❌' };
const BEAT_MS = 900;

export function EnduranceBroadcast({ c, offer, choices, done, onChoose, onDone }: {
  c: Career; offer: EnduranceOffer; choices: EnduranceChoices; done: boolean;
  onChoose: (next: EnduranceChoices) => void; onDone: () => void;
}) {
  const chosen = ENDURANCE_STAGES.filter((s) => choices[s.id]).length;
  const run = useMemo(() => enduranceRun(c, choices), [c, choices]);
  const visible = useMemo(() => (run ? run.beats.filter((b) => b.stage <= chosen) : []), [run, chosen]);
  const [shown, setShown] = useState(visible.length);
  const [watching, setWatching] = useState(chosen > 0);
  useEffect(() => {
    if (shown >= visible.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), BEAT_MS);
    return () => clearTimeout(t);
  }, [shown, visible.length]);
  if (!run) return null;

  // 결과로 바로 갔거나 다 본 뒤
  if (done) {
    const out = enduranceResult(c, choices);
    const art = chosen ? enduranceArticle(c, run) : null;
    return (
      <div className="space-y-2">
        <div className="text-zinc-300">{out?.text}</div>
        {out && <div className="font-bold text-amber-200">{enduranceLine(out)}</div>}
        {art && (
          <article aria-label="내구레이스 기사" className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="text-[11px] text-zinc-500">{art.outlet}</div>
            <h3 className="mt-0.5 font-black">{art.headline}</h3>
            <div className="mt-1 space-y-1 text-xs leading-relaxed text-zinc-300">{art.body.map((p) => <p key={p}>{p}</p>)}</div>
          </article>
        )}
        <div className="text-xs text-zinc-500">능력치·팬·압박 변화는 시즌을 마칠 때 반영됩니다.</div>
      </div>
    );
  }

  if (!watching) {
    return (
      <div className="space-y-2">
        <div className="text-zinc-300">{offer.hours}시간 레이스 · {offer.cls} 클래스 {offer.classCars}대. 출발·{offer.hours >= 20 ? '밤' : '해 질 녘'}·마지막 스틴트마다 직접 고른다.</div>
        <div className="flex flex-wrap gap-2">
          <Button className="!px-3 !py-1.5 text-xs" onClick={() => setWatching(true)}>📺 하이라이트 중계 보기</Button>
          <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={onDone}>결과로 바로 가기</Button>
        </div>
      </div>
    );
  }

  const beats = visible.slice(0, shown);
  const last = beats[beats.length - 1];
  const animating = shown < visible.length;
  const ended = !animating && (last?.kind === 'finish' || last?.kind === 'dnf');
  const nextStage = !animating && !ended ? ENDURANCE_STAGES[chosen] : undefined;
  const pos = [...beats].reverse().find((b) => b.pos !== null)?.pos ?? run.grid;
  const hour = last?.hour ?? 0;
  const pts = beats.filter((b) => b.pos !== null);

  return (
    <div className="space-y-3" aria-label="내구레이스 중계">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-[11px] text-zinc-400">#{run.carNumber} · {offer.cls} · {c.driver.name} / {run.crew[0]} / {run.crew[1]}</div>
          <div className="text-2xl font-black" aria-label="클래스 순위">{last?.kind === 'dnf' ? 'OUT' : `P${pos}`}<span className="text-sm font-normal text-zinc-400"> / {offer.classCars}</span></div>
        </div>
        <div className="text-right text-xs text-zinc-400">{hour}시간 / {offer.hours}시간{run.rain && beats.some((b) => b.kind === 'rain') ? ' · 🌧️' : ''}</div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-amber-400 transition-all" style={{ width: `${(hour / offer.hours) * 100}%` }} /></div>
      {pts.length > 1 && (
        <svg viewBox="0 0 100 30" className="h-12 w-full" aria-hidden preserveAspectRatio="none">
          <polyline fill="none" stroke="#fbbf24" strokeWidth="1.5" vectorEffect="non-scaling-stroke"
            points={pts.map((b) => `${(b.hour / offer.hours) * 100},${((b.pos! - 1) / Math.max(1, offer.classCars - 1)) * 28 + 1}`).join(' ')} />
          <line x1="0" x2="100" y1={(2.5 / Math.max(1, offer.classCars - 1)) * 28 + 1} y2={(2.5 / Math.max(1, offer.classCars - 1)) * 28 + 1} stroke="#ffffff22" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      <ol className="space-y-1.5 text-sm" aria-label="중계 기록">
        {beats.map((b, i) => (
          <li key={i} className={`flex gap-2 ${b.kind === 'dnf' ? 'text-red-300' : b.kind === 'finish' ? 'font-bold text-amber-200' : 'text-zinc-200'}`}>
            <span className="w-10 shrink-0 text-right font-mono text-[11px] text-zinc-500">{b.hour}h</span>
            <span className="shrink-0">{KIND_ICON[b.kind]}</span>
            <span className="leading-snug">{b.text}</span>
            {b.pos !== null && b.kind !== 'finish' && <span className="ml-auto shrink-0 font-mono text-xs text-zinc-400">P{b.pos}</span>}
          </li>
        ))}
      </ol>
      {nextStage && (
        <div className="rounded-lg border border-amber-400/40 bg-amber-400/5 p-3" role="group" aria-label={nextStage.title(offer.hours)}>
          <div className="text-xs text-amber-200">🎧 {nextStage.title(offer.hours)}</div>
          <div className="mt-0.5 font-bold">{nextStage.question}</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {nextStage.options.map((op) => (
              <button key={op.id} onClick={() => onChoose({ ...choices, [nextStage.id]: op.id })}
                className="rounded-lg border border-white/15 p-2 text-left hover:bg-white/5">
                <div className="text-sm font-bold">{op.label}</div>
                <div className="mt-0.5 text-xs text-zinc-400">{op.hint}</div>
              </button>
            ))}
          </div>
          <button className="mt-2 text-xs text-zinc-400 underline" onClick={() => { onChoose({ ...ENDURANCE_DEFAULT, ...choices }); onDone(); }}>남은 구간은 팀에 맡기고 결과 보기</button>
        </div>
      )}
      {animating && <div className="text-xs text-zinc-500">중계 중… <button className="underline" onClick={() => setShown(visible.length)}>빨리 보기</button></div>}
      {ended && (
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={run.outcome.position !== null && run.outcome.position <= 3 ? 'green' : run.outcome.position === null ? 'red' : 'zinc'}>{enduranceLine(run.outcome)}</Pill>
          <Button className="!px-3 !py-1.5 text-xs" onClick={onDone}>결과와 기사 보기</Button>
        </div>
      )}
    </div>
  );
}
