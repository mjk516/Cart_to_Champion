// 은퇴 화면(SPEC §9): 커리어 카드, 세부 능력치(최종·최고·숨은 값 공개), 성장 곡선, 시리즈별 기록, 시즌별 상세, 계약서 보관함

import { Fragment, useMemo, useState, type PointerEvent } from 'react';
import {
  generateCandidates, LADDER, ovr, PERSONALITIES, seriesLabel, STAT_KEYS,
  type Career, type SeriesId, type StatKey, type Stats,
} from '../engine';
import { formatMoney, nameAside } from './format';
import { SignatureView } from './SignatureView';
import { useGame } from './store';
import { Bar, Button, Card, Pill, SEAT_LABELS, STAT_LABELS, TEMPERAMENT_LABELS } from './ui';

const GROWTH_TYPE: Record<string, string> = { early: '조기 개화형', standard: '표준형', late: '대기만성형', longevity: '장기 유지형' };
const LINE = '#f43f3a'; // 어두운 카드 배경(#18181b) 위 대비 검증 통과(dataviz validate_palette)
const SURFACE = '#18181b';

type Measure = 'ovr' | StatKey;

interface Point { x: number; year: number; age: number; label: string; series: string; team: string; stats: Stats | null; ovr: number }

/** 시작 시점 + 시즌마다 끝난 시점의 능력치 */
function careerPoints(c: Career): Point[] {
  const start = generateCandidates(c.setup.seed, c.setup.personality, c.setup.reroll ?? 0)[c.setup.candidateIndex]?.stats ?? null;
  const pts: Point[] = [{ x: 0, year: c.history[0]?.year ?? c.year, age: 12, label: '시작', series: '카트', team: '', stats: start, ovr: start ? ovr(start) : c.history[0]?.ovrStart ?? 45 }];
  c.history.forEach((h, i) => {
    pts.push({
      x: i + 1, year: h.year, age: h.age, label: `${h.year} 시즌 후`, series: seriesLabel(h.series),
      team: h.team ?? '시트 없음', stats: h.statsEnd ?? null, ovr: h.ovrEnd,
    });
  });
  return pts;
}

function valueOf(p: Point, m: Measure): number | null {
  if (m === 'ovr') return p.ovr;
  return p.stats ? p.stats[m] : null;
}

const fmt = (v: number) => v.toFixed(v % 1 ? 1 : 0);

function GrowthChart({ c }: { c: Career }) {
  const [measure, setMeasure] = useState<Measure>('ovr');
  const [hover, setHover] = useState<number | null>(null);
  const pts = useMemo(() => careerPoints(c), [c]);
  const series = pts.map((p) => ({ p, v: valueOf(p, measure) })).filter((d): d is { p: Point; v: number } => d.v !== null);
  const W = 640, H = 240, L = 36, R = 16, T = 20, B = 28;
  const maxX = Math.max(1, pts.length - 1);
  const vals = series.map((d) => d.v);
  const lo = Math.max(0, Math.floor((Math.min(...vals, 100) - 4) / 5) * 5);
  const hi = Math.min(100, Math.ceil((Math.max(...vals, 0) + 4) / 5) * 5);
  const x = (i: number) => L + (i / maxX) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - T - B);
  const path = series.map((d, i) => `${i ? 'L' : 'M'}${x(d.p.x).toFixed(1)},${y(d.v).toFixed(1)}`).join(' ');
  // 눈금은 보기 좋은 간격(범위가 좁으면 5, 넓으면 10)으로
  const step = hi - lo <= 25 ? 5 : 10;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  const lastAge = pts[pts.length - 1]?.age ?? 0;
  // 5세 간격 + 처음·끝. 끝 눈금과 2세 안쪽으로 붙는 눈금은 겹치므로 뺀다
  const ageTicks = pts.filter((p, i) => i === 0 || i === pts.length - 1 || (p.age % 5 === 0 && lastAge - p.age > 2 && p.x > 1));
  const hovered = hover !== null ? series.find((d) => d.p.x === hover) : undefined;
  const peak = series.reduce((a, d) => (d.v > a.v ? d : a), series[0] ?? { p: pts[0]!, v: 0 });
  const last = series[series.length - 1];
  const name = measure === 'ovr' ? 'OVR' : STAT_LABELS[measure];

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(maxX, Math.round(((e.clientX - r.left) / r.width) * maxX))));
  };

  return (
    <Card title={`성장 곡선 · ${name}`}>
      <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="보여 줄 능력치">
        {(['ovr', ...STAT_KEYS] as Measure[]).map((m) => (
          <button key={m} role="tab" aria-selected={measure === m} onClick={() => setMeasure(m)}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold ${measure === m ? 'bg-white/15 text-white' : 'text-zinc-400 hover:bg-white/5'}`}>
            {m === 'ovr' ? 'OVR' : STAT_LABELS[m]}
          </button>
        ))}
      </div>
      {series.length < 2 ? (
        <p className="text-sm text-zinc-400">이 능력치는 기록이 부족합니다(이전 버전 저장 파일).</p>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
            aria-label={`${name} 변화: 시작 ${fmt(series[0]!.v)}, 최고 ${fmt(peak.v)}(${peak.p.age}세), 은퇴 ${fmt(last!.v)}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.08)" />
                <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#a1a1aa">{Math.round(t)}</text>
              </g>
            ))}
            {ageTicks.map((p) => (
              <text key={p.x} x={x(p.x)} y={H - 8} textAnchor="middle" fontSize={11} fill="#a1a1aa">{p.x === 0 ? '시작' : `${p.age}세`}</text>
            ))}
            <path d={path} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {/* 선택적 직접 라벨: 최고점과 은퇴 값만 */}
            <circle cx={x(peak.p.x)} cy={y(peak.v)} r={4} fill={LINE} stroke={SURFACE} strokeWidth={2} />
            <text x={x(peak.p.x)} y={y(peak.v) - 9} textAnchor="middle" fontSize={11} fill="#e4e4e7">최고 {fmt(peak.v)}</text>
            {last && last.p.x !== peak.p.x && (
              <text x={x(last.p.x) - 4} y={y(last.v) + 16} textAnchor="end" fontSize={11} fill="#a1a1aa">은퇴 {fmt(last.v)}</text>
            )}
            {hovered && (
              <g pointerEvents="none">
                <line x1={x(hovered.p.x)} x2={x(hovered.p.x)} y1={T} y2={H - B} stroke="rgba(255,255,255,0.25)" />
                <circle cx={x(hovered.p.x)} cy={y(hovered.v)} r={5} fill={LINE} stroke={SURFACE} strokeWidth={2} />
              </g>
            )}
            <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
          </svg>
          {hovered && (
            <div className="pointer-events-none absolute top-0 rounded-lg border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs shadow-lg"
              style={{ left: `${(x(hovered.p.x) / W) * 100}%`, transform: `translateX(${hovered.p.x > maxX / 2 ? '-105%' : '5%'})` }}>
              <div className="font-bold text-zinc-100">{hovered.p.label} · {hovered.p.age}세</div>
              <div className="text-zinc-400">{hovered.p.series}{hovered.p.team ? ` · ${hovered.p.team}` : ''}</div>
              <div className="mt-1 text-zinc-100">{name} <b>{fmt(hovered.v)}</b></div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function DetailedStats({ c }: { c: Career }) {
  const pts = useMemo(() => careerPoints(c), [c]);
  const d = c.driver;
  const h = d.hidden;
  const pdef = PERSONALITIES[d.personality];
  const temper = TEMPERAMENT_LABELS[pdef.temperament]!;
  const peakOf = (k: Measure) => pts.reduce<{ v: number; age: number } | null>((a, p) => {
    const v = valueOf(p, k);
    return v !== null && (!a || v > a.v) ? { v, age: p.age } : a;
  }, null);
  const ovrPeak = peakOf('ovr');
  return (
    <Card title="세부 능력치">
      <div className="mb-4 flex items-end gap-6">
        <div><div className="text-xs text-zinc-400">은퇴 시 OVR</div><div className="text-3xl font-black">{ovr(d.stats).toFixed(1)}</div></div>
        {ovrPeak && <div><div className="text-xs text-zinc-400">최고 OVR</div><div className="text-3xl font-black text-racing">{ovrPeak.v.toFixed(1)}</div><div className="text-xs text-zinc-500">{ovrPeak.age}세</div></div>}
      </div>
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {STAT_KEYS.map((k) => {
          const pk = peakOf(k);
          return (
            <div key={k}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="whitespace-nowrap">{STAT_LABELS[k]}</span>
                <b className="text-base">{d.stats[k]}</b>
              </div>
              <div className="relative mt-1">
                <Bar value={d.stats[k]} />
                {pk && <div className="absolute top-[-2px] h-3 w-0.5 bg-white/70" style={{ left: `${pk.v}%` }} />}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-zinc-400">
                <span>{pk ? `최고 ${pk.v} · ${pk.age}세` : ''}</span>
                {d.focus.includes(k) && <span className="text-racing">집중 육성</span>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">막대는 은퇴 시 값, 흰 선은 커리어 최고값입니다.</p>

      <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="mb-2 text-sm font-bold text-zinc-300">숨겨진 재능 공개</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <div><div className="text-xs text-zinc-400">잠재력</div><b>{h.potential}</b></div>
          <div><div className="text-xs text-zinc-400">성장형</div><b>{GROWTH_TYPE[h.growthType] ?? h.growthType}</b></div>
          <div><div className="text-xs text-zinc-400">전성기 종료</div><b>{h.peakEnd}세</b></div>
          <div><div className="text-xs text-zinc-400">압박 내성</div><b>{h.pressureResist}</b></div>
          <div><div className="text-xs text-zinc-400">부상 내성</div><b>{h.injuryResist}</b></div>
          <div><div className="text-xs text-zinc-400">성격</div><b>{pdef.label}</b> <Pill tone={temper.tone}>{temper.label}</Pill></div>
        </div>
      </div>
    </Card>
  );
}

function SeriesSummary({ c }: { c: Career }) {
  const rows = LADDER.map((s) => {
    const hs = c.history.filter((h) => h.series === s && h.seat === 'race');
    if (!hs.length) return null;
    const best = Math.min(...hs.map((h) => h.position ?? 99));
    return {
      s, seasons: hs.length, races: hs.reduce((a, h) => a + h.races, 0), wins: hs.reduce((a, h) => a + h.wins, 0),
      podiums: hs.reduce((a, h) => a + h.podiums, 0), poles: hs.reduce((a, h) => a + h.poles, 0),
      titles: hs.filter((h) => h.champion).length, best: best < 99 ? best : null,
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null);
  const reserve = c.history.filter((h) => h.seat === 'reserve').length;
  const none = c.history.filter((h) => h.seat === 'none').length;
  return (
    <Card title="시리즈별 기록">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-xs text-zinc-400">
            <tr><th className="py-1 text-left">시리즈</th><th>시즌</th><th>출전</th><th>우승</th><th>포디움</th><th>폴</th><th>타이틀</th><th>최고 순위</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.s} className="border-t border-white/5 text-center">
                <td className="py-1.5 text-left font-bold">{seriesLabel(r.s as SeriesId)}</td>
                <td>{r.seasons}</td><td>{r.races}</td><td>{r.wins}</td><td>{r.podiums}</td><td>{r.poles}</td>
                <td>{r.titles ? `🏆 ${r.titles}` : '—'}</td><td>{r.best ? `P${r.best}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(reserve > 0 || none > 0) && <p className="mt-2 text-xs text-zinc-400">리저브 {reserve}시즌 · 시트 없이 보낸 시즌 {none}</p>}
    </Card>
  );
}

function SeasonTable({ c }: { c: Career }) {
  const { showKrw } = useGame();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Card title="시즌별 상세">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-xs text-zinc-400">
            <tr>
              <th className="py-1 text-left">연도</th><th className="text-left">나이</th><th className="text-left">시리즈</th><th className="text-left">팀</th>
              <th>순위</th><th>출전</th><th>승</th><th>포디움</th><th>폴</th><th>포인트</th><th>OVR</th><th className="text-right">자금</th>
            </tr>
          </thead>
          <tbody>
            {c.history.map((h) => {
              const delta = h.ovrEnd - h.ovrStart;
              const isOpen = open === h.year;
              return (
                <Fragment key={h.year}>
                  <tr onClick={() => setOpen(isOpen ? null : h.year)} className="cursor-pointer border-t border-white/5 text-center hover:bg-white/5" aria-expanded={isOpen}>
                    <td className="py-1.5 text-left">{h.year}</td><td className="text-left">{h.age}</td>
                    <td className="text-left">{seriesLabel(h.series)}</td>
                    <td className="max-w-[11rem] truncate text-left">{h.military ? '🎖 군 복무' : h.team ?? '—'}{h.seat !== 'race' && !h.military && <span className="text-zinc-500"> ({SEAT_LABELS[h.seat]})</span>}</td>
                    <td>{h.position ? `${h.champion ? '🏆 ' : ''}P${h.position}` : '—'}</td>
                    <td>{h.races}</td><td>{h.wins}</td><td>{h.podiums}</td><td>{h.poles}</td><td>{h.points}</td>
                    <td>{h.ovrEnd.toFixed(1)} <span className={delta >= 0 ? 'text-emerald-300' : 'text-red-300'}>{delta >= 0 ? '+' : ''}{delta.toFixed(1)}</span></td>
                    <td className="text-right">{formatMoney(h.fundsEnd, false)}</td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-white/[0.03]">
                      <td colSpan={12} className="px-2 py-2 text-xs text-zinc-300">
                        <div className="font-bold text-zinc-100">{h.headline}</div>
                        <div className="mt-1">
                          성장: 훈련 {h.growth.training} · 경기 {h.growth.racing} · 팀 환경 {h.growth.environment}{h.growth.aging ? ` · 노화 ${h.growth.aging}` : ''}
                          {h.races > 0 && ` · 기대 P${h.expectedAvg} → 실제 평균 P${h.actualAvg}`}
                          {h.h2h ? ` · vs ${h.h2h.mate} 결승 ${h.h2h.race[0]}-${h.h2h.race[1]}` : h.teammateBeat !== 0.5 && ` · 팀메이트 상대 ${Math.round(h.teammateBeat * 100)}%`}
                        </div>
                        <div className="mt-1">수입 {formatMoney(h.income, showKrw)} · 지출 {formatMoney(h.expenses, showKrw)} · 슈퍼 라이선스 +{h.superLicence}</div>
                        {h.statsEnd && <div className="mt-1 text-zinc-400">{STAT_KEYS.map((k) => `${STAT_LABELS[k]} ${h.statsEnd![k]}`).join(' · ')}</div>}
                        {h.notes.length > 0 && <div className="mt-1 text-zinc-400">{h.notes.join(' / ')}</div>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">시즌을 누르면 성장 내역, 수입·지출, 그 시즌의 세부 능력치가 열립니다.</p>
    </Card>
  );
}

export function Retired() {
  const { career: c, firstF1Signature, signature, contracts, showKrw, go, reset } = useGame();
  if (!c) return null;
  const t = c.totals;
  const sig = firstF1Signature ?? signature;
  const f1Seasons = c.history.filter((h) => h.series === 'f1' && h.seat === 'race');
  const bestF1 = f1Seasons.reduce<(typeof f1Seasons)[number] | null>((a, h) => (h.position && (!a || h.position < (a.position ?? 99)) ? h : a), null);
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <Card className="bg-gradient-to-br from-zinc-900 to-racing/30">
        <div className="text-xs tracking-[0.3em] text-zinc-400">CAREER CARD</div>
        <h1 className="mt-1 text-3xl font-black">{c.driver.name}</h1>
        {nameAside(c.driver) && <div className="text-sm text-zinc-300">{nameAside(c.driver)}</div>}
        <div className="mt-1 flex flex-wrap gap-2">
          <Pill>{PERSONALITIES[c.driver.personality].label}</Pill>
          <Pill>{c.age}세 은퇴 · {c.history.length}시즌</Pill>
          {c.f1Debut && <Pill tone="red">F1 데뷔 {c.f1Debut}</Pill>}
          {c.academy && <Pill tone="blue">{c.academy}</Pill>}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
          {[
            ['월드 챔피언', t.f1Titles], ['F1 출전', t.f1Starts], ['F1 우승', t.f1Wins],
            ['포디움', t.f1Podiums], ['폴', t.f1Poles], ['최고 OVR', t.bestOvr],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-xl bg-black/30 p-2"><div className="text-[11px] text-zinc-400">{k}</div><div className="text-2xl font-black">{v}</div></div>
          ))}
        </div>
        <div className="mt-3 text-sm text-zinc-300">
          주니어 타이틀: {t.juniorTitles.length ? t.juniorTitles.join(', ') : '없음'} · 통산 수입 {formatMoney(t.earnings, showKrw)} · 방출 {t.releases}회
          {bestF1 && ` · F1 최고 시즌 ${bestF1.year} P${bestF1.position}`}
        </div>
        {sig && (
          <div className="mt-4 max-w-xs rounded-xl bg-[#f6f1e7] p-2 text-zinc-900">
            <SignatureView sig={sig} className="h-16 w-full" />
            <div className="text-center text-[11px] text-zinc-500">{firstF1Signature ? '첫 F1 계약 서명' : '서명'}</div>
          </div>
        )}
      </Card>

      <DetailedStats c={c} />
      <GrowthChart c={c} />
      <SeriesSummary c={c} />
      <SeasonTable c={c} />

      <Card title={`계약서 보관함 (${contracts.length})`}>
        {contracts.length === 0 ? <p className="text-sm text-zinc-400">서명한 계약서가 없습니다.</p> : (
          <div className="grid gap-2 sm:grid-cols-2">
            {contracts.map((k, i) => (
              <div key={i} className="rounded-xl bg-[#f6f1e7] p-3 text-zinc-900">
                <div className="text-xs text-zinc-500">{k.year} · {seriesLabel(k.series as SeriesId)} · {SEAT_LABELS[k.seat]}{k.firstF1 ? ' · 첫 F1 계약' : ''}</div>
                <div className="font-black">{k.team}</div>
                <SignatureView sig={k.signature} className="h-10 w-40" />
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex justify-center gap-2"><Button variant="ghost" onClick={() => go('records')}>업적·기록</Button><Button onClick={() => { reset(); go('create'); }}>새 커리어 시작</Button></div>
    </div>
  );
}
