// 실제 드라이버 능력치 산정(SPEC §2.2, PRD WD-3): 최근 3시즌 공개 기록 → 자동 초안 → 직접 보정(±5) → 검증.
//   npm run rate-drivers                 초안과 현재 값 비교표, 검증 결과 출력
//   npm run rate-drivers -- --write      보정까지 반영한 값을 src/engine/data.ts의 DRIVERS_2026에 쓴다
//   npm run rate-drivers -- --runs 1000  검증 시즌 수(기본 300)
// 데이터: Jolpica F1 API(Ergast 호환, https://api.jolpi.ca). 받은 원본은 data/drivers/cache/에 저장해 다시 받지 않는다.
//
// 계산 방식(팀메이트 비교 사슬):
//   각 항목마다 같은 레이스의 팀메이트 쌍 (i, j)에서 차이 d를 관측하고, s_i − s_j ≈ d가 되도록
//   최소제곱으로 전체 그리드의 상대값 s를 푼다(팀메이트를 거쳐 그리드 전체가 하나의 척도). 최근 시즌 가중치 3:2:1.
//   현재 게임 값의 평균·표준편차에 맞춰 능력치 척도로 옮긴 뒤(게임 밸런스 수준은 그대로),
//   관측 수와 항목별 신뢰도(SHRINK_K)에 따라 기존 값과 섞는다.
//   Pace 예선 팀메이트 차이(%) · Racecraft 출발 대비 순위 변동 차이 · Tyre 결승 순위 차이(롱런 데이터 대신)
//   Consistency 완주율·드라이버 과실 리타이어·포인트권 완주율 · Wet 비 온 레이스의 팀메이트 대비 결승 순위
//   Feedback F1 경력 연수(근사)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  CALENDAR_2026, carFromDriver, DRIVERS_2026, runRace, simulateQualifying, STAT_KEYS, teamForm, TEAMS_2026,
  type Driver, type StatKey, type Stats,
} from '../src/engine';

const API = 'https://api.jolpi.ca/ergast/f1';
const SEASONS = [2024, 2025, 2026];
const WEIGHT: Record<number, number> = { 2026: 3, 2025: 2, 2024: 1 };
const CACHE = 'data/drivers/cache';
const MIN_OBS = 6; // 가중 관측이 이보다 적으면 기존 값을 유지한다(신인 등)
/**
 * 기록이 적거나 오차가 큰 항목일수록 기존 값(사전 추정치) 쪽으로 당긴다: 최종 = 기존 + n/(n+K) × (기록값 − 기존).
 * K가 클수록 기록을 덜 믿는다. 예선 차이는 믿을 만하고, 순위 변동·완주율은 운이 많이 섞인다
 */
const SHRINK_K: Record<StatKey, number> = { pace: 40, racecraft: 200, tyre: 150, consistency: 200, wet: 40, feedback: 30 };
/** 비 온 레이스(시즌-서킷). 기록에 날씨가 없어서 손으로 적는다 */
const WET_RACES = new Set(['2024-villeneuve', '2024-interlagos', '2025-albert_park', '2025-silverstone', '2025-spa']);
/** 드라이버 과실로 보는 리타이어 사유 */
const DRIVER_ERROR = /Accident|Collision|Spun off|Damage/i;

const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const WRITE = process.argv.includes('--write');
const RUNS = Number(arg('--runs') ?? 300);

// ── 데이터 받기(캐시) ────────────────────────────────────────────────
async function getJson(path: string, file: string): Promise<any> {
  const f = `${CACHE}/${file}.json`;
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  mkdirSync(CACHE, { recursive: true });
  const out: any[] = [];
  let offset = 0, total = Infinity;
  while (offset < total) {
    const res = await fetch(`${API}/${path}${path.includes('?') ? '&' : '?'}limit=100&offset=${offset}`);
    if (!res.ok) throw new Error(`${res.status} ${path}`);
    const j: any = await res.json();
    total = Number(j.MRData.total);
    out.push(j.MRData);
    offset += 100;
    await new Promise((r) => setTimeout(r, 300)); // API 예의
  }
  writeFileSync(f, JSON.stringify(out));
  return out;
}

interface Row { year: number; round: number; circuit: string; code: string; team: string; grid: number; pos: number | null; classified: boolean; status: string; points: number }
interface QRow { year: number; round: number; code: string; team: string; best: number | null; seg: number }

function races(pages: any[]): any[] {
  // 페이지 경계에서 한 레이스가 나뉘어 올 수 있어 라운드별로 합친다
  const byRound = new Map<string, any>();
  for (const p of pages) for (const r of p.RaceTable.Races) {
    const k = `${r.season}-${r.round}`;
    const prev = byRound.get(k);
    if (prev) { prev.Results = [...(prev.Results ?? []), ...(r.Results ?? [])]; prev.QualifyingResults = [...(prev.QualifyingResults ?? []), ...(r.QualifyingResults ?? [])]; }
    else byRound.set(k, { ...r });
  }
  return [...byRound.values()];
}

const lapSec = (t?: string) => {
  if (!t) return null;
  const m = /^(?:(\d+):)?(\d+\.\d+)$/.exec(t);
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : null;
};

async function load(): Promise<{ rows: Row[]; qrows: QRow[] }> {
  const rows: Row[] = [], qrows: QRow[] = [];
  for (const y of SEASONS) {
    for (const r of races(await getJson(`${y}/results.json`, `${y}-results`))) {
      for (const x of r.Results ?? []) {
        if (!x.Driver.code) continue;
        rows.push({
          year: y, round: Number(r.round), circuit: r.Circuit.circuitId, code: x.Driver.code, team: x.Constructor.constructorId,
          grid: Number(x.grid), pos: /^\d+$/.test(x.positionText) ? Number(x.position) : null,
          classified: /^\d+$/.test(x.positionText), status: x.status, points: Number(x.points),
        });
      }
    }
    for (const r of races(await getJson(`${y}/qualifying.json`, `${y}-qualifying`))) {
      for (const x of r.QualifyingResults ?? []) {
        if (!x.Driver.code) continue;
        const segs = [lapSec(x.Q1), lapSec(x.Q2), lapSec(x.Q3)];
        const seg = segs[2] ? 3 : segs[1] ? 2 : segs[0] ? 1 : 0;
        qrows.push({ year: y, round: Number(r.round), code: x.Driver.code, team: x.Constructor.constructorId, best: seg ? segs[seg - 1]! : null, seg });
      }
    }
  }
  return { rows, qrows };
}

// ── 팀메이트 비교 사슬(가중 최소제곱) ─────────────────────────────────
interface Obs { i: string; j: string; d: number; w: number }

function solve(obs: Obs[]): { s: Map<string, number>; n: Map<string, number> } {
  const s = new Map<string, number>(), n = new Map<string, number>();
  for (const o of obs) { s.set(o.i, 0); s.set(o.j, 0); n.set(o.i, (n.get(o.i) ?? 0) + o.w); n.set(o.j, (n.get(o.j) ?? 0) + o.w); }
  const ridge = 0.5; // 연결이 약한 드라이버가 튀지 않게 0 쪽으로 살짝 당긴다
  for (let it = 0; it < 400; it++) {
    for (const id of s.keys()) {
      let num = 0, den = ridge;
      for (const o of obs) {
        if (o.i === id) { num += o.w * (o.d + s.get(o.j)!); den += o.w; }
        else if (o.j === id) { num += o.w * (s.get(o.i)! - o.d); den += o.w; }
      }
      s.set(id, num / den);
    }
    const mean = [...s.values()].reduce((a, b) => a + b, 0) / s.size;
    for (const [k, v] of s) s.set(k, v - mean);
  }
  return { s, n };
}

function pairs<T extends { year: number; round: number; team: string; code: string }>(xs: T[], f: (a: T, b: T) => number | null): Obs[] {
  const groups = new Map<string, T[]>();
  for (const x of xs) { const k = `${x.year}-${x.round}-${x.team}`; groups.set(k, [...(groups.get(k) ?? []), x]); }
  const obs: Obs[] = [];
  for (const g of groups.values()) {
    if (g.length !== 2) continue;
    const [a, b] = g as [T, T];
    const d = f(a, b);
    if (d !== null && Number.isFinite(d)) obs.push({ i: a.code, j: b.code, d, w: WEIGHT[a.year] ?? 1 });
  }
  return obs;
}

async function main() {
  const { rows, qrows } = await load();
  console.log(`기록: 결승 ${rows.length}행, 예선 ${qrows.length}행 (${SEASONS.join(', ')})`);

  const raw: Record<StatKey, { s: Map<string, number>; n: Map<string, number> }> = {} as never;
  // Pace: 같은 세그먼트까지 간 팀메이트 쌍의 기록 차이(%). 빠를수록 +. 세그먼트가 다르면 더 멀리 간 쪽에 +0.4%
  raw.pace = solve(pairs(qrows, (a, b) => {
    if (!a.seg || !b.seg) return null;
    if (a.seg !== b.seg) return a.seg > b.seg ? 0.4 : -0.4;
    if (!a.best || !b.best) return null;
    const d = ((b.best - a.best) / b.best) * 100;
    return Math.abs(d) > 3 ? null : d; // 3% 넘는 차이는 사고·문제로 보고 뺀다
  }));
  // Racecraft: 출발 대비 순위 변동(둘 다 완주, 피트레인 출발 제외)
  raw.racecraft = solve(pairs(rows, (a, b) => (a.classified && b.classified && a.grid > 0 && b.grid > 0 ? (a.grid - a.pos!) - (b.grid - b.pos!) : null)));
  // Tyre: 결승 순위 차이(롱런 데이터 대신), 둘 다 완주
  raw.tyre = solve(pairs(rows, (a, b) => (a.classified && b.classified ? b.pos! - a.pos! : null)));
  // Wet: 비 온 레이스의 결승 순위 차이
  raw.wet = solve(pairs(rows.filter((r) => WET_RACES.has(`${r.year}-${r.circuit}`)), (a, b) => (a.classified && b.classified ? b.pos! - a.pos! : null)));
  // Consistency: 팀메이트 대비 (완주 + 포인트권) − 과실 리타이어
  const consScore = (r: Row) => (r.classified ? 1 : 0) + (r.points > 0 ? 0.5 : 0) - (!r.classified && DRIVER_ERROR.test(r.status) ? 1.5 : 0);
  raw.consistency = solve(pairs(rows, (a, b) => consScore(a) - consScore(b)));

  // Feedback: F1 경력 연수(근사)
  const codes = DRIVERS_2026.map((d) => d.code);
  const idOf = new Map<string, string>();
  for (const y of SEASONS) for (const r of races(await getJson(`${y}/results.json`, `${y}-results`))) for (const x of r.Results ?? []) if (x.Driver.code) idOf.set(x.Driver.code, x.Driver.driverId);
  const seasonsOf = new Map<string, number>();
  for (const code of codes) {
    const id = idOf.get(code);
    if (!id) continue;
    const pages = await getJson(`drivers/${id}/seasons.json`, `seasons-${id}`);
    seasonsOf.set(code, Number(pages[0]?.total ?? 0));
  }
  const fb = new Map<string, number>();
  const fbMean = [...seasonsOf.values()].reduce((a, b) => a + Math.log1p(b), 0) / Math.max(1, seasonsOf.size);
  for (const [c, n] of seasonsOf) fb.set(c, Math.log1p(n) - fbMean);
  raw.feedback = { s: fb, n: new Map([...fb.keys()].map((k) => [k, 99])) };

  // ── 게임 척도로 옮기기 ──
  // 기준값: data/drivers/baseline.json(손으로 정한 원래 값). 없으면 지금 data.ts 값. 늘 같은 기준과 섞으므로 여러 번 돌려도 결과가 같다
  const baseFile = 'data/drivers/baseline.json';
  const baseline: Record<string, Stats> = existsSync(baseFile) ? JSON.parse(readFileSync(baseFile, 'utf8')).drivers : {};
  const current = new Map(DRIVERS_2026.map((d) => [d.code, { ...d, stats: baseline[d.code] ?? d.stats }]));
  const draft = new Map<string, Stats>();
  const kept: string[] = [];
  for (const d of current.values()) draft.set(d.code, { ...d.stats });
  for (const k of STAT_KEYS) {
    const { s, n } = raw[k];
    const cur = [...current.values()].map((d) => d.stats[k]);
    const mu = cur.reduce((a, b) => a + b, 0) / cur.length;
    const sd = Math.sqrt(cur.reduce((a, b) => a + (b - mu) ** 2, 0) / cur.length) || 1;
    const on = codes.filter((c) => s.has(c) && (n.get(c) ?? 0) >= MIN_OBS);
    const vs = on.map((c) => s.get(c)!);
    const vmu = vs.reduce((a, b) => a + b, 0) / Math.max(1, vs.length);
    const vsd = Math.sqrt(vs.reduce((a, b) => a + (b - vmu) ** 2, 0) / Math.max(1, vs.length)) || 1;
    for (const c of codes) {
      if (!on.includes(c)) { kept.push(`${c}.${k}`); continue; }
      const z = (s.get(c)! - vmu) / vsd;
      const fromRecord = mu + z * sd;
      const prior = current.get(c)!.stats[k];
      const nObs = n.get(c) ?? 0;
      const a = nObs / (nObs + SHRINK_K[k]);
      draft.get(c)![k] = Math.round(Math.max(60, Math.min(99, prior + a * (fromRecord - prior))));
    }
  }

  // ── 직접 보정(±5) ──
  const ovFile = 'data/drivers/overrides.json';
  const overrides: Array<{ code: string; stat: StatKey; delta: number; reason: string }> = existsSync(ovFile) ? JSON.parse(readFileSync(ovFile, 'utf8')).overrides ?? [] : [];
  for (const o of overrides) {
    if (Math.abs(o.delta) > 5) throw new Error(`보정 폭은 ±5 이내: ${o.code}.${o.stat} ${o.delta}`);
    const st = draft.get(o.code);
    if (st) st[o.stat] = Math.max(60, Math.min(99, st[o.stat] + o.delta));
  }

  mkdirSync('data/drivers', { recursive: true });
  writeFileSync('data/drivers/draft.json', JSON.stringify({ seasons: SEASONS, weights: WEIGHT, wetRaces: [...WET_RACES], kept, drivers: Object.fromEntries(draft) }, null, 2) + '\n');

  // ── 비교표 ──
  const ovr = (s: Stats) => s.pace * 0.25 + s.racecraft * 0.2 + s.tyre * 0.15 + s.consistency * 0.2 + s.wet * 0.1 + s.feedback * 0.1;
  console.log('\n코드  기준 OVR → 초안 OVR   (pace racecraft tyre consistency wet feedback)');
  for (const c of codes) {
    const a = current.get(c)!.stats, b = draft.get(c)!;
    const diff = STAT_KEYS.map((k) => `${b[k]}${b[k] !== a[k] ? `(${b[k] - a[k] > 0 ? '+' : ''}${b[k] - a[k]})` : ''}`).join(' ');
    console.log(`${c}   ${ovr(a).toFixed(1)} → ${ovr(b).toFixed(1)}   ${diff}`);
  }
  if (kept.length) console.log(`\n기록이 부족해 기존 값 유지: ${kept.join(', ')}`);

  // ── 검증: 2026 시즌을 RUNS번 돌려 실제 순위와 비교(상위 10명 평균 순위 오차) ──
  const standings = (await getJson('2026/driverStandings.json', '2026-standings'))[0].StandingsTable.StandingsLists[0].DriverStandings as any[];
  const actual = standings.map((x) => x.Driver.code as string).filter((c) => codes.includes(c));
  const err = (stats: Map<string, Stats>) => {
    const sum = new Map<string, number>();
    for (let run = 0; run < RUNS; run++) {
      const pts = new Map<string, number>();
      const cars = DRIVERS_2026.map((d: Driver) => carFromDriver({ ...d, stats: stats.get(d.code)! }, TEAMS_2026.find((t) => t.id === d.teamId)!));
      CALENDAR_2026.forEach((circuit, i) => {
        const field = cars.map((x) => ({ ...x, teamQuality: x.teamQuality + teamForm(run, 2026, x.teamId, circuit, i, CALENDAR_2026.length) }));
        const q = simulateQualifying(run * 1000 + i, circuit, field);
        const out = runRace({ seed: run * 1000 + i, circuit, cars: field, grid: q.order, kind: 'race', autoRadio: true });
        if (out.status === 'finished') for (const r of out.classification) pts.set(r.id, (pts.get(r.id) ?? 0) + r.points);
      });
      const order = [...cars].sort((a, b) => (pts.get(b.id) ?? 0) - (pts.get(a.id) ?? 0)).map((x) => x.code);
      order.forEach((c, i) => sum.set(c, (sum.get(c) ?? 0) + i + 1));
    }
    const top = actual.slice(0, 10);
    return top.reduce((a, c, i) => a + Math.abs((sum.get(c) ?? 0) / RUNS - (i + 1)), 0) / top.length;
  };
  const before = err(new Map([...current.values()].map((d) => [d.code, d.stats])));
  const after = err(draft);
  console.log(`\n검증(2026 시즌 ${RUNS}회, 실제 순위 상위 10명 평균 순위 오차): 기준값 ${before.toFixed(2)}계단 → 초안 ${after.toFixed(2)}계단 (목표 3계단 이내)`);

  if (WRITE) {
    let src = readFileSync('src/engine/data.ts', 'utf8');
    for (const c of codes) {
      const s = draft.get(c)!;
      const re = new RegExp(`(d\\('${c}',[^\\[]*\\[)[^\\]]*(\\]\\))`);
      if (!re.test(src)) throw new Error(`data.ts에서 ${c}를 찾지 못함`);
      src = src.replace(re, `$1${STAT_KEYS.map((k) => s[k]).join(', ')}$2`);
    }
    writeFileSync('src/engine/data.ts', src);
    console.log('src/engine/data.ts의 DRIVERS_2026 능력치를 갱신했습니다.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
