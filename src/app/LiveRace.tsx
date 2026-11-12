// 라이브 레이스(SPEC §5.5 v0.30): 트랙 뷰(서킷 + 동그라미 차)가 첫 랩부터 체커기까지 계속 돌고,
// 그 아래에 무전·결과, 타이밍 타워·사건 자막이 붙는다.
// 결과는 엔진이 시드로 미리 계산한다. 화면은 랩 기록을 재생할 뿐이다.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  raceChat, rngFor, runRace, type Chat, type RaceChatKey,
  type Classified, type Incident, type LapRecord, type Neutralization, type RaceCar, type RaceInput, type RadioDecision, type RadioOptionId,
} from '../engine';
import { CIRCUIT_PATHS } from './circuitPaths';
import { ChatLine } from './FeedList';
import { Pill } from './ui';

const ME = 'player';
const TYRE_COLOR: Record<string, string> = { S: '#ef4444', M: '#facc15', H: '#e5e7eb', I: '#22c55e' };
/** 재생 배속. ×1이면 실제 레이스 속도(한 랩이 실제 랩타임만큼 걸린다). ×1은 너무 느려 빼고 ×60을 둔다 */
const SPEEDS = [5, 10, 30, 60] as const;
const DEFAULT_SPEED = 10;

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
    case 'sc_deploy': return `🟨 세이프티카 출동${inc.info ? ` · ${SEVERITY_LABEL[inc.info.severity]} · 예상 ${inc.info.expectedLaps}랩` : ''}`;
    case 'vsc_deploy': return `🟨 VSC${inc.info ? ` · ${SEVERITY_LABEL[inc.info.severity]} · 예상 ${inc.info.expectedLaps}랩` : ''}`;
    case 'red_flag': return '🟥 레드 플래그';
    case 'sc_end': return `세이프티카 복귀${vsText(inc.vsExpected)}`;
    case 'vsc_end': return `VSC 종료${vsText(inc.vsExpected)}`;
    case 'neutral_update': return inc.delta > 0 ? `${inc.phase === 'sc' ? '세이프티카' : 'VSC'} ${inc.delta}랩 더 길어진다` : `${inc.phase === 'sc' ? '세이프티카' : 'VSC'} 예상보다 빨리 끝난다`;
    case 'restart': return '재출발';
    case 'rain_start': return '🌧 비 시작';
    case 'rain_stop': return '비 그침';
    case 'radio': return inc.forced ? `📻 팀 판단: ${RADIO_LABEL[inc.choice] ?? inc.choice} (${inc.forced.split('.')[0]})` : `📻 무전: ${RADIO_LABEL[inc.choice] ?? inc.choice}`;
    case 'pit': return inc.car === ME ? `내 피트스톱 → ${inc.compound}` : null;
  }
}

const SEVERITY_LABEL: Record<Neutralization['severity'], string> = { S: '사고 크기 소', M: '사고 크기 중', L: '사고 크기 대' };
const vsText = (d?: number) => (d === undefined ? '' : d < 0 ? ' (예상보다 빨리)' : d > 0 ? ` (예상보다 ${d}랩 길게)` : ' (예상대로)');
const sectorOf = (at: number) => `${Math.min(3, Math.floor(at * 3) + 1)}섹터`;

/** 트랙 뷰 배너에 올릴 만한 사건(차 이름이 많은 추월은 내 차가 낀 것만) */
function isHeadline(inc: Incident): boolean {
  if (inc.type === 'overtake') return inc.by === ME || inc.on === ME || inc.position <= 3;
  return inc.type !== 'pit' || inc.car === ME;
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

/**
 * 트랙 뷰: 레이스 내내 보인다. progress는 지금까지 달린 랩 수(소수). 차 위치는 앞 랩과 이번 랩의
 * 선두와의 간격을 이어 그려 랩 경계에서도 끊기지 않는다.
 */
function TrackView({ circuitId, realLayout, laps, grid, progress, phase, baseLap, banner, focus, neutral, x }: {
  circuitId: string; realLayout: boolean; laps: LapRecord[]; grid: string[]; progress: number; phase: LapRecord['phase']; baseLap: number;
  banner: string; focus: string[]; neutral: Neutralization | null; x: Ctx;
}) {
  const W = 640, H = 300;
  const pathRef = useRef<SVGPathElement>(null);
  // 휴대폰처럼 좁은 화면에서는 SVG가 줄어들어 차가 점처럼 보이므로, 그린 폭에 맞춰 동그라미·글자를 키운다(최대 2.2배)
  const boxRef = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  const [, setReady] = useState(false);
  useEffect(() => {
    setReady(true); // 경로 길이를 재려면 첫 렌더 뒤에 한 번 더 그린다
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => { const w = e?.contentRect.width ?? W; setK(Math.min(2.2, Math.max(1, 520 / Math.max(1, w)))); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // 실제 레이아웃은 F1 그랑프리에서만 쓴다. 하부 리그는 같은 서킷이라도 일반 레이아웃
  const d = useMemo(() => (realLayout && CIRCUIT_PATHS[circuitId]) || genericTrackPath(circuitId, W, H), [circuitId, realLayout]);
  const flag = TRACK_FLAG[phase];
  const L = pathRef.current?.getTotalLength() ?? 0;
  const at = (f: number) => (pathRef.current && L ? pathRef.current.getPointAtLength((((f % 1) + 1) % 1) * L) : null);
  const finishLine = at(0);
  // 지금 달리는 랩(i)과 그 랩에서의 진행 비율(frac)
  const i = Math.min(Math.floor(progress), Math.max(0, laps.length - 1));
  const frac = laps.length ? Math.min(1, progress - i) : 0;
  const cur = laps[i];
  const prev = i > 0 ? laps[i - 1]!.order : grid.map((id, n) => ({ id, gap: n * 0.22 }));
  const prevGap = new Map(prev.map((e) => [e.id, e.gap]));
  const order = cur?.order ?? grid.map((id, n) => ({ id, gap: n * 0.22 }));
  const hazard = neutral ? at(neutral.at) : null;
  return (
    <div ref={boxRef} className="relative rounded-xl border bg-zinc-950 p-2 transition-colors duration-500" style={{ borderColor: flag.border }} data-flag={phase}>
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block max-h-[44vh] w-full" role="img" aria-label={`트랙 뷰: ${banner}`}>
        {flag.glow && <path d={d} fill="none" stroke={flag.glow} strokeOpacity={0.35} strokeWidth={30 * Math.min(k, 1.6)} strokeLinejoin="round" />}
        <path d={d} fill="none" stroke={flag.track} strokeWidth={18 * Math.min(k, 1.6)} strokeLinejoin="round" style={{ transition: 'stroke 400ms' }} />
        <path ref={pathRef} d={d} fill="none" stroke={flag.dash} strokeWidth={2} strokeDasharray="6 8" />
        {/* 출발·결승선(체커 무늬) */}
        {finishLine && (
          <g transform={`translate(${finishLine.x} ${finishLine.y})`}>
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <rect key={n} x={-6 + (n % 2) * 6} y={-9 + Math.floor(n / 2) * 6} width={6} height={6} fill={(n + Math.floor(n / 2)) % 2 ? '#18181b' : '#fafafa'} />
            ))}
          </g>
        )}
        {/* 사고 지점 */}
        {hazard && (
          <g transform={`translate(${hazard.x} ${hazard.y})`} aria-label="사고 지점">
            <circle r={16 * k} fill="none" stroke="#fb923c" strokeWidth={3}><animate attributeName="r" values={`${10 * k};${20 * k};${10 * k}`} dur="1.4s" repeatCount="indefinite" /></circle>
            <text y={5 * k} textAnchor="middle" fontSize={16 * k}>⚠️</text>
          </g>
        )}
        {[...order].reverse().map((e, n) => {
          const g = (prevGap.get(e.id) ?? e.gap) * (1 - frac) + e.gap * frac;
          const pt = at(frac - g / baseLap);
          if (!pt) return null;
          const mine = e.id === ME;
          const leader = n === order.length - 1;
          return (
            <g key={e.id}>
              <circle cx={pt.x} cy={pt.y} r={(mine ? 9 : 7) * k} fill={x.colorOf(e.id)} stroke={mine ? '#ffffff' : '#18181b'} strokeWidth={(mine ? 3 : 2) * k} />
              {(mine || leader || focus.includes(e.id)) && <text x={pt.x} y={pt.y - 13 * k} textAnchor="middle" fontSize={12 * k} fontWeight={700} fill={mine ? '#fafafa' : '#d4d4d8'}>{x.codeOf(e.id)}</text>}
            </g>
          );
        })}
      </svg>
      <div className="absolute left-2 top-2 max-w-[85%] truncate rounded-lg px-2 py-0.5 text-xs font-black sm:left-3 sm:top-3 sm:px-3 sm:py-1 sm:text-sm" style={{ background: flag.bannerBg, color: flag.bannerFg }}>{banner}</div>
    </div>
  );
}

function RadioModal({ decision, onPick }: { decision: RadioDecision; onPick: (o: RadioOptionId) => void }) {
  const title = { sc: '세이프티카 출동!', vsc: 'VSC 발령!', rain_start: '비가 오기 시작했다.', rain_stop: '트랙이 마르고 있다.' }[decision.trigger];
  const n = decision.neutral;
  return (
    <div className="rounded-xl border border-racing/60 bg-racing/10 p-4" role="dialog" aria-label="엔지니어 무전">
      <div className="text-xs text-zinc-300">📻 L{decision.lap} 엔지니어 무전</div>
      <div className="mt-1 text-lg font-black">{title} 어떻게 할까?</div>
      {n && (
        <div className="mt-2 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4" aria-label="상황 정보">
          <div className="rounded-lg bg-black/30 p-2"><div className="text-zinc-400">사고 지점</div><b className="text-sm">⚠️ {sectorOf(n.at)}</b></div>
          <div className="rounded-lg bg-black/30 p-2"><div className="text-zinc-400">사고 크기</div><b className={`text-sm ${n.severity === 'L' ? 'text-red-300' : n.severity === 'M' ? 'text-amber-300' : 'text-zinc-100'}`}>{n.severity === 'L' ? '대' : n.severity === 'M' ? '중' : '소'}</b></div>
          <div className="rounded-lg bg-black/30 p-2"><div className="text-zinc-400">예상 {n.phase === 'sc' ? '세이프티카' : 'VSC'}</div><b className="text-sm">{n.expectedLaps}랩</b></div>
          <div className="rounded-lg bg-black/30 p-2"><div className="text-zinc-400">더 짧게 · 더 길게</div><b className="text-sm">{Math.round(n.shorter * 100)}% · {Math.round(n.longer * 100)}%</b></div>
        </div>
      )}
      {decision.advice && (
        <p className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-400/5 p-3 text-sm leading-relaxed text-zinc-100" aria-label="엔지니어 조언">
          <span className="mr-1 font-bold text-emerald-300">엔지니어:</span>“{decision.advice}”
        </p>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {decision.options.map((o) => (
          <button key={o.id} onClick={() => onPick(o.id)} className={`rounded-xl border p-3 text-left hover:bg-white/5 ${o.recommended ? 'border-emerald-400/60' : 'border-white/15'}`}>
            <div className="font-bold">{o.label}{o.recommended && <span className="ml-1 text-xs text-emerald-300">★ 엔지니어 추천</span>}</div>
            {o.note && <div className="mt-1 text-xs leading-relaxed text-zinc-400">{o.note}</div>}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">결정은 드라이버 몫입니다. 의무 피트스톱이 코앞이거나, 타이어 수명이 다했거나, 원래 계획한 피트 타이밍이면 팀이 묻지 않고 바로 부릅니다.</p>
    </div>
  );
}

/** 커뮤니티 댓글에 쓰는 내 정보와 지금까지의 이정표(첫 포인트·첫 포디움·첫 우승 판단) */
export interface ChatContext { kr: boolean; name: string; hadPoints: boolean; hadPodium: boolean; hadWin: boolean }

/** 지금까지 달린 랩의 사건마다 붙는 댓글. 같은 레이스면 같은 댓글이 같은 순서로 나온다 */
function raceChats(seed: number, incidents: Incident[], started: boolean, upto: number, finished: Classified | null | undefined, cc: ChatContext, x: Ctx): Chat[] {
  const out: Chat[] = [];
  const add = (key: RaceChatKey, opts: { code?: string; pos?: number } = {}) => out.push(raceChat(seed, key, out.length, { kr: cc.kr, name: cc.name, ...opts }));
  if (started) add('start');
  let quiet = 0;
  for (let lap = 1; lap <= upto; lap++) {
    const before = out.length;
    for (const i of incidents) {
      if (i.lap !== lap || out.length - before >= 2) continue;
      if (i.type === 'overtake' && i.by === ME) add('passMe', { code: x.codeOf(i.on) });
      else if (i.type === 'overtake' && i.on === ME) add('lostPlace', { code: x.codeOf(i.by) });
      else if (i.type === 'lead_change' && i.leader === ME) add('leadMe');
      else if (i.type === 'sc_deploy') add('sc');
      else if (i.type === 'vsc_deploy') add('vsc');
      else if (i.type === 'red_flag') add('red');
      else if (i.type === 'rain_start') add('rain');
      else if (i.type === 'pit' && i.car === ME) add('pitMe');
      else if (i.type === 'neutral_update') add(i.delta > 0 ? 'scLonger' : 'scShorter');
      else if (i.type === 'crash' && i.car === ME) add('crashMe');
      else if (i.type === 'mech_dnf' && i.car === ME) add('mechMe');
    }
    quiet = out.length > before ? 0 : quiet + 1;
    if (quiet >= 4) { add('ambient', { code: x.codeOf(ME) }); quiet = 0; }
  }
  if (finished) {
    const pos = finished.position;
    const key: RaceChatKey = finished.status === 'dnf' ? 'dnf'
      : pos === 1 ? (cc.hadWin ? 'win' : 'firstWin')
        : pos <= 3 ? (cc.hadPodium ? 'podium' : 'firstPodium')
          : finished.points > 0 ? (cc.hadPoints ? 'points' : 'firstPoints') : 'noPoints';
    add(key, { pos });
    add(key, { pos });
  }
  return out;
}

export function LiveRace({ input, realLayout = false, cars, colorOfTeam, instant, chat, onRadio, onDone }: {
  input: RaceInput;
  /** 실시간 댓글. 없으면 댓글 칸을 그리지 않는다 */
  chat?: ChatContext;
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
  // 지금까지 달린 랩 수(소수). 프레임마다 배속 × 실제 속도만큼 늘어난다
  const [progress, setProgress] = useState(instant ? Number.MAX_SAFE_INTEGER : 0);
  const [playing, setPlaying] = useState(!instant);
  const [speed, setSpeed] = useState<number>(DEFAULT_SPEED);
  const done = useRef(false);
  const byId = useMemo(() => new Map(cars.map((c) => [c.id, c])), [cars]);
  const x: Ctx = { codeOf: (id) => byId.get(id)?.code ?? id, colorOf: (id) => colorOfTeam(byId.get(id)?.teamId ?? '') };
  const p = Math.min(progress, laps.length);
  const cur = Math.floor(p);
  const pending = outcome.status === 'pending' && p >= laps.length;

  // 트랙 뷰를 상단 메뉴 바로 아래에 붙인다(메뉴 높이는 화면 폭마다 다르다)
  const [navH, setNavH] = useState(0);
  useEffect(() => {
    const nav = document.querySelector('nav');
    if (!nav) return;
    const update = () => setNavH(nav.getBoundingClientRect().height);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(nav);
    return () => ro.disconnect();
  }, []);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const lapsRef = useRef(laps);
  lapsRef.current = laps;
  useEffect(() => {
    if (!playing || p >= laps.length) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      setProgress((v) => {
        const ls = lapsRef.current;
        const lapNow = ls[Math.min(Math.floor(v), ls.length - 1)];
        const pace = TRACK_FLAG[lapNow?.phase ?? 'green'].pace;
        return Math.min(ls.length, v + (dt * speedRef.current * pace) / input.circuit.baseLap);
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, laps.length, p >= laps.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const finished = outcome.status === 'finished' && p >= laps.length;
  useEffect(() => {
    if (finished && !done.current && outcome.status === 'finished') {
      done.current = true;
      onDone(outcome.classification);
    }
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  // 타이밍 타워는 다 달린 랩 기준
  const rec = cur > 0 ? laps[cur - 1] : null;
  const order = rec ? rec.order : input.grid.map((id) => ({ id, gap: 0, compound: 'M' as const, stops: 0 }));
  const shownLap = Math.min(outcome.totalLaps, finished ? laps.length : cur + 1);
  const ticker = outcome.incidents
    .filter((i) => i.lap <= (pending ? laps.length + 1 : cur))
    .map((i) => ({ lap: i.lap, text: describe(i, x) }))
    .filter((t) => t.text)
    .slice(-6)
    .reverse();
  // 트랙 뷰: 지금 달리는 랩의 깃발, 사고 지점, 배너
  const running = laps[Math.min(cur, laps.length - 1)];
  const deploys = outcome.incidents.filter((i): i is Extract<Incident, { info?: Neutralization }> => (i.type === 'sc_deploy' || i.type === 'vsc_deploy' || i.type === 'red_flag'));
  const phase: LapRecord['phase'] = pending ? (outcome.decision.neutral?.phase ?? 'green') : finished ? 'green' : running?.phase ?? 'green';
  const neutral = pending ? outcome.decision.neutral ?? null
    : phase !== 'green' ? deploys.filter((i) => i.lap <= cur + 1).slice(-1)[0]?.info ?? null : null;
  const headline = outcome.incidents.filter((i) => i.lap >= shownLap - 1 && i.lap <= shownLap && isHeadline(i)).slice(-1)[0];
  const focus = outcome.incidents.filter((i) => i.lap === shownLap).flatMap((i) => (i.type === 'overtake' ? [i.by, i.on] : 'car' in i ? [i.car] : []));
  const winner = outcome.status === 'finished' ? outcome.classification[0] : undefined;
  const banner = finished && winner ? `🏁 체커기 · ${x.codeOf(winner.id)} 우승`
    : `L${shownLap}/${outcome.totalLaps}${shownLap === outcome.totalLaps ? ' · 파이널 랩' : ''}${headline ? ` · ${describe(headline, x) ?? ''}` : shownLap === 1 ? ' · 스타트' : ''}`;

  const myResult = outcome.status === 'finished' ? outcome.classification.find((r) => r.id === ME) : undefined;
  const chats = chat ? raceChats(input.seed, outcome.incidents, p > 0.02, pending ? laps.length + 1 : cur, finished ? myResult : null, chat, x) : [];

  const btn = (on: boolean) => `rounded-lg px-2 py-1 text-xs font-bold ${on ? 'bg-racing text-white' : 'bg-white/5 text-zinc-300 hover:bg-white/10'}`;
  const controls = finished ? null : (
    <>
      <button onClick={() => setPlaying((v) => !v)} className={btn(false)} aria-label={playing ? '일시정지' : '재생'}>{playing ? '⏸' : '▶'}</button>
      <div className="flex gap-1" role="group" aria-label="트랙 뷰 배속">
        {SPEEDS.map((s2) => <button key={s2} onClick={() => setSpeed(s2)} aria-pressed={speed === s2} className={btn(speed === s2)}>×{s2}</button>)}
      </div>
    </>
  );

  return (
    <div className="space-y-3">
      {/* 트랙 뷰는 스크롤해도 화면 위에 붙어 있다 */}
      <div className="sticky z-30 -mx-1 bg-zinc-900 px-1 pb-1 pt-1" style={{ top: navH }}>
        <TrackView circuitId={input.circuit.id} realLayout={realLayout} laps={laps} grid={input.grid} progress={p} phase={phase} baseLap={input.circuit.baseLap}
          banner={banner} focus={focus} neutral={neutral} x={x} />
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <Pill tone="zinc">L{shownLap} / {outcome.totalLaps}</Pill>
          {phase !== 'green' && <Pill tone={phase === 'red' ? 'red' : 'amber'}>{phase === 'sc' ? '세이프티카' : phase === 'vsc' ? 'VSC' : '레드 플래그'}</Pill>}
          {running?.wet && !finished && <Pill tone="blue">비</Pill>}
          <span className="text-zinc-400">내 순위 <b className="text-zinc-100">P{Math.max(1, order.findIndex((e) => e.id === ME) + 1)}</b></span>
          {controls && <div className="ml-auto flex flex-wrap gap-1">{controls}</div>}
          {!finished && <button onClick={() => setProgress(laps.length)} className="rounded-lg border border-white/15 px-2 py-1 text-xs">다음 결정·결과까지</button>}
        </div>
      </div>

      {chat && (
        <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-2" aria-label="실시간 댓글">
          <div className="mb-1 flex items-center gap-2 text-xs font-bold text-zinc-300"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />실시간 댓글</div>
          <ul className="space-y-1">{chats.slice(-3).reverse().map((c2, i) => <ChatLine key={chats.length - i} c={c2} />)}{!chats.length && <li className="text-xs text-zinc-500">출발을 기다리는 중…</li>}</ul>
        </div>
      )}

      {pending && outcome.status === 'pending' && (
        <RadioModal decision={outcome.decision} onPick={(o) => { onRadio(outcome.decision.id, o); setPlaying(true); }} />
      )}

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

      <div className="grid gap-3 md:grid-cols-[1fr_16rem]">
        <ol className="max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-zinc-950/60 text-sm" aria-label="타이밍 타워">
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
    </div>
  );
}
