// 라이브 레이스(SPEC §5.5): 시뮬레이션 모드(타이밍 타워·사건 자막) ↔ 트랙 뷰(서킷 + 동그라미 차), 무전 선택
// 결과는 엔진이 시드로 미리 계산한다. 화면은 랩 기록을 재생할 뿐이다.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  forecastDecision, rngFor, runRace,
  type Classified, type Incident, type LapRecord, type RaceCar, type RaceInput, type RadioDecision, type RadioOptionId,
} from '../engine';
import { CIRCUIT_PATHS } from './circuitPaths';
import { Pill } from './ui';

const ME = 'player';
const TYRE_COLOR: Record<string, string> = { S: '#ef4444', M: '#facc15', H: '#e5e7eb', I: '#22c55e' };
const TRIGGERS = new Set(['sc_deploy', 'vsc_deploy', 'red_flag', 'rain_start']);
const MAX_TRACK_VIEWS = 8;
/** 사건이 없어도 트랙 뷰를 보여 주는 오프닝 랩 수 */
const OPENING_LAPS = 3;
/** start: 1랩(그리드에서 출발), finish: 마지막 랩(체커기), normal: 그 밖 */
type TrackMode = 'start' | 'normal' | 'finish';

interface Ctx { codeOf: (id: string) => string; colorOf: (id: string) => string }

const RADIO_LABEL: Record<string, string> = {
  pit_hard: '피트 인(하드)', pit_medium: '피트 인(미디엄)', stay_out: '스테이 아웃', pit: '피트 인',
  inters_now: '인터로 교체', one_more_lap: '한 랩 더', stay_slicks: '슬릭 유지', slicks_now: '슬릭으로 교체', stay_inters: '인터 유지',
};

function describe(inc: Incident, x: Ctx): string | null {
  switch (inc.type) {
    case 'overtake': return `${x.codeOf(inc.by)}, ${x.codeOf(inc.on)} 추월 → P${inc.position}`;
    case 'lead_change': return `선두 변경: ${x.codeOf(inc.leader)}`;
    case 'crash': return `${x.codeOf(inc.car)} 사고 리타이어`;
    case 'mech_dnf': return `${x.codeOf(inc.car)} 기계 결함 리타이어`;
    case 'debris': return '트랙 위 잔해';
    case 'sc_deploy': return '🟨 세이프티카 출동';
    case 'vsc_deploy': return '🟨 VSC';
    case 'red_flag': return '🟥 레드 플래그';
    case 'sc_end': return '세이프티카 복귀';
    case 'vsc_end': return 'VSC 종료';
    case 'restart': return '재출발';
    case 'rain_start': return '🌧 비 시작';
    case 'rain_stop': return '비 그침';
    case 'radio': return `📻 무전: ${RADIO_LABEL[inc.choice] ?? inc.choice}`;
    case 'pit': return inc.car === ME ? `내 피트스톱 → ${inc.compound}` : null;
  }
}

function isTrigger(inc: Incident): boolean {
  if (TRIGGERS.has(inc.type)) return true;
  if (inc.type === 'overtake') return inc.by === ME || inc.on === ME;
  if (inc.type === 'crash' || inc.type === 'mech_dnf') return inc.car === ME;
  return false;
}

/** 실제 레이아웃 데이터가 없을 때 쓰는 일반 레이아웃: 서킷 id로 모양을 고정한 닫힌 곡선(SPEC §5.5) */
function genericTrackPath(circuitId: string, W: number, H: number): string {
  const r = rngFor('track-shape', circuitId);
  const p1 = r() * 6.28, p2 = r() * 6.28, p3 = r() * 6.28;
  const a1 = 0.12 + r() * 0.1, a2 = 0.06 + r() * 0.08, a3 = 0.03 + r() * 0.05;
  const pts: string[] = [];
  const N = 120;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2;
    const k = 1 + a1 * Math.sin(2 * t + p1) + a2 * Math.sin(3 * t + p2) + a3 * Math.sin(5 * t + p3);
    pts.push(`${i ? 'L' : 'M'}${(W / 2 + W * 0.42 * k * Math.cos(t)).toFixed(1)},${(H / 2 + H * 0.38 * k * Math.sin(t)).toFixed(1)}`);
  }
  return pts.join(' ') + ' Z';
}

/** 깃발 상황별 트랙 색과 차 속도(1 = 그린 플래그 실제 속도) */
const TRACK_FLAG: Record<LapRecord['phase'], { track: string; dash: string; border: string; glow?: string; bannerBg: string; bannerFg: string; pace: number }> = {
  green: { track: '#3f3f46', dash: '#52525b', border: 'rgba(255,255,255,0.1)', bannerBg: 'rgba(0,0,0,0.7)', bannerFg: '#fafafa', pace: 1 },
  sc: { track: '#eab308', dash: '#713f12', border: '#eab308', glow: '#facc15', bannerBg: '#facc15', bannerFg: '#18181b', pace: 1 / 1.4 },
  vsc: { track: '#eab308', dash: '#713f12', border: '#eab308', glow: '#facc15', bannerBg: '#facc15', bannerFg: '#18181b', pace: 1 / 1.3 },
  red: { track: '#dc2626', dash: '#7f1d1d', border: '#dc2626', glow: '#ef4444', bannerBg: '#dc2626', bannerFg: '#ffffff', pace: 0.35 },
};

/** 트랙 뷰가 보여 주는 실제 레이스 시간(초) */
const TRACK_WINDOW_SEC = 6;
/** 트랙 뷰에서 선두가 출발하는 위치(랩 비율) */
const LEADER_START = 0.25;

function TrackView({ circuitId, realLayout, prev, cur, baseLap, banner, focus, mode = 'normal', x, speed, onSpeed, onEnd }: {
  circuitId: string; realLayout: boolean; prev: LapRecord | null; cur: LapRecord; baseLap: number; banner: string; focus: string[]; mode?: TrackMode; x: Ctx;
  /** 재생 배속. ×1이면 차가 실제 레이스 속도로 움직인다 */
  speed: number;
  onSpeed: (s: number) => void;
  onEnd: () => void;
}) {
  const W = 640, H = 300;
  const pathRef = useRef<SVGPathElement>(null);
  // 휴대폰처럼 좁은 화면에서는 SVG가 줄어들어 차가 점처럼 보이므로, 그린 폭에 맞춰 동그라미·글자를 키운다(최대 2.2배)
  const boxRef = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => { const w = e?.contentRect.width ?? W; setK(Math.min(2.2, Math.max(1, 520 / Math.max(1, w)))); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // 실제 레이아웃은 F1 그랑프리에서만 쓴다. 하부 리그는 같은 서킷이라도 일반 레이아웃
  const d = useMemo(() => (realLayout && CIRCUIT_PATHS[circuitId]) || genericTrackPath(circuitId, W, H), [circuitId, realLayout]);
  // 지금까지 보여 준 실제 레이스 시간(초). 프레임마다 배속만큼 늘어나서, 보는 중에 배속을 바꿔도 바로 반영된다
  const [raceSec, setRaceSec] = useState(0);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  useEffect(() => {
    let raf = 0;
    let end: ReturnType<typeof setTimeout> | undefined;
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      acc = Math.min(TRACK_WINDOW_SEC, acc + ((now - last) / 1000) * speedRef.current);
      last = now;
      setRaceSec(acc);
      if (acc < TRACK_WINDOW_SEC) raf = requestAnimationFrame(tick);
      else end = setTimeout(onEnd, 900);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); if (end) clearTimeout(end); };
  }, [cur.lap]); // eslint-disable-line react-hooks/exhaustive-deps
  const tau = raceSec / TRACK_WINDOW_SEC;
  // 깃발 상황: SC·VSC는 노란색, 레드 플래그는 빨간색 트랙. 차도 그만큼 느려진다(레드 플래그는 천천히 피트로 돌아가는 속도)
  const flag = TRACK_FLAG[cur.phase];
  // 1랩은 출발선에서, 마지막 랩은 장면이 끝날 때 선두가 결승선을 막 지나도록 시작 위치를 정한다
  const windowLaps = (TRACK_WINDOW_SEC * flag.pace) / baseLap;
  const leaderStart = mode === 'start' ? 0 : mode === 'finish' ? 1 - windowLaps * 0.8 : LEADER_START;
  const prevGap = new Map((prev?.order ?? []).map((e) => [e.id, e.gap]));
  const L = pathRef.current?.getTotalLength() ?? 0;
  const finishLine = pathRef.current && L ? pathRef.current.getPointAtLength(0) : null;
  const pos = (id: string, gap: number) => {
    if (!pathRef.current || !L) return null;
    const g = (prevGap.get(id) ?? gap) * (1 - tau) + gap * tau;
    // 선두는 랩의 1/4 지점에서 출발해 실제 속도로 TRACK_WINDOW_SEC초만큼 달린다(예전에는 3초에 한 바퀴를 돌아 너무 빨랐다)
    const p = (((leaderStart + (raceSec * flag.pace) / baseLap - g / baseLap) % 1) + 1) % 1;
    return pathRef.current.getPointAtLength(p * L);
  };
  return (
    <div ref={boxRef} className="relative rounded-xl border bg-zinc-950 p-2 transition-colors duration-500" style={{ borderColor: flag.border }} data-flag={cur.phase}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`트랙 뷰: ${banner}`}>
        {flag.glow && <path d={d} fill="none" stroke={flag.glow} strokeOpacity={0.35} strokeWidth={30 * Math.min(k, 1.6)} strokeLinejoin="round" />}
        <path d={d} fill="none" stroke={flag.track} strokeWidth={18 * Math.min(k, 1.6)} strokeLinejoin="round" style={{ transition: 'stroke 400ms' }} />
        <path ref={pathRef} d={d} fill="none" stroke={flag.dash} strokeWidth={2} strokeDasharray="6 8" />
        {/* 출발·결승선(체커 무늬) */}
        {finishLine && (
          <g transform={`translate(${finishLine.x} ${finishLine.y})`}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <rect key={i} x={-6 + (i % 2) * 6} y={-9 + Math.floor(i / 2) * 6} width={6} height={6} fill={(i + Math.floor(i / 2)) % 2 ? '#18181b' : '#fafafa'} />
            ))}
          </g>
        )}
        {[...cur.order].reverse().map((e) => {
          const pt = pos(e.id, e.gap);
          if (!pt) return null;
          const mine = e.id === ME;
          return (
            <g key={e.id}>
              <circle cx={pt.x} cy={pt.y} r={(mine ? 9 : 7) * k} fill={x.colorOf(e.id)} stroke={mine ? '#ffffff' : '#18181b'} strokeWidth={(mine ? 3 : 2) * k} />
              {(mine || focus.includes(e.id)) && <text x={pt.x} y={pt.y - 13 * k} textAnchor="middle" fontSize={12 * k} fontWeight={700} fill="#fafafa">{x.codeOf(e.id)}</text>}
            </g>
          );
        })}
      </svg>
      <div className="absolute left-3 top-3 rounded-lg px-3 py-1 text-sm font-black" style={{ background: flag.bannerBg, color: flag.bannerFg }}>{banner}</div>
      <button onClick={onEnd} className="absolute right-3 top-3 rounded-lg bg-black/70 px-3 py-1 text-xs text-zinc-200 hover:bg-black">계속 ▶</button>
      <div className="absolute bottom-3 right-3 flex gap-1" role="group" aria-label="트랙 뷰 배속">
        {[1, 2, 4].map((s2) => (
          <button key={s2} onClick={() => onSpeed(s2)} aria-pressed={speed === s2}
            className={`rounded-lg px-2 py-1 text-xs font-bold ${speed === s2 ? 'bg-racing text-white' : 'bg-black/70 text-zinc-300 hover:bg-black'}`}>×{s2}</button>
        ))}
      </div>
    </div>
  );
}

function RadioModal({ input, decision, onPick }: { input: RaceInput; decision: RadioDecision; onPick: (o: RadioOptionId) => void }) {
  const [forecasts, setForecasts] = useState<Record<string, string>>({});
  useEffect(() => {
    const id = setTimeout(() => {
      const out: Record<string, string> = {};
      for (const o of decision.options) {
        const f = forecastDecision({ ...input, autoRadio: true }, decision, o.id, 40);
        out[o.id] = Number.isFinite(f.p50) ? `예상 P${f.p10}~P${f.p90} (중앙 P${f.p50})` : '예상하기 어려움';
      }
      setForecasts(out);
    }, 30);
    return () => clearTimeout(id);
  }, [decision.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const title = { sc: '세이프티카 출동!', vsc: 'VSC 발령!', rain_start: '비가 오기 시작했다.', rain_stop: '트랙이 마르고 있다.' }[decision.trigger];
  return (
    <div className="rounded-xl border border-racing/60 bg-racing/10 p-4" role="dialog" aria-label="엔지니어 무전">
      <div className="text-xs text-zinc-300">📻 L{decision.lap} 엔지니어 무전</div>
      <div className="mt-1 text-lg font-black">{title} 어떻게 할까?</div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {decision.options.map((o) => (
          <button key={o.id} onClick={() => onPick(o.id)} className={`rounded-xl border p-3 text-left hover:bg-white/5 ${o.recommended ? 'border-emerald-400/60' : 'border-white/15'}`}>
            <div className="font-bold">{o.label}{o.recommended && <span className="ml-1 text-xs text-emerald-300">★ 엔지니어 추천</span>}</div>
            <div className="mt-1 text-xs text-zinc-400">{forecasts[o.id] ?? '계산 중…'}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function LiveRace({ input, realLayout = false, cars, colorOfTeam, instant, onRadio, onDone }: {
  input: RaceInput;
  /** true면 실제 서킷 모양(F1 그랑프리 전용) */
  realLayout?: boolean;
  cars: RaceCar[];
  colorOfTeam: (teamId: string) => string;
  instant: boolean;
  onRadio: (decisionId: string, option: RadioOptionId) => void;
  onDone: (classification: Classified[]) => void;
}) {
  const outcome = useMemo(() => runRace(instant ? { ...input, autoRadio: true } : input), [input, instant]);
  const laps = outcome.laps;
  const [lap, setLap] = useState(instant ? Number.MAX_SAFE_INTEGER : 0);
  const [playing, setPlaying] = useState(!instant);
  const [speed, setSpeed] = useState(1);
  const [track, setTrack] = useState<{ lap: number; banner: string; focus: string[]; mode: TrackMode } | null>(null);
  const shown = useRef(new Set<number>());
  const done = useRef(false);
  const byId = useMemo(() => new Map(cars.map((c) => [c.id, c])), [cars]);
  const x: Ctx = { codeOf: (id) => byId.get(id)?.code ?? id, colorOf: (id) => colorOfTeam(byId.get(id)?.teamId ?? '') };
  const cur = Math.min(lap, laps.length);

  // 재생: 1랩 0.4초(속도 배수). 트랙 뷰·무전 중에는 멈춘다
  useEffect(() => {
    if (!playing || track || cur >= laps.length) return;
    const id = setTimeout(() => {
      const next = cur + 1;
      setLap(next);
      const rec = laps[next - 1];
      if (!rec) return;
      const trig = outcome.incidents.filter((i) => i.lap === rec.lap && isTrigger(i));
      const lapIncidents = outcome.incidents.filter((i) => i.lap === rec.lap);
      const focusOf = (list: Incident[]) => list.flatMap((i) => (i.type === 'overtake' ? [i.by, i.on] : 'car' in i ? [i.car] : []));
      // 마지막 랩: 체커기를 받으며 결승선을 통과하는 장면(항상)
      if (next === laps.length && outcome.status === 'finished') {
        const winner = outcome.classification[0]!;
        setTrack({ lap: rec.lap, banner: `🏁 체커기 · ${x.codeOf(winner.id)} 우승`, focus: [winner.id, ME], mode: 'finish' });
        return;
      }
      if (shown.current.has(rec.lap)) return;
      // 1~3랩: 추월이 가장 많은 오프닝 랩은 사건이 없어도 보여 준다(트랙 뷰 횟수 제한과 별개)
      if (rec.lap <= OPENING_LAPS) {
        shown.current.add(rec.lap);
        const passes = lapIncidents.filter((i) => i.type === 'overtake').length;
        const lead = trig[0] ? describe(trig[0], x) : null;
        const banner = `L${rec.lap} · ${lead ?? (rec.lap === 1 ? '스타트' : '오프닝 랩 배틀')}${passes > 1 ? ` · 추월 ${passes}번` : ''}`;
        setTrack({ lap: rec.lap, banner, focus: focusOf(lapIncidents), mode: rec.lap === 1 ? 'start' : 'normal' });
        return;
      }
      if (trig.length && shown.current.size - OPENING_LAPS < MAX_TRACK_VIEWS) {
        shown.current.add(rec.lap);
        setTrack({ lap: rec.lap, banner: `L${rec.lap} · ${describe(trig[0]!, x) ?? ''}`, focus: focusOf(trig), mode: 'normal' });
      }
    }, 400 / speed);
    return () => clearTimeout(id);
  }, [playing, track, cur, laps, speed]); // eslint-disable-line react-hooks/exhaustive-deps

  const finished = outcome.status === 'finished' && cur >= laps.length;
  useEffect(() => {
    if (finished && !done.current && outcome.status === 'finished') {
      done.current = true;
      onDone(outcome.classification);
    }
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  const rec = cur > 0 ? laps[cur - 1] : null;
  const order = rec ? rec.order : input.grid.map((id) => ({ id, gap: 0, compound: 'M' as const, stops: 0 }));
  const ticker = outcome.incidents
    .filter((i) => i.lap <= (rec?.lap ?? 0))
    .map((i) => ({ lap: i.lap, text: describe(i, x) }))
    .filter((t) => t.text)
    .slice(-6)
    .reverse();
  const phase = rec?.phase ?? 'green';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="zinc">L{rec?.lap ?? 0} / {outcome.totalLaps}</Pill>
        {phase !== 'green' && <Pill tone={phase === 'red' ? 'red' : 'amber'}>{phase === 'sc' ? '세이프티카' : phase === 'vsc' ? 'VSC' : '레드 플래그'}</Pill>}
        {rec?.wet && <Pill tone="blue">비</Pill>}
        {!finished && (
          <div className="ml-auto flex gap-1">
            <button onClick={() => setPlaying((p) => !p)} className="rounded-lg border border-white/15 px-2 py-1 text-xs">{playing ? '⏸ 일시정지' : '▶ 재생'}</button>
            {[1, 2, 4].map((s) => (
              <button key={s} onClick={() => setSpeed(s)} className={`rounded-lg border px-2 py-1 text-xs ${speed === s ? 'border-racing text-white' : 'border-white/15 text-zinc-400'}`}>×{s}</button>
            ))}
            <button onClick={() => { setTrack(null); setLap(laps.length); }} className="rounded-lg border border-white/15 px-2 py-1 text-xs">다음 결정·결과까지</button>
          </div>
        )}
      </div>

      {track && rec && (
        <TrackView circuitId={input.circuit.id} realLayout={realLayout} prev={laps[cur - 2] ?? null} cur={rec} baseLap={input.circuit.baseLap} banner={track.banner} focus={track.focus} mode={track.mode} x={x} speed={speed} onSpeed={setSpeed} onEnd={() => setTrack(null)} />
      )}

      {outcome.status === 'pending' && cur >= laps.length && !track && (
        <RadioModal input={input} decision={outcome.decision} onPick={(o) => { onRadio(outcome.decision.id, o); setPlaying(true); }} />
      )}

      <div className="grid gap-3 md:grid-cols-[1fr_16rem]">
        <ol className="max-h-[28rem] overflow-y-auto rounded-xl border border-white/10 bg-zinc-950/60 text-sm" aria-label="타이밍 타워">
          {order.map((e, i) => (
            <li key={e.id} className={`flex items-center gap-2 border-b border-white/5 px-2 py-1 ${e.id === ME ? 'bg-racing/20 font-bold' : ''}`}>
              <span className="w-6 text-right text-zinc-400">{i + 1}</span>
              <span className="h-4 w-1 rounded" style={{ background: x.colorOf(e.id) }} />
              <span className="w-12">{x.codeOf(e.id)}</span>
              <span className="flex-1 text-right tabular-nums text-zinc-300">{i === 0 ? '선두' : `+${e.gap.toFixed(1)}`}</span>
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black text-zinc-900" style={{ background: TYRE_COLOR[e.compound] }}>{e.compound}</span>
              <span className="w-10 text-right text-xs text-zinc-500">{e.stops}스톱</span>
            </li>
          ))}
        </ol>
        <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-2 text-xs" aria-live="polite">
          <div className="mb-1 font-bold text-zinc-300">사건</div>
          {ticker.length === 0 && <div className="text-zinc-500">출발 대기</div>}
          {ticker.map((t, i) => <div key={i} className="py-0.5 text-zinc-300"><span className="text-zinc-500">L{t.lap}</span> {t.text}</div>)}
        </div>
      </div>

      {finished && outcome.status === 'finished' && (
        <div className="rounded-xl border border-white/10 bg-zinc-900 p-3">
          <div className="mb-2 font-bold">결과</div>
          <ol className="grid gap-1 text-sm sm:grid-cols-2">
            {outcome.classification.filter((r) => r.position <= 10 || r.id === ME).map((r) => (
              <li key={r.id} className={`flex gap-2 ${r.id === ME ? 'font-bold text-racing' : ''}`}>
                <span className="w-6 text-right">{r.position}</span>
                <span className="w-12">{x.codeOf(r.id)}</span>
                <span className="flex-1 text-zinc-400">{r.status === 'dnf' ? `DNF (${r.reason})` : r.position === 1 ? '우승' : `+${(r.gap ?? 0).toFixed(1)}s`}</span>
                <span>{r.points ? `${r.points}pt` : ''}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
