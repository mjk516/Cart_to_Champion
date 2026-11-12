// 그랑프리 결승 뒤(SPEC v0.36): 결과 기사 한 편과 SNS 글 고르기. 고른 글은 시즌을 마칠 때 언론 지표에 반영된다.

import { circuitById, f1Calendar, myRaceResult, raceArticle, snsOptions, snsReaction, type Career, type Circuit, type Classified, type Incident, type RaceCar, type RaceHighlight } from '../engine';
import { nationName } from './Create';
import { Pill } from './ui';

const ME = 'player';

export function gpName(c: Career, circuit: Circuit, calendar: Circuit[]): string {
  const dup = calendar.filter((x) => x.country === circuit.country).length > 1;
  return dup ? `${circuit.name} 그랑프리` : `${nationName(circuit.country)} 그랑프리`;
}

function effectPills(e: { followersMul: number; sentiment: number; pressure: number; reputation: number }) {
  const out: Array<{ t: string; tone: 'green' | 'amber' | 'zinc' }> = [];
  const f = Math.round((e.followersMul - 1) * 1000) / 10;
  if (f) out.push({ t: `팔로워 +${f}%`, tone: 'green' });
  if (e.sentiment) out.push({ t: `팬 여론 ${e.sentiment > 0 ? '+' : ''}${e.sentiment}`, tone: e.sentiment > 0 ? 'green' : 'amber' });
  if (e.reputation) out.push({ t: `언론 평판 ${e.reputation > 0 ? '+' : ''}${e.reputation}`, tone: e.reputation > 0 ? 'green' : 'amber' });
  if (e.pressure) out.push({ t: `압박 ${e.pressure > 0 ? '+' : ''}${e.pressure}`, tone: e.pressure > 0 ? 'amber' : 'green' });
  return out;
}

export function RaceAftermath({ c, round, kind = 'race', gp, rows, incidents, cars, chosen, onPick }: {
  c: Career; round: number; kind?: 'race' | 'sprint'; gp: string; rows: Classified[]; incidents: Incident[]; cars: RaceCar[];
  chosen: string | undefined; onPick: (id: string) => void;
}) {
  const mateId = cars.find((x) => x.teamId === c.contract?.teamId && x.id !== ME)?.id;
  const res = myRaceResult(rows, ME, mateId);
  if (!res) return null;
  const nameOf = (id: string) => (id === ME ? c.driver.name : c.world.drivers.find((d) => d.id === id)?.name ?? id);
  const article = raceArticle(c, res, {
    gp: kind === 'sprint' ? `${gp} 스프린트` : gp, round, kind, name: c.driver.name, team: c.contract?.team ?? '', winnerName: nameOf(res.winnerId),
    mateName: mateId ? nameOf(mateId) : undefined,
    neutralizations: incidents.filter((i) => i.type === 'sc_deploy' || i.type === 'vsc_deploy' || i.type === 'red_flag').length,
    retired: incidents.flatMap((i) => ((i.type === 'crash' || i.type === 'mech_dnf') && i.car !== ME ? [nameOf(i.car)] : [])),
  });
  const options = snsOptions(c, res, gp);
  const picked = chosen ? options.find((o) => o.id === chosen) : undefined;
  const reaction = picked ? snsReaction(c, res, picked.id) : null;
  return (
    <div className={`mt-4 grid gap-3 ${kind === 'race' ? 'md:grid-cols-2' : ''}`}>
      <article aria-label={kind === 'sprint' ? '스프린트 기사' : '레이스 기사'} className="rounded-xl border border-white/10 bg-[#f6f1e7] p-4 text-zinc-900">
        <div className="text-[11px] font-bold tracking-widest text-zinc-500">📰 {article.outlet}</div>
        <h3 className="mt-1 text-lg font-black leading-snug">{article.headline}</h3>
        <div className="mt-2 space-y-1.5 text-sm leading-relaxed text-zinc-700">{article.body.map((p, i) => <p key={i}>{p}</p>)}</div>
      </article>
      {kind === 'race' && <section aria-label="SNS 게시" className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="mb-2 text-sm font-bold">📱 레이스 소감을 SNS에 올릴까?</div>
        {picked && reaction ? (
          <div>
            <div className="rounded-xl bg-black/30 p-3">
              <div className="text-xs text-zinc-400">@{c.driver.name.replace(/\s+/g, '')} · {picked.label}</div>
              <p className="mt-1 text-sm text-zinc-100">{picked.text}</p>
            </div>
            <p className="mt-2 text-sm text-zinc-300">{reaction.reaction}</p>
            <div className="mt-2 flex flex-wrap gap-1">{effectPills(reaction.effect).map((p) => <Pill key={p.t} tone={p.tone}>{p.t}</Pill>)}</div>
            <p className="mt-2 text-[11px] text-zinc-500">팬·언론 반응은 시즌을 마칠 때 반영됩니다.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {options.map((o) => (
              <button key={o.id} onClick={() => onPick(o.id)} className={`w-full rounded-xl border p-2.5 text-left hover:bg-white/5 ${o.signature ? 'border-sky-400/50' : 'border-white/15'}`}>
                <div className="text-xs font-bold">{o.label}{o.signature && <span className="ml-1 text-sky-300">· 성격다운 글</span>}</div>
                <div className="mt-0.5 text-sm text-zinc-300">{o.text}</div>
              </button>
            ))}
          </div>
        )}
      </section>}
    </div>
  );
}

/** 시즌 결과의 주요 결승 기사(SPEC v0.38): 한 번에 진행한 시즌에도 나온다 */
export function SeasonArticles({ c, year, team, highlights }: { c: Career; year: number; team: string; highlights: RaceHighlight[] }) {
  const cal = f1Calendar(c);
  const items = highlights.map((h) => {
    let circuit: Circuit | null = null;
    try { circuit = circuitById(h.circuitId); } catch { /* 알 수 없는 서킷 */ }
    const gp = circuit ? gpName(c, circuit, cal) : `${h.round + 1}라운드`;
    const a = raceArticle({ ...c, year }, h.result, {
      gp, round: h.round, name: c.driver.name, team, winnerName: h.winnerName, mateName: h.mateName,
      neutralizations: h.neutralizations, retired: h.retired,
    });
    return { h, a };
  });
  if (!items.length) return null;
  return (
    <section aria-label="시즌 주요 기사" className="mt-4">
      <h3 className="mb-2 text-sm font-bold">📰 시즌 주요 기사</h3>
      <div className="space-y-2">
        {items.map(({ h, a }, i) => (
          <details key={h.round} open={i === 0} className="rounded-xl border border-white/10 bg-[#f6f1e7] p-3 text-zinc-900">
            <summary className="cursor-pointer list-none">
              <span className="text-[11px] font-bold tracking-widest text-zinc-500">{h.round + 1}라운드 · {a.outlet}</span>
              <span className="mt-0.5 block font-black leading-snug">{a.headline}</span>
            </summary>
            <div className="mt-2 space-y-1.5 text-sm leading-relaxed text-zinc-700">{a.body.map((p, j) => <p key={j}>{p}</p>)}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
