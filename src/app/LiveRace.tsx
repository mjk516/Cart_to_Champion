// 라이브 레이스(SPEC §5.5 v0.30): 트랙 뷰(서킷 + 동그라미 차)가 첫 랩부터 체커기까지 계속 돌고,
// 그 아래에 무전·결과, 타이밍 타워·사건 자막이 붙는다.
// 결과는 엔진이 시드로 미리 계산한다. 화면은 랩 기록을 재생할 뿐이다.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  TYRE_NAME,
  type Compound,
  raceChat, rngFor, runRace, type Chat, type RaceChatKey,
  type Classified, type Incident, type LapRecord, type Neutralization, type RaceCar, type RaceInput, type RadioDecision, type RadioOptionId,
} from '../engine';
import { CIRCUIT_PATHS } from './circuitPaths';
import { ChatLine } from './FeedList';
import { Pill } from './ui';
import { F1TeamBadge } from './TeamBadge';

const ME = 'player';
export const TYRE_COLOR: Record<string, string> = { S: '#ef4444', M: '#facc15', H: '#e5e7eb', I: '#22c55e', W: '#3b82f6' };
/** 재생 배속. ×1이면 실제 레이스 속도(한 랩이 실제 랩타임만큼 걸린다). ×1은 너무 느려 빼고 ×60을 둔다 */
const SPEEDS = [5, 10, 30, 60] as const;
const DEFAULT_SPEED = 10;
const SPEED_KEY = 'kart-to-champion-speed';
/** 마지막으로 고른 배속을 기억한다(이 기기에서만) */
function loadSpeed(): number {
  try {
    const v = Number(localStorage.getItem(SPEED_KEY));
    return (SPEEDS as readonly number[]).includes(v) ? v : DEFAULT_SPEED;
  } catch { return DEFAULT_SPEED; }
}

interface Ctx { codeOf: (id: string) => string; colorOf: (id: string) => string }

const RADIO_LABEL: Record<string, string> = {
  pit_hard: '피트 인(하드)', pit_medium: '피트 인(미디엄)', stay_out: '스테이 아웃', pit: '피트 인',
  inters_now: '인터로 교체', one_more_lap: '한 랩 더', stay_slicks: '슬릭 유지', slicks_now: '슬릭으로 교체', stay_inters: '인터 유지',
  wets_now: '풀웻으로 교체', pit_plan: '계획대로 피트', pit_now: '언더컷', extend: '오버컷(3랩 더)', gamble_soft: '도박: 소프트',
  data_optimal: '데이터 최적 랩', pit_soft: '도박: 소프트로 피트', pit_data: '데이터: 맞춤 타이어', radar_wait: '레이더 보고 교체', slicks_soft: '도박: 바로 소프트',
};

function describe(inc: Incident, x: Ctx): string | null {
  switch (inc.type) {
    case 'overtake': return `${x.codeOf(inc.by)}, ${x.codeOf(inc.on)} 추월 → P${inc.position}`;
    case 'lead_change': return `선두 변경: ${x.codeOf(inc.leader)}`;
    case 'crash': return `${x.codeOf(inc.car)} 사고 · OUT`;
    case 'mech_dnf': return `${x.codeOf(inc.car)} 기계 결함 · OUT`;
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
/** 피트스톱(SPEC v0.49): 이 랩에 들어오는 차와 새 타이어 */
interface PitMark { car: string; lap: number; compound: Compound }

/** 피트레인 구간(출발·결승선 기준 랩 비율): 진입 −6%, 박스 −1.2%, 출구 +3% */
const PIT_IN = -0.06, PIT_BOX = -0.012, PIT_OUT = 0.03;

function TrackView({ circuitId, realLayout, laps, grid, progress, phase, baseLap, banner, focus, neutral, x, outIds = new Set<string>(), culprits = [], pits = [] }: {
  circuitId: string; realLayout: boolean; laps: LapRecord[]; grid: string[]; progress: number; phase: LapRecord['phase']; baseLap: number;
  banner: string; focus: string[]; neutral: Neutralization | null; x: Ctx;
  /** 리타이어한 차(트랙에서 뺀다) */ outIds?: Set<string>;
  /** 지금 깃발을 부른 차(사고 지점에 OUT 표시) */ culprits?: string[];
  /** 피트스톱(차가 피트레인으로 들어가 박스에 섰다 나온다) */ pits?: PitMark[];
}) {
  const W = 640, H = 300;
  const pathRef = useRef<SVGPathElement>(null);
  // 휴대폰처럼 좁은 화면에서는 그림이 줄어들어 차가 점처럼 보이므로, 그린 폭에 맞춰 동그라미·글자를 키운다(최대 2.2배)
  const boxRef = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  const [len, setLen] = useState(0);
  const [cw, setCw] = useState(640);
  // 휴대폰도 가로로 보여 준다(세로로 세우지 않는다)
  const portrait = false;
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => { const w = e?.contentRect.width ?? W; setCw(w); setK(Math.min(2.2, Math.max(1, 640 / Math.max(1, w)))); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // 실제 레이아웃은 F1 그랑프리에서만 쓴다. 하부 리그는 같은 서킷이라도 일반 레이아웃
  const d = useMemo(() => (realLayout && CIRCUIT_PATHS[circuitId]) || genericTrackPath(circuitId, W, H), [circuitId, realLayout]);
  useEffect(() => { setLen(pathRef.current?.getTotalLength() ?? 0); }, [d]);
  const flag = TRACK_FLAG[phase];

  // ── 3D 방송 시점(SPEC v0.51): 경로를 한 번 샘플링해 긴 축을 가로로 돌리고, 원근 투영으로 기울여 그린다 ──
  const geo = useMemo(() => {
    const el = pathRef.current;
    if (!el || !len) return null;
    const N = 720;
    const raw = Array.from({ length: N }, (_, n) => { const q = el.getPointAtLength((n / N) * len); return { x: q.x, y: q.y }; });
    const mx = raw.reduce((a, q) => a + q.x, 0) / N, my = raw.reduce((a, q) => a + q.y, 0) / N;
    // 주축(PCA)으로 돌려 트랙의 긴 쪽이 가로가 되게
    let sxx = 0, syy = 0, sxy = 0;
    for (const q of raw) { const dx = q.x - mx, dy = q.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    // 세로 화면(휴대폰)에서는 긴 쪽을 세로로 세워 화면 높이를 쓴다
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy) + (portrait ? Math.PI / 2 : 0);
    const ca = Math.cos(-ang), sa = Math.sin(-ang);
    const rot = (q: { x: number; y: number }) => { const dx = q.x - mx, dy = q.y - my; return { x: dx * ca - dy * sa, y: dx * sa + dy * ca }; };
    const r = raw.map(rot);
    const xs = r.map((q) => q.x), ys = r.map((q) => q.y);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
    const tilt = portrait ? 0.55 : 0.8; // 약 32도 / 46도
    const D = span * 1.5;
    const proj = (q: { x: number; y: number }) => {
      const depth = D - q.y * Math.sin(tilt);
      const sc = D / Math.max(D * 0.4, depth);
      return { x: q.x * sc, y: q.y * Math.cos(tilt) * sc, s: sc };
    };
    const P2 = (q: { x: number; y: number }) => proj(rot(q));
    const pts = raw.map(P2);
    const pxs = pts.map((q) => q.x), pys = pts.map((q) => q.y);
    const minX = Math.min(...pxs), maxX = Math.max(...pxs), minY = Math.min(...pys), maxY = Math.max(...pys);
    const poly = (qs: Array<{ x: number; y: number }>, close = false) => qs.map((q, n) => `${n ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' ') + (close ? 'Z' : '');
    // 바닥 점 격자(원근감)
    const gx0 = Math.min(...xs) - span * 0.25, gx1 = Math.max(...xs) + span * 0.25, gy0 = Math.min(...ys) - span * 0.35, gy1 = Math.max(...ys) + span * 0.25;
    const dots: Array<{ x: number; y: number; s: number }> = [];
    const step = span / 14;
    for (let gy = gy0; gy <= gy1; gy += step) for (let gx = gx0; gx <= gx1; gx += step / 1.4) dots.push(proj({ x: gx, y: gy }));
    return { P2, trackD: poly(pts, true), minX, maxX, minY, maxY, span, dots };
  }, [len, d, portrait]);

  const L = len;
  const at2 = (f: number) => (pathRef.current && L ? pathRef.current.getPointAtLength((((f % 1) + 1) % 1) * L) : null);
  const scr = (q: { x: number; y: number } | null) => (q && geo ? geo.P2(q) : null);
  // 지금 달리는 랩(i)과 그 랩에서의 진행 비율(frac)
  const i = Math.min(Math.floor(progress), Math.max(0, laps.length - 1));
  // 마지막 랩 뒤(체커기 뒤)에도 진행이 이어진다: 남은 차가 결승선을 다 지날 때까지(SPEC v0.52)
  const lastLap = i === laps.length - 1;
  const frac = laps.length ? (lastLap ? Math.max(0, progress - i) : Math.min(1, progress - i)) : 0;
  const cur = laps[i];
  const prev = i > 0 ? laps[i - 1]!.order : grid.map((id, n) => ({ id, gap: n * 0.22 }));
  const prevGap = new Map(prev.map((e) => [e.id, e.gap]));
  const order = cur?.order ?? grid.map((id, n) => ({ id, gap: n * 0.22 }));
  const shownCars = order.filter((e) => !outIds.has(e.id));
  // 피트레인: 출발·결승선 앞뒤를 트랙 안쪽(경로 중심 방향)으로 평행 이동한 선(2D에서 계산한 뒤 투영)
  const bbox = (() => { try { return pathRef.current?.getBBox() ?? null; } catch { return null; } })();
  const cx0 = bbox ? bbox.x + bbox.width / 2 : W / 2, cy0 = bbox ? bbox.y + bbox.height / 2 : H / 2;
  const laneOff = Math.max(10, (bbox ? Math.max(bbox.width, bbox.height) : W) * 0.035);
  const normalAt = (f: number) => {
    const a = at2(f), b = at2(f + 0.003);
    if (!a || !b) return null;
    let nx = -(b.y - a.y), ny = b.x - a.x;
    const ln = Math.hypot(nx, ny) || 1;
    nx /= ln; ny /= ln;
    if ((cx0 - a.x) * nx + (cy0 - a.y) * ny < 0) { nx = -nx; ny = -ny; }
    return { a, nx, ny };
  };
  const lane2 = (f: number, extra = 0) => { const q = normalAt(f); return q ? { x: q.a.x + q.nx * (laneOff + extra), y: q.a.y + q.ny * (laneOff + extra) } : null; };
  const staticLayer = useMemo(() => {
    if (!geo || !L) return null;
    const laneD = Array.from({ length: 25 }, (_, n) => scr(lane2(PIT_IN + ((PIT_OUT - PIT_IN) * n) / 24))).filter(Boolean).map((q, n) => `${n ? 'L' : 'M'}${q!.x.toFixed(1)} ${q!.y.toFixed(1)}`).join(' ');
    const inA = scr(at2(PIT_IN - 0.015)), inB = scr(lane2(PIT_IN)), outA = scr(lane2(PIT_OUT)), outB = scr(at2(PIT_OUT + 0.015));
    const box = scr(lane2(PIT_BOX));
    const f0 = scr(at2(0)), f1 = scr(at2(0.004));
    return { laneD, inA, inB, outA, outB, box, f0, f1, tagIn: scr(lane2(PIT_IN, laneOff * 1.3)), tagOut: scr(lane2(PIT_OUT, laneOff * 1.3)), tagBox: scr(lane2(PIT_BOX, laneOff * 1.3)) };
  }, [geo, L]); // eslint-disable-line react-hooks/exhaustive-deps

  const gapAt = (lapNo: number, id: string) => (lapNo <= 0 ? (grid.indexOf(id) * 0.22) : laps[lapNo - 1]?.order.find((o) => o.id === id)?.gap ?? 0);
  const P = Math.min(progress, laps.length);
  const LANE_IN = PIT_BOX - PIT_IN, LANE_OUT = PIT_OUT - PIT_BOX;
  const pitStatus: Array<{ id: string; state: 'in' | 'stopped' | 'out'; compound: Compound }> = [];
  const placed = shownCars.map((e, rank) => {
    const fi = Math.min(1, frac);
    const g = (prevGap.get(e.id) ?? e.gap) * (1 - fi) + e.gap * fi;
    // 마지막 랩에서 결승선을 지난 차는 선 바로 뒤에 멈춘다(들어온 순서대로 조금씩 앞)
    const raw = frac - g / baseLap;
    const parked = lastLap && raw >= 1;
    // 들어온 차는 결승선 뒤로 들어온 순서대로 늘어선다(선두가 가장 앞)
    let q2: { x: number; y: number } | null = at2(parked ? 1.006 + (shownCars.length - rank) * 0.004 : raw);
    let state: 'in' | 'stopped' | 'out' | null = null;
    let pitting: PitMark | null = null;
    // 피트 랩 앞뒤: 진입 → 피트레인 저속(절반 속도) → 박스 정지 → 저속 → 출구. 잃는 시간 합 = 피트 랩 앞뒤 간격 차이
    const pit = pits.find((q) => q.car === e.id && P >= q.lap - 1 && P < q.lap + 1);
    if (pit) {
      const gPrev = gapAt(pit.lap - 1, e.id), gNew = gapAt(pit.lap, e.id);
      const loss = Math.max(0.09 + 0.03, (gNew - gPrev) / baseLap);
      const stop = Math.max(0.03, loss - (PIT_OUT - PIT_IN));
      const adv = P - gPrev / baseLap;
      const e0 = pit.lap + PIT_IN;
      let pos: number;
      if (adv < e0) pos = adv;
      else if (adv < e0 + 2 * LANE_IN) { pos = e0 + (adv - e0) / 2; state = 'in'; }
      else if (adv < e0 + 2 * LANE_IN + stop) { pos = pit.lap + PIT_BOX; state = 'stopped'; }
      else if (adv < e0 + 2 * LANE_IN + stop + 2 * LANE_OUT) { pos = pit.lap + PIT_BOX + (adv - (e0 + 2 * LANE_IN + stop)) / 2; state = 'out'; }
      else pos = adv - (LANE_IN + stop + LANE_OUT);
      if (state) { q2 = lane2(pos - pit.lap); pitting = pit; pitStatus.push({ id: e.id, state, compound: pit.compound }); } else q2 = at2(pos);
    }
    return { e, rank, pt: scr(q2), state, pitting, parked };
  });
  // 뒤(화면 위쪽)부터 그려서 앞 차가 위에 오게
  const drawOrder = [...placed].filter((c) => c.pt).sort((a, b) => a.pt!.y - b.pt!.y);
  const hazard = neutral ? scr(at2(neutral.at)) : null;

  // 화면 상자: 투영한 트랙 + 태그 여백. 동그라미·글자는 화면에서 같은 크기로 보이게 u를 곱한다
  const vb = (() => {
    if (!geo) return { x: 0, y: 0, w: W, h: H };
    const w = geo.maxX - geo.minX + geo.span * 0.12;
    // 길쭉한 서킷도 태그 자리가 남게 높이를 폭의 40% 이상으로(위쪽에 여백)
    const h0 = geo.maxY - geo.minY + geo.span * 0.12;
    const h = portrait ? h0 + geo.span * 0.22 : Math.max(h0 + geo.span * 0.14, w * 0.4);
    return { x: geo.minX - geo.span * 0.06, y: geo.maxY + geo.span * 0.06 - h, w, h };
  })();
  // 실제로 그려지는 배율(폭·높이 한도 중 작은 쪽)에 맞춰 화면에서 일정한 크기가 되게
  const maxH = typeof window !== 'undefined' ? window.innerHeight * 0.62 : 500;
  const shown = Math.min(cw / vb.w, maxH / vb.h);
  const u = Math.max(1 / shown, vb.w / 640) * (portrait ? 1.15 : 1);
  const STATE_LABEL = { in: 'PIT IN', stopped: '정지', out: 'PIT OUT' } as const;
  const trackGlow = flag.glow ?? '#ef4444';
  // 바닥 격자·트랙은 매 프레임 다시 만들지 않는다
  const trackLayer = useMemo(() => geo && (
    <g>
      <g fill="#3b82f6">{geo.dots.map((q, n) => <circle key={n} cx={q.x} cy={q.y} r={0.9 * u * q.s} opacity={0.18 * q.s} />)}</g>
      <path d={geo.trackD} fill="none" stroke={phase === 'green' ? '#ef4444' : trackGlow} strokeOpacity={phase === 'green' ? 0.18 : 0.4} strokeWidth={22 * u} strokeLinejoin="round" />
      <path d={geo.trackD} fill="none" stroke={phase === 'green' ? '#1f2937' : flag.track} strokeWidth={12 * u} strokeLinejoin="round" style={{ transition: 'stroke 400ms' }} />
      <path d={geo.trackD} fill="none" stroke={phase === 'green' ? '#f87171' : trackGlow} strokeWidth={2.4 * u} strokeLinejoin="round" />
      <path d={geo.trackD} fill="none" stroke="#e5e7eb" strokeOpacity={0.55} strokeWidth={0.9 * u} strokeDasharray={`${5 * u} ${5 * u}`} strokeLinejoin="round" />
    </g>
  ), [geo, u, phase]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={boxRef} className="relative overflow-hidden rounded-xl border transition-colors duration-500" style={{ borderColor: flag.border, background: 'radial-gradient(120% 90% at 50% 100%, #111827 0%, #05070d 70%)' }} data-flag={phase}>
      {/* 길이 재기용 원래 경로(보이지 않음) */}
      <svg width={0} height={0} className="absolute" aria-hidden><path ref={pathRef} d={d} /></svg>
      <svg viewBox={`${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}`} className="mx-auto block max-h-[62vh] w-full" role="img" aria-label={`트랙 뷰: ${banner}`}>
        {trackLayer}
        {staticLayer && (
          <>
            {/* 피트레인: 진입(노랑)·출구(초록) 연결선, 박스 */}
            <path d={staticLayer.laneD} fill="none" stroke="#374151" strokeWidth={7 * u} strokeLinecap="round" />
            <path d={staticLayer.laneD} fill="none" stroke="#9ca3af" strokeWidth={0.9 * u} strokeDasharray={`${3 * u} ${3 * u}`} />
            {staticLayer.inA && staticLayer.inB && <line x1={staticLayer.inA.x} y1={staticLayer.inA.y} x2={staticLayer.inB.x} y2={staticLayer.inB.y} stroke="#facc15" strokeWidth={2.5 * u} strokeLinecap="round" />}
            {staticLayer.outA && staticLayer.outB && <line x1={staticLayer.outA.x} y1={staticLayer.outA.y} x2={staticLayer.outB.x} y2={staticLayer.outB.y} stroke="#4ade80" strokeWidth={2.5 * u} strokeLinecap="round" />}
            {staticLayer.box && <rect x={staticLayer.box.x - 7 * u} y={staticLayer.box.y - 5 * u} width={14 * u} height={10 * u} rx={2 * u} fill="none" stroke="#e5e7eb" strokeWidth={1.2 * u} strokeDasharray={`${2.5 * u} ${1.5 * u}`} />}
            {staticLayer.tagIn && <text x={staticLayer.tagIn.x} y={staticLayer.tagIn.y} textAnchor="middle" fontSize={8 * u} fontWeight={900} fill="#facc15" stroke="#05070d" strokeWidth={2.5 * u} paintOrder="stroke">PIT IN</text>}
            {staticLayer.tagOut && <text x={staticLayer.tagOut.x} y={staticLayer.tagOut.y} textAnchor="middle" fontSize={8 * u} fontWeight={900} fill="#4ade80" stroke="#05070d" strokeWidth={2.5 * u} paintOrder="stroke">PIT OUT</text>}
            {staticLayer.tagBox && <text x={staticLayer.tagBox.x} y={staticLayer.tagBox.y} textAnchor="middle" fontSize={8 * u} fontWeight={900} fill="#e5e7eb" stroke="#05070d" strokeWidth={2.5 * u} paintOrder="stroke">BOX</text>}
            {/* 출발·결승선 */}
            {staticLayer.f0 && staticLayer.f1 && (() => {
              const a = staticLayer.f0!, b = staticLayer.f1!;
              const nx = -(b.y - a.y), ny = b.x - a.x, ln = Math.hypot(nx, ny) || 1;
              const w = 8 * u;
              return <line x1={a.x - (nx / ln) * w} y1={a.y - (ny / ln) * w} x2={a.x + (nx / ln) * w} y2={a.y + (ny / ln) * w} stroke="#fafafa" strokeWidth={2.2 * u} strokeDasharray={`${1.6 * u} ${1.6 * u}`} />;
            })()}
          </>
        )}
        {/* 사고 지점 */}
        {hazard && (
          <g transform={`translate(${hazard.x} ${hazard.y})`} aria-label="사고 지점">
            <circle r={14 * u} fill="none" stroke="#fb923c" strokeWidth={2.5 * u}><animate attributeName="r" values={`${8 * u};${18 * u};${8 * u}`} dur="1.4s" repeatCount="indefinite" /></circle>
            <text y={4 * u} textAnchor="middle" fontSize={13 * u}>⚠️</text>
            {culprits.map((id, n) => (
              <g key={id} transform={`translate(0 ${(20 + n * 15) * u})`}>
                <rect x={-26 * u} y={-8 * u} width={52 * u} height={13 * u} rx={3 * u} fill="#dc2626" />
                <text y={2 * u} textAnchor="middle" fontSize={9 * u} fontWeight={900} fill="#fff">{x.codeOf(id)} OUT</text>
              </g>
            ))}
          </g>
        )}
        {/* 차와 "순위 | 코드" 태그 */}
        {drawOrder.map(({ e, rank, pt, state, pitting, parked }) => {
          const p = pt!;
          const mine = e.id === ME;
          // 모든 차에 태그를 바로 위에 단다(겹쳐도 된다, SPEC v0.53). 결승선을 지나 늘어선 차는 나·우승자만
          const tagged = mine || rank === 0 || !parked;
          const r = (mine ? 5.5 : 4.5) * u * p.s;
          const label = state && pitting ? `${x.codeOf(e.id)} ${STATE_LABEL[state]}${state === 'stopped' ? ` → ${pitting.compound}` : ''}` : `${rank + 1} | ${x.codeOf(e.id)}`;
          const tw = (label.length * 5.6 + 8) * u;
          const lift = 13 * u;
          return (
            <g key={e.id} data-pit={state ?? undefined}>
              {state === 'stopped' && pitting && (
                <circle cx={p.x} cy={p.y} r={r + 4 * u} fill="none" stroke={TYRE_COLOR[pitting.compound]} strokeWidth={2.5 * u}>
                  <animate attributeName="stroke-opacity" values="1;0.35;1" dur="0.9s" repeatCount="indefinite" />
                </circle>
              )}
              <circle cx={p.x} cy={p.y} r={r * 2.1} fill={x.colorOf(e.id)} opacity={0.22} />
              <circle cx={p.x} cy={p.y} r={r} fill={x.colorOf(e.id)} stroke={mine ? '#ffffff' : '#0b0f19'} strokeWidth={(mine ? 2 : 1.2) * u} />
              {tagged && (
                <g>
                  <line x1={p.x} y1={p.y - r} x2={p.x} y2={p.y - lift + 6 * u} stroke={mine ? '#ffffff' : '#9ca3af'} strokeOpacity={0.6} strokeWidth={0.8 * u} />
                  <rect x={p.x - tw / 2} y={p.y - lift - 6 * u} width={tw} height={12 * u} rx={2 * u}
                    fill={state === 'in' ? '#facc15' : state === 'out' ? '#4ade80' : state === 'stopped' ? '#ffffff' : mine ? '#ffffff' : 'rgba(17,24,39,0.88)'}
                    stroke={mine || state ? 'none' : 'rgba(255,255,255,0.18)'} strokeWidth={0.6 * u} />
                  <text x={p.x} y={p.y - lift + 2.8 * u} textAnchor="middle" fontSize={8 * u} fontWeight={800}
                    fill={mine || state ? '#0b0f19' : '#f3f4f6'}>{label}</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <div className="absolute left-2 top-2 max-w-[85%] truncate rounded-lg px-2 py-0.5 text-xs font-black sm:left-3 sm:top-3 sm:px-3 sm:py-1 sm:text-sm" style={{ background: flag.bannerBg, color: flag.bannerFg }}>{banner}</div>
      {/* 피트 상황: 칸 높이를 늘 같게 두고(화면이 흔들리지 않게) 넘치면 옆으로 */}
      <div className="flex h-7 items-center gap-1 overflow-x-auto whitespace-nowrap px-2 [scrollbar-width:none]" aria-label="피트 상황">
          {pitStatus.map((q) => (
            <span key={q.id} className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-black ${q.state === 'in' ? 'bg-yellow-400 text-zinc-900' : q.state === 'out' ? 'bg-green-400 text-zinc-900' : 'bg-white text-zinc-900'}`}>
              🔧 {x.codeOf(q.id)} {q.state === 'in' ? '피트 인' : q.state === 'out' ? '피트 아웃' : `정지 · 새 타이어 ${TYRE_NAME[q.compound]}`}
            </span>
          ))}
        </div>
    </div>
  );
}

function RadioModal({ decision, onPick }: { decision: RadioDecision; onPick: (o: RadioOptionId) => void }) {
  const title = { sc: '세이프티카 출동!', vsc: 'VSC 발령!', rain_start: '비가 오기 시작했다.', rain_stop: '트랙이 마르고 있다.', pit_window: '피트 창이 열렸다.', red_flag: '레드 플래그! 세션 중단.' }[decision.trigger];
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

/** 순위표 보기(SPEC v0.54): 오른쪽 ›는 INTERVAL → LEADER → TIRE, 왼쪽 ‹는 반대 */
type TowerMode = 'interval' | 'leader' | 'tyre';
const TOWER_MODES: TowerMode[] = ['interval', 'leader', 'tyre'];
const TOWER_LABEL: Record<TowerMode, string> = { interval: 'INTERVAL', leader: 'LEADER', tyre: 'TIRE' };

function TimingTower({ kind, lap, total, order, outs, mode, onMode, x, teamOf, myTeam, pitting }: {
  kind: 'race' | 'sprint'; lap: number; total: number; order: Array<{ id: string; gap: number; compound: Compound; stops: number }>;
  outs: Array<{ car: string; lap: number; type: string }>; mode: TowerMode; onMode: (m: TowerMode) => void; x: Ctx;
  teamOf: (id: string) => string | undefined; myTeam?: string; pitting: (id: string) => boolean;
}) {
  const i = TOWER_MODES.indexOf(mode);
  const value = (e: { id: string; gap: number; compound: Compound; stops: number }, n: number) => {
    if (pitting(e.id) && mode !== 'tyre') return <span className="rounded bg-amber-400 px-1 font-black text-zinc-900" aria-label={`${x.codeOf(e.id)} 피트인`}>PIT</span>;
    if (mode === 'tyre') {
      return (
        <span className="inline-flex items-center justify-end gap-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black text-zinc-900 sm:h-[18px] sm:w-[18px] sm:text-[10px]" style={{ background: TYRE_COLOR[e.compound] }}>{e.compound}</span>
          <span className="hidden sm:inline">{TYRE_NAME[e.compound]}</span>
        </span>
      );
    }
    if (n === 0) return '-';
    const g = mode === 'interval' ? e.gap - (order[n - 1]?.gap ?? 0) : e.gap;
    return `+${g.toFixed(3)}`;
  };
  return (
    <div className="flex w-[9.5rem] shrink-0 flex-col self-start overflow-hidden rounded-xl border border-white/15 bg-[#05070d] text-[11px] sm:w-56 sm:text-[13px] md:max-h-[calc(62vh+5.5rem)]" aria-label="순위표">
      <div className="flex items-center justify-between bg-gradient-to-r from-zinc-800 to-zinc-900 px-2 py-1.5">
        <span className="font-black tracking-widest text-white">{kind === 'sprint' ? 'SPRINT' : 'RACE'}</span>
        <span className="text-zinc-400">LAP <b className="text-sm text-white sm:text-base">{lap}</b>/{total}</span>
      </div>
      <div className="flex items-center justify-between border-y border-white/10 bg-[#0d1220] text-[10px] font-black tracking-widest text-zinc-200 sm:text-xs">
        <button className="px-2 py-1.5 hover:text-white" aria-label="이전 보기" onClick={() => onMode(TOWER_MODES[(i + 2) % 3]!)}>‹</button>
        <span aria-live="polite">{TOWER_LABEL[mode]}</span>
        <button className="px-2 py-1.5 hover:text-white" aria-label="다음 보기" onClick={() => onMode(TOWER_MODES[(i + 1) % 3]!)}>›</button>
      </div>
      {/* 넓은 화면에서는 트랙 영역 높이를 넘지 않게 안에서 스크롤(위에 붙는 영역이 화면을 다 덮지 않게) */}
      <ol className="min-h-0 flex-1 md:overflow-y-auto md:[scrollbar-width:thin]" aria-label="타이밍 타워">
        {order.map((e, n) => {
          const mine = e.id === ME;
          const mate = !mine && myTeam && teamOf(e.id) === myTeam;
          return (
            <li key={e.id} className={`flex h-[22px] items-center gap-1 border-b border-white/5 px-1.5 sm:h-[26px] sm:gap-1.5 ${mine ? 'bg-white font-bold text-zinc-900' : 'text-zinc-100'}`}
              style={mate ? { background: `${x.colorOf(e.id)}33` } : undefined}>
              <span className={`w-4 text-right font-bold sm:w-5 ${mine ? 'text-zinc-900' : 'text-zinc-400'}`}>{n + 1}</span>
              <span className="flex w-4 justify-center sm:w-5"><F1TeamBadge teamId={teamOf(e.id)} size={14} /></span>
              <span className="font-bold tracking-wide">{x.codeOf(e.id)}</span>
              <span className={`ml-auto tabular-nums ${mine ? 'text-zinc-800' : 'text-zinc-300'}`}>{value(e, n)}</span>
            </li>
          );
        })}
        {outs.map((o) => (
          <li key={`out-${o.car}`} aria-label={`${x.codeOf(o.car)} 리타이어`} className={`flex h-[22px] items-center gap-1 border-b border-white/5 px-1.5 text-zinc-500 sm:h-[26px] sm:gap-1.5 ${o.car === ME ? 'bg-white/80 font-bold text-zinc-700' : ''}`}>
            <span className="w-4 text-right sm:w-5">✕</span>
            <span className="flex w-4 justify-center opacity-50 sm:w-5"><F1TeamBadge teamId={teamOf(o.car)} size={14} /></span>
            <span className="line-through">{x.codeOf(o.car)}</span>
            <span className="ml-auto rounded bg-red-600 px-1 py-0.5 text-[10px] font-black text-white">OUT</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function LiveRace({ input, realLayout = false, cars, colorOfTeam, instant, chat, onRadio, onDone, startAt = 0, onProgress }: {
  input: RaceInput;
  /** 이어 보기: 이 랩부터 시작한다(중간에 닫았던 레이스) */
  startAt?: number;
  /** 본 랩 수를 저장한다(몇 랩마다, 그리고 화면을 떠날 때) */
  onProgress?: (lap: number) => void;
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
  const [progress, setProgress] = useState(instant ? Number.MAX_SAFE_INTEGER : Math.max(0, Math.min(startAt, laps.length)));
  const [playing, setPlaying] = useState(!instant);
  const [speed, setSpeedState] = useState<number>(loadSpeed);
  // 순위표 보기: 앞차와 간격(INTERVAL, 기본) → 선두와 간격(LEADER) → 타이어(TIRE)
  const [towerMode, setTowerMode] = useState<TowerMode>('interval');
  const setSpeed = (v: number) => { setSpeedState(v); try { localStorage.setItem(SPEED_KEY, String(v)); } catch { /* 무시 */ } };
  const done = useRef(false);
  const byId = useMemo(() => new Map(cars.map((c) => [c.id, c])), [cars]);
  const x: Ctx = { codeOf: (id) => byId.get(id)?.code ?? id, colorOf: (id) => colorOfTeam(byId.get(id)?.teamId ?? '') };
  const p = Math.min(progress, laps.length);
  const cur = Math.floor(p);
  const pending = outcome.status === 'pending' && p >= laps.length;
  // 레이스 끝: 선두가 아니라 남아 있는 차 중 맨 뒤 차가 결승선을 지날 때(SPEC v0.52). 마지막 랩 간격의 최댓값만큼 더 달린다
  const endP = useMemo(() => {
    if (outcome.status !== 'finished' || !laps.length) return laps.length;
    const finishers = new Set(outcome.classification.filter((r) => r.status === 'finished').map((r) => r.id));
    const last = laps[laps.length - 1]!.order.filter((o) => finishers.has(o.id));
    const maxGap = Math.max(0, ...last.map((o) => o.gap));
    return laps.length + Math.min(0.98, maxGap / input.circuit.baseLap) + 0.02;
  }, [outcome, laps, input.circuit.baseLap]);
  const pt = Math.min(progress, endP);

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
    if (!playing || pt >= endP) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      setProgress((v) => {
        const ls = lapsRef.current;
        const lapNow = ls[Math.min(Math.floor(v), ls.length - 1)];
        const pace = TRACK_FLAG[lapNow?.phase ?? 'green'].pace;
        return Math.min(endP, v + (dt * speedRef.current * pace) / input.circuit.baseLap);
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, laps.length, endP, pt >= endP]); // eslint-disable-line react-hooks/exhaustive-deps

  // 이어 보기 저장: 3랩마다, 그리고 탭을 숨기거나 닫거나 화면을 떠날 때
  const progressRef = useRef(p);
  progressRef.current = p;
  const savedLap = useRef(Math.floor(startAt));
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  useEffect(() => {
    if (instant || !onProgressRef.current) return;
    if (cur - savedLap.current >= 3) { savedLap.current = cur; onProgressRef.current(cur); }
  }, [cur, instant]);
  useEffect(() => {
    if (instant) return;
    const flush = () => {
      const lap = Math.floor(progressRef.current);
      if (lap !== savedLap.current) { savedLap.current = lap; onProgressRef.current?.(lap); }
    };
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', flush); flush(); };
  }, [instant]);

  const finished = outcome.status === 'finished' && pt >= endP;
  // 선두는 체커기를 받았고 뒤차들이 들어오는 중
  const checkered = outcome.status === 'finished' && progress >= laps.length && !finished;
  useEffect(() => {
    if (finished && !done.current && outcome.status === 'finished') {
      done.current = true;
      onDone(outcome.classification);
    }
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  // 피트스톱: 트랙 뷰 피트레인 연출과 타이밍 타워 PIT 표시(SPEC v0.49)
  const pitMarks: PitMark[] = outcome.incidents.flatMap((i) => (i.type === 'pit' ? [{ car: i.car, lap: i.lap, compound: i.compound }] : []));
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
  // 리타이어한 차(OUT): 지금 보이는 랩까지. 세이프티카·VSC·레드 플래그를 부른 차도 여기에 있다
  const outUntil = finished ? Number.MAX_SAFE_INTEGER : pending ? laps.length + 1 : shownLap;
  const outs = outcome.incidents
    .filter((i): i is Extract<Incident, { type: 'crash' | 'mech_dnf' }> => (i.type === 'crash' || i.type === 'mech_dnf') && i.lap <= outUntil)
    .sort((a, b) => b.lap - a.lap);
  const outIds = new Set(outs.map((o) => o.car));
  const deployLap = neutral ? deploys.filter((i) => i.lap <= outUntil).slice(-1)[0]?.lap : undefined;
  const culprits = deployLap !== undefined ? outs.filter((o) => o.lap === deployLap && o.neutralization !== 'none').map((o) => o.car) : [];
  const headlineCar = headline && 'car' in headline ? headline.car : null;
  const culpritText = culprits.length && !(headlineCar && culprits.includes(headlineCar)) ? ` · ${culprits.map((id) => x.codeOf(id)).join(', ')} OUT` : '';
  const banner = (finished || checkered) && winner ? `🏁 체커기 · ${x.codeOf(winner.id)} 우승${checkered ? ' · 남은 차 들어오는 중' : ''}`
    : `L${shownLap}/${outcome.totalLaps}${shownLap === outcome.totalLaps ? ' · 파이널 랩' : ''}${culpritText}${headline ? ` · ${describe(headline, x) ?? ''}` : shownLap === 1 ? ' · 스타트' : ''}`;

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
      {/* 순위표(왼쪽) + 트랙 뷰. 넓은 화면에서는 스크롤해도 위에 붙어 있다 */}
      <div className="z-30 -mx-1 flex gap-2 bg-zinc-900 px-1 pb-1 pt-1 md:sticky" style={{ top: navH }}>
        <TimingTower kind={input.kind} lap={shownLap} total={outcome.totalLaps} order={order.filter((e) => !outIds.has(e.id))} outs={outs}
          mode={towerMode} onMode={setTowerMode} x={x} teamOf={(id) => byId.get(id)?.teamId} myTeam={byId.get(ME)?.teamId}
          pitting={(id) => !finished && pitMarks.some((q) => q.car === id && q.lap === cur)} />
        <div className="min-w-0 flex-1">
        <TrackView circuitId={input.circuit.id} realLayout={realLayout} laps={laps} grid={input.grid} progress={pt} phase={phase} baseLap={input.circuit.baseLap}
          banner={banner} focus={focus} neutral={neutral} x={x} pits={pitMarks} />
        {/* 상태 줄(높이 고정)과 조작 줄을 나눠, 깃발·비 표시가 생겨도 줄 수가 바뀌지 않게 */}
        <div className="mt-1 flex h-6 items-center gap-2 overflow-hidden whitespace-nowrap text-xs">
          <Pill tone="zinc">L{shownLap} / {outcome.totalLaps}</Pill>
          {phase !== 'green' && <Pill tone={phase === 'red' ? 'red' : 'amber'}>{phase === 'sc' ? '세이프티카' : phase === 'vsc' ? 'VSC' : '레드 플래그'}</Pill>}
          {running?.wet && !finished && <Pill tone="blue">비</Pill>}
          <span className="text-zinc-400">내 순위 <b className="text-zinc-100">P{Math.max(1, order.findIndex((e) => e.id === ME) + 1)}</b></span>
        </div>
        {!finished && (
          <div className="mt-1 flex flex-wrap items-center justify-start gap-1 text-xs">
            {controls}
            <button onClick={() => setProgress(outcome.status === 'finished' ? endP : laps.length)} className="rounded-lg border border-white/15 px-2 py-1 text-xs">다음 결정·결과까지</button>
          </div>
        )}
        </div>
      </div>

      {chat && (
        <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-2" aria-label="실시간 댓글">
          <div className="mb-1 flex items-center gap-2 text-xs font-bold text-zinc-300"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />실시간 댓글</div>
          <ul className="h-[4.75rem] space-y-0.5 overflow-hidden">{chats.slice(-3).reverse().map((c2, i) => <ChatLine key={chats.length - i} c={c2} compact />)}{!chats.length && <li className="flex h-6 items-center text-xs text-zinc-500">출발을 기다리는 중…</li>}</ul>
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

      {/* 사건 기록 */}
        <div className="rounded-xl border border-white/10 bg-zinc-950/60 p-2 text-xs" aria-live="polite">
          <div className="mb-1 font-bold text-zinc-300">사건</div>
          {ticker.length === 0 && <div className="text-zinc-500">출발 대기</div>}
          {ticker.map((t, i) => <div key={i} className="py-0.5 text-zinc-300"><span className="text-zinc-500">L{t.lap}</span> {t.text}</div>)}
        </div>
    </div>
  );
}
