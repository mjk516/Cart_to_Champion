// 팀 전략 회의(SPEC v0.40): 레이스·스프린트 출발 전에 출발 타이어와 피트스톱 전략을 엔지니어와 함께 정한다.
// 팀 추천(실제 F1 데이터 기반) + 대안 + 성격 전략(공격형·본능형은 도박, 분석형·침착형은 데이터).

import { useState } from 'react';
import {
  circuitTyreData, raceForecast, strategyStyleOf, teamStrategies, tyreLife, TYRE_NAME,
  type Career, type Circuit, type Compound, type RaceStrategyChoice,
} from '../engine';
import { TYRE_COLOR } from './LiveRace';
import { Button, Pill } from './ui';

const STYLE_BADGE: Record<string, { label: string; tone: 'green' | 'blue' | 'amber' | 'zinc' }> = {
  team: { label: '팀 추천', tone: 'green' },
  alt: { label: '대안', tone: 'zinc' },
  gamble: { label: '도박', tone: 'amber' },
  data: { label: '데이터', tone: 'blue' },
};

export function StrategyMeeting({ c, circuit, kind, laps, seed, initial, onConfirm }: {
  c: Career; circuit: Circuit; kind: 'race' | 'sprint'; laps: number; seed: number;
  initial?: RaceStrategyChoice; onConfirm: (choice: RaceStrategyChoice) => void;
}) {
  const forecast = raceForecast(seed, circuit, laps);
  const options = teamStrategies(circuit, kind, laps, forecast, c.driver.personality);
  const [planId, setPlanId] = useState(initial?.plan ?? options[0]!.id);
  const plan = options.find((o) => o.id === planId) ?? options[0]!;
  const [tyre, setTyre] = useState<Compound | null>(initial?.tyre ?? null);
  const start = tyre ?? plan.start;
  const teamTyre = options[0]!.start;
  const realStart = kind === 'sprint' ? circuitTyreData(circuit.id).sprintStart : circuitTyreData(circuit.id).start;
  const style = strategyStyleOf(c.driver.personality);
  const tyres: Compound[] = ['S', 'M', 'H', 'I', 'W'];
  return (
    <section aria-label="팀 전략 회의" className="rounded-xl border border-sky-400/40 bg-sky-400/5 p-4">
      <div className="text-xs text-sky-200">🧠 {kind === 'sprint' ? '스프린트' : '레이스'} 전 팀 전략 회의 · {laps}랩</div>
      <p className="mt-1 text-sm text-zinc-100">
        <b>엔지니어:</b> “{forecast.text} {forecast.rain ? '' : `출발 타이어는 실제 F1에서 이 서킷에 가장 많이 쓴 ${TYRE_NAME[realStart]}를 추천해.`}
        {style === 'gamble' ? ' 네 스타일이면 남들과 다르게 가는 카드도 하나 준비했어.' : style === 'data' ? ' 수명 모델로 계산한 안도 하나 넣었어.' : ''}”
      </p>

      <div className="mt-3 text-xs font-bold text-zinc-300">출발 타이어</div>
      <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="출발 타이어">
        {tyres.map((t) => (
          <button key={t} onClick={() => setTyre(t === plan.start ? null : t)} aria-pressed={start === t}
            className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-sm ${start === t ? 'border-white bg-white/10 font-bold' : 'border-white/15 hover:bg-white/5'}`}>
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black text-zinc-900" style={{ background: TYRE_COLOR[t] }}>{t}</span>
            {TYRE_NAME[t]}
            {t === teamTyre && <span className="text-[10px] text-emerald-300">★팀</span>}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">
        {start === 'I' || start === 'W'
          ? forecast.wetStart ? '젖은 트랙 출발: 의무 피트스톱(두 컴파운드) 규칙이 없다.' : '맑은 날 젖은 타이어는 랩당 4~7초 느리다.'
          : `수명 약 ${tyreLife(start, circuit)}랩${forecast.wetStart ? ' · 젖은 트랙에서 슬릭은 랩당 7~12초 느리다' : ''}.`}
      </p>

      <div className="mt-3 text-xs font-bold text-zinc-300">{kind === 'sprint' || forecast.wetStart ? '전략' : '피트스톱 전략'}</div>
      <div className="mt-1 space-y-2" role="radiogroup" aria-label="피트스톱 전략">
        {options.map((o) => (
          <button key={o.id} role="radio" aria-checked={o.id === planId} onClick={() => { setPlanId(o.id); setTyre(null); }}
            className={`w-full rounded-xl border p-2.5 text-left ${o.id === planId ? 'border-sky-300 bg-sky-300/10' : 'border-white/15 hover:bg-white/5'}`}>
            <div className="flex flex-wrap items-center gap-1.5 text-sm font-bold">
              {o.label}
              <Pill tone={STYLE_BADGE[o.style]!.tone}>{o.recommended ? '★ ' : ''}{STYLE_BADGE[o.style]!.label}</Pill>
            </div>
            <div className="mt-0.5 text-xs leading-relaxed text-zinc-400">{o.desc}</div>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button onClick={() => onConfirm({ plan: plan.id, ...(tyre ? { tyre } : {}) })}>전략 확정하고 출발</Button>
        <span className="text-xs text-zinc-400">{TYRE_NAME[start]} 출발{plan.stops.length ? ` · 피트 L${plan.stops.join(', L')}` : ''}. 레이스 중 피트 창·세이프티카 때 무전으로 다시 정할 수 있다.</span>
      </div>
    </section>
  );
}
