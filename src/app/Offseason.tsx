// 시즌 결과 + 오프시즌(SPEC §5.2, §7, §3.3): 결과 요약, 제안 비교, 계약서 서명, 무소속, 은퇴

import { useMemo, useState } from 'react';
import { LADDER, seriesLabel, type Offer, type SeasonRecord } from '../engine';
import { formatMoney } from './format';
import { SignaturePad } from './SignaturePad';
import { SignatureView } from './SignatureView';
import { currentOffseason, useGame, type Signature } from './store';
import { Bar, Button, Card, Pill, SEAT_LABELS } from './ui';

function SeasonSummary({ r }: { r: SeasonRecord }) {
  const { showKrw } = useGame();
  const g = r.growth;
  return (
    <Card title={`${r.year} 시즌 결과 · ${seriesLabel(r.series)}`}>
      <p className="mb-3 text-base font-bold">{r.headline}</p>
      <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
        {[
          ['종합', r.position ? `${r.champion ? '🏆 ' : ''}P${r.position}` : '—'],
          ['출전', r.races], ['우승', r.wins], ['포디움', r.podiums], ['폴', r.poles], ['포인트', r.points],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-xl bg-white/5 p-2"><div className="text-[11px] text-zinc-400">{k}</div><div className="text-lg font-black">{v}</div></div>
        ))}
      </div>
      {r.races > 0 && (
        <p className="mt-3 text-sm text-zinc-300">
          기대 순위 P{r.expectedAvg} → 실제 평균 P{r.actualAvg}{' '}
          <span className={r.expectedAvg - r.actualAvg >= 0 ? 'text-emerald-300' : 'text-red-300'}>
            ({r.expectedAvg - r.actualAvg >= 0 ? '+' : ''}{(r.expectedAvg - r.actualAvg).toFixed(1)})
          </span>
          {r.teammateBeat !== 0.5 && ` · 팀메이트 상대 ${Math.round(r.teammateBeat * 100)}%`}
        </p>
      )}
      <div className="mt-3 text-sm">
        OVR <b>{r.ovrStart} → {r.ovrEnd}</b>{' '}
        <span className="text-zinc-400">(훈련 {g.training} · 경기 {g.racing} · 팀 환경 {g.environment}{g.aging ? ` · 노화 ${g.aging}` : ''})</span>
      </div>
      <div className="mt-1 text-sm text-zinc-400">
        수입 {formatMoney(r.income, showKrw)} · 지출 {formatMoney(r.expenses, showKrw)} · 슈퍼 라이선스 +{r.superLicence}
      </div>
      {r.notes.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-zinc-400">{r.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
    </Card>
  );
}

function ContractModal({ offer, name, firstF1, signature, onCancel, onSigned }: {
  offer: Offer; name: string; firstF1: boolean; signature: Signature; onCancel: () => void; onSigned: (s: Signature) => void;
}) {
  const { showKrw, career } = useGame();
  const [sig, setSig] = useState<Signature | null>(firstF1 ? null : null);
  const [stamped, setStamped] = useState(false);
  const year = (career?.year ?? 0) + 1;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-[#f6f1e7] p-5 text-zinc-900 shadow-2xl">
        <div className="text-center text-xs tracking-[0.3em] text-zinc-500">DRIVER AGREEMENT</div>
        <h2 className="mt-1 text-center text-2xl font-black">드라이버 계약서</h2>
        <dl className="mt-4 grid grid-cols-[6rem_1fr] gap-y-1.5 text-sm">
          <dt className="text-zinc-500">팀</dt><dd className="font-bold">{offer.team}</dd>
          <dt className="text-zinc-500">드라이버</dt><dd className="font-bold">{name}</dd>
          <dt className="text-zinc-500">시리즈</dt><dd>{seriesLabel(offer.series)}</dd>
          <dt className="text-zinc-500">시트</dt><dd>{SEAT_LABELS[offer.seat]}</dd>
          <dt className="text-zinc-500">기간</dt><dd>{year}년부터 {offer.years}시즌</dd>
          {offer.salary > 0 && (<><dt className="text-zinc-500">연봉</dt><dd>{formatMoney(offer.salary, showKrw)}</dd></>)}
          {offer.seatCost > 0 && (<><dt className="text-zinc-500">시트 비용</dt><dd>{formatMoney(offer.seatCost, showKrw)}{offer.management ? ' (매니지먼트 후원)' : ''}</dd></>)}
          <dt className="text-zinc-500">조항</dt><dd>{offer.note}</dd>
        </dl>

        {firstF1 && !sig && (
          <div className="mt-5">
            <p className="mb-2 text-center font-bold">평생 기억할 서명. 첫 F1 계약서에 직접 서명하세요.</p>
            <SignaturePad name={name} onDone={(s) => setSig(s)} doneLabel="서명하기" />
          </div>
        )}

        {(!firstF1 || sig) && (
          <div className="mt-6 grid grid-cols-2 gap-4">
            <div>
              <div className="h-20 border-b border-zinc-400 font-pen text-4xl leading-[5rem] text-zinc-700">{offer.team}</div>
              <div className="mt-1 text-xs text-zinc-500">팀 대표</div>
            </div>
            <div>
              <button
                onClick={() => setStamped(true)}
                disabled={stamped}
                className="flex h-20 w-full items-end border-b border-zinc-400 text-left"
                aria-label="여기를 눌러 서명"
              >
                {stamped ? (
                  <SignatureView sig={sig ?? signature} animate className="h-20 w-full text-zinc-900" />
                ) : (
                  <span className="mb-2 text-sm text-racing">여기를 눌러 서명 ✍️</span>
                )}
              </button>
              <div className="mt-1 text-xs text-zinc-500">드라이버</div>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-between">
          <button onClick={onCancel} className="rounded-xl px-4 py-2 text-sm font-bold text-zinc-600 hover:bg-black/5">취소</button>
          <button
            onClick={() => onSigned(sig ?? signature)}
            disabled={!stamped}
            className="rounded-xl bg-racing px-5 py-2 text-sm font-bold text-white disabled:bg-zinc-300 disabled:text-zinc-500"
          >
            계약 확정
          </button>
        </div>
      </div>
    </div>
  );
}

function OfferCard({ o, onPick }: { o: Offer; onPick: () => void }) {
  const { showKrw } = useGame();
  return (
    <div className={`rounded-xl border p-3 ${o.series === 'f1' && o.seat === 'race' ? 'border-racing/60 bg-racing/5' : 'border-white/10'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-black">{o.team}</span>
        <Pill tone={o.series === 'f1' ? 'red' : 'zinc'}>{seriesLabel(o.series)}</Pill>
        <Pill tone={o.seat === 'race' ? 'green' : 'amber'}>{SEAT_LABELS[o.seat]}</Pill>
        {o.management && <Pill tone="amber">매니지먼트 후원</Pill>}
      </div>
      <p className="mt-1 text-sm text-zinc-400">{o.note}</p>
      <div className="mt-2 grid grid-cols-2 gap-3 text-xs text-zinc-400">
        <div>팀 성능<Bar value={o.teamQuality} max={1} color="bg-sky-400" /></div>
        <div>시설(훈련 효율)<Bar value={o.facility} max={1} color="bg-emerald-400" /></div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        {o.salary > 0 && <span>연봉 <b>{formatMoney(o.salary, showKrw)}</b></span>}
        {o.seatCost > 0 && <span>시트 비용 <b>{formatMoney(o.seatCost, showKrw)}</b></span>}
        <span>{o.years}시즌</span>
        <Button className="ml-auto" onClick={onPick} disabled={!o.affordable}>{o.affordable ? (o.id === 'stay' ? '계약 유지' : '계약서 보기') : '자금 부족'}</Button>
      </div>
    </div>
  );
}

export function Offseason() {
  const { career: c, lastRecord, signature, acceptOffer, skipSeat, retire } = useGame();
  const off = useMemo(() => (c ? currentOffseason(c) : null), [c]);
  const [joinAcademy, setJoinAcademy] = useState(true);
  const [picked, setPicked] = useState<Offer | null>(null);
  if (!c) return null;
  const record = lastRecord && lastRecord.year === c.year ? lastRecord : c.history[c.history.length - 1];
  if (!off || !record) return null;
  const rank = (o: Offer) => (o.series === 'f1' && o.seat === 'race' ? 100 : 0) + LADDER.indexOf(o.series) * 10 + (o.seat === 'race' ? 5 : 0) + o.teamQuality;
  const offers = [...off.offers].sort((a, b) => rank(b) - rank(a));
  const firstF1 = (o: Offer) => o.series === 'f1' && o.seat === 'race' && c.f1Debut === null;
  const sig = signature ?? { strokes: [], typed: c.driver.name };

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <SeasonSummary r={record} />

      <Card title={`${c.year} 오프시즌 · ${c.year + 1} 시즌 제안`}>
        {off.released && <div className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm font-bold text-red-200">방출 통보를 받았습니다.</div>}
        {off.notes.length > 0 && <ul className="mb-3 list-disc pl-5 text-sm text-zinc-300">{off.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        {off.academyOffer && (
          <label className="mb-3 flex items-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/10 p-3 text-sm">
            <input type="checkbox" checked={joinAcademy} onChange={(e) => setJoinAcademy(e.target.checked)} />
            <span><b>{off.academyOffer}</b>가 영입을 제안했습니다. 하부 리그 시트 비용을 지원하고 F1 계열 팀 우선권이 생깁니다.</span>
          </label>
        )}
        <div className="space-y-2">
          {offers.length === 0 && <p className="text-sm text-zinc-400">들어온 제안이 없습니다.</p>}
          {offers.map((o) => (
            <OfferCard key={o.id} o={o} onPick={() => (o.id === 'stay' ? acceptOffer(o, joinAcademy, null) : setPicked(o))} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap justify-between gap-2">
          <Button variant="ghost" onClick={() => skipSeat(joinAcademy)}>시트 없이 1년 보내기</Button>
          <Button variant="danger" onClick={() => { if (confirm('은퇴를 선언할까요? 되돌릴 수 없습니다.')) retire(); }}>은퇴 선언</Button>
        </div>
      </Card>

      {picked && (
        <ContractModal
          offer={picked}
          name={c.driver.name}
          firstF1={firstF1(picked)}
          signature={sig}
          onCancel={() => setPicked(null)}
          onSigned={(s) => { acceptOffer(picked, joinAcademy, s); setPicked(null); }}
        />
      )}
    </div>
  );
}
