// 시즌 결과 + 오프시즌(SPEC §5.2, §7, §3.3): 결과 요약, 제안 비교, 계약서 서명, 무소속, 은퇴

import { useMemo, useState } from 'react';
import {
  EVENT_CATEGORY_LABEL, LADDER, MANAGER_STYLE_LABEL, managerAdvice, newAchievements, pendingEventCards, seriesLabel, VERDICT_LABEL,
  type ManagerAdvice, type Offer, type OfferAdvice, type SeasonRecord, type F1Standings, type EnduranceResult, enduranceLine, PLAYER_ID,
  draftedNext, seasonChatter,
} from '../engine';
import { FeedList, RollingComments } from './FeedList';
import { formatMoney } from './format';
import { SignaturePad } from './SignaturePad';
import { SignatureView } from './SignatureView';
import { F1TeamBadge } from './TeamBadge';
import { Tip } from './Guide';
import { currentOffseason, useGame, type Signature } from './store';
import { Bar, Button, Card, Pill, SEAT_LABELS, useConfirm } from './ui';

/** 이벤트 결과 요약의 색: 좋은 변화는 초록, 나쁜 변화는 주황. 압박은 오를수록 나쁘다 */
function effectTone(s: string): 'green' | 'amber' | 'zinc' {
  const up = s.includes('+') || s.includes('증가') || s.includes('단단') || s.includes('합류');
  const down = s.includes('−') || / -\d/.test(s) || s.includes('흔들림');
  const inverted = s.startsWith('압박');
  if (s.includes('방출 위험 증가')) return 'amber';
  if (up) return inverted ? 'amber' : 'green';
  if (down) return inverted ? 'green' : 'amber';
  return 'zinc';
}

/** F1 시즌 최종 순위: 월드 챔피언십(드라이버)·컨스트럭터 (SPEC v0.34) */
function StandingsTables({ st, me }: { st: F1Standings; me: string }) {
  const [all, setAll] = useState(false);
  const drivers = all ? st.drivers : st.drivers.slice(0, 10);
  const myRow = st.drivers.findIndex((d) => d.id === me);
  const mine = st.drivers[myRow];
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <section aria-label="드라이버 챔피언십 순위" className="rounded-xl border border-white/10 bg-white/5 p-3">
        <h3 className="mb-2 text-sm font-bold">🏆 드라이버 월드 챔피언십</h3>
        <ol className="space-y-1 text-sm">
          {drivers.map((d, i) => (
            <li key={d.id} className={`flex items-center gap-2 rounded-lg px-2 py-1 ${d.id === me ? 'bg-racing/20 font-bold' : ''}`}>
              <span className="w-6 text-right text-zinc-400">{i + 1}</span>
              <F1TeamBadge teamId={d.teamId} size={18} />
              <span className="min-w-0 flex-1 truncate">{i === 0 ? '👑 ' : ''}{d.name}</span>
              {d.wins > 0 && <span className="text-[11px] text-zinc-400">{d.wins}승</span>}
              <span className="w-12 text-right tabular-nums">{d.points}</span>
            </li>
          ))}
          {!all && mine && myRow >= 10 && (
            <li className="flex items-center gap-2 rounded-lg bg-racing/20 px-2 py-1 font-bold">
              <span className="w-6 text-right text-zinc-400">{myRow + 1}</span>
              <F1TeamBadge teamId={mine.teamId} size={18} />
              <span className="min-w-0 flex-1 truncate">{mine.name}</span>
              <span className="w-12 text-right tabular-nums">{mine.points}</span>
            </li>
          )}
        </ol>
        {st.drivers.length > 10 && (
          <button onClick={() => setAll(!all)} className="mt-2 text-xs text-zinc-400 underline">{all ? '10위까지만 보기' : `전체 ${st.drivers.length}명 보기`}</button>
        )}
      </section>
      <section aria-label="컨스트럭터 챔피언십 순위" className="rounded-xl border border-white/10 bg-white/5 p-3">
        <h3 className="mb-2 text-sm font-bold">🏭 컨스트럭터 챔피언십</h3>
        <ol className="space-y-1 text-sm">
          {st.teams.map((t, i) => (
            <li key={t.teamId} className={`flex items-center gap-2 rounded-lg px-2 py-1 ${t.teamId === mine?.teamId ? 'bg-racing/20 font-bold' : ''}`}>
              <span className="w-6 text-right text-zinc-400">{i + 1}</span>
              <F1TeamBadge teamId={t.teamId} size={18} />
              <span className="min-w-0 flex-1 truncate">{i === 0 ? '👑 ' : ''}{t.name}</span>
              <span className="w-12 text-right tabular-nums">{t.points}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function EnduranceCard({ e }: { e: EnduranceResult }) {
  const podium = e.position !== null && e.position <= 3;
  const medal = e.position === 1 ? '🥇' : e.position === 2 ? '🥈' : e.position === 3 ? '🥉' : '🏁';
  const gained = Object.keys(e.gains).length > 0;
  return (
    <div aria-label="내구레이스 결과" className={`mt-3 rounded-xl border p-3 text-sm ${podium ? 'border-amber-400/50 bg-amber-400/10' : 'border-white/10 bg-white/5'}`}>
      <div className="font-bold">{medal} {e.when} · {e.name}</div>
      <div className="mt-1 text-zinc-200">{enduranceLine(e)}</div>
      {podium && gained && <div className="mt-1 text-xs text-amber-200">포디움에 올라 능력치가 실제로 올랐습니다.</div>}
      {podium && !gained && <div className="mt-1 text-xs text-zinc-400">이미 최고치라 더 오를 능력치가 없었습니다.</div>}
    </div>
  );
}

function SeasonSummary({ r }: { r: SeasonRecord }) {
  const { showKrw, career, go } = useGame();
  const g = r.growth;
  const unlocked = career ? newAchievements(career, r.year) : [];
  return (
    <Card title={`${r.year} 시즌 결과 · ${seriesLabel(r.series)}`}>
      <p className="mb-3 text-base font-bold">{r.headline}</p>
      {unlocked.length > 0 && (
        <button onClick={() => go('records')} className="mb-3 flex w-full flex-wrap items-center gap-1 rounded-xl border border-amber-400/40 bg-amber-400/5 p-2 text-left text-sm">
          <span className="font-bold text-amber-300">새 업적</span>
          {unlocked.map((a) => <Pill key={a.id} tone="amber">🏅 {a.title}</Pill>)}
        </button>
      )}
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
      {r.endurance && <EnduranceCard e={r.endurance} />}
      {r.f1Standings && <StandingsTables st={r.f1Standings} me={PLAYER_ID} />}
      {r.notes.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-zinc-400">{r.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      {r.feed && r.feed.length > 0 && <div className="mt-4"><FeedList items={r.feed} />{career && <RollingComments comments={seasonChatter(career, r)} />}</div>}
    </Card>
  );
}

function ContractModal({ offer, name, firstF1, signature, onCancel, onSigned }: {
  offer: Offer; name: string; firstF1: boolean; signature: Signature; onCancel: () => void; onSigned: (s: Signature) => void;
}) {
  const { showKrw, career, firstF1Signature } = useGame();
  const [sig, setSig] = useState<Signature | null>(null);
  const [stamped, setStamped] = useState(false);
  const year = (career?.year ?? 0) + 1;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-[#f6f1e7] p-5 text-zinc-900 shadow-2xl">
        <div className="text-center text-xs tracking-[0.3em] text-zinc-500">DRIVER AGREEMENT</div>
        <h2 className="mt-1 text-center text-2xl font-black">드라이버 계약서</h2>
        <dl className="mt-4 grid grid-cols-[6rem_1fr] gap-y-1.5 text-sm">
          <dt className="text-zinc-500">팀</dt><dd className="flex items-center gap-2 font-bold">{offer.series === 'f1' && <F1TeamBadge teamId={offer.teamId} size={22} />}{offer.team}</dd>
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
              <div className="mt-1 text-xs text-zinc-500">{!firstF1 && firstF1Signature ? '드라이버 · 첫 F1 계약 때의 서명' : '드라이버'}</div>
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

function ManagerCard({ a }: { a: ManagerAdvice }) {
  const m = a.manager;
  return (
    <div className="mb-4 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-sm font-black text-sky-200" aria-hidden>{m.name.slice(0, 1)}</div>
        <div className="min-w-0">
          <div className="text-sm font-bold">매니저 {m.name}</div>
          <div className="text-xs text-zinc-400">{MANAGER_STYLE_LABEL[m.style]} · 능력 {'★'.repeat(m.skill)}{'☆'.repeat(5 - m.skill)}</div>
        </div>
      </div>
      <p className="mt-2 text-sm text-zinc-100">“{a.headline}”</p>
      {a.release && <p className="mt-1 text-sm text-red-200">“{a.release}”</p>}
      {a.academy && <p className="mt-1 text-sm text-sky-200">“{a.academy}”</p>}
      {a.retire && <p className="mt-1 text-sm text-amber-200">“{a.retire}”</p>}
    </div>
  );
}

/** 기자회견 답변 톤 표시(SPEC §6.1 v0.20) */
const INTERVIEW_TONE: Record<string, { label: string; tone: 'green' | 'amber' | 'red' }> = {
  humble: { label: '겸손', tone: 'green' },
  confident: { label: '자신감', tone: 'amber' },
  bold: { label: '도발', tone: 'red' },
};

function OfferCard({ o, onPick, advice }: { o: Offer; onPick: () => void; advice?: OfferAdvice }) {
  const { showKrw } = useGame();
  return (
    <div className={`rounded-xl border p-3 ${o.series === 'f1' && o.seat === 'race' ? 'border-racing/60 bg-racing/5' : 'border-white/10'}`}>
      <div className="flex flex-wrap items-center gap-2">
        {o.series === 'f1' && <F1TeamBadge teamId={o.teamId} size={30} />}
        <span className="text-lg font-black">{o.team}</span>
        <Pill tone={o.series === 'f1' ? 'red' : 'zinc'}>{seriesLabel(o.series)}</Pill>
        <Pill tone={o.seat === 'race' ? 'green' : 'amber'}>{SEAT_LABELS[o.seat]}</Pill>
        {o.management && <Pill tone="amber">매니지먼트 후원</Pill>}
      </div>
      <p className="mt-1 text-sm text-zinc-400">{o.note}</p>
      {advice && (
        <div className="mt-2 rounded-lg bg-white/5 p-2 text-xs">
          <span className="mr-2"><Pill tone={advice.verdict === 'recommend' ? 'green' : advice.verdict === 'ok' ? 'blue' : 'amber'}>매니저 {VERDICT_LABEL[advice.verdict]}</Pill></span>
          <span className="text-zinc-300">{advice.reasons.slice(0, 3).join(' · ')}</span>
        </div>
      )}
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
  const { career: c, lastRecord, signature, firstF1Signature, acceptOffer, skipSeat, retire, chooseEvent } = useGame();
  const confirmBox = useConfirm();
  const off = useMemo(() => (c ? currentOffseason(c) : null), [c]);
  const pending = useMemo(() => (c ? pendingEventCards(c) : []), [c]);
  const resolvedThisYear = (c?.eventLog ?? []).filter((e) => e.year === c?.year);
  const advice = useMemo(() => (c && off && !pending.length ? managerAdvice(c, off) : null), [c, off, pending.length]);
  const [joinAcademy, setJoinAcademy] = useState(true);
  const [picked, setPicked] = useState<Offer | null>(null);
  if (!c) return null;
  const record = lastRecord && lastRecord.year === c.year ? lastRecord : c.history[c.history.length - 1];
  if (!off || !record) return null;
  const rank = (o: Offer) => (o.series === 'f1' && o.seat === 'race' ? 100 : 0) + LADDER.indexOf(o.series) * 10 + (o.seat === 'race' ? 5 : 0) + o.teamQuality;
  const offers = [...off.offers].sort((a, b) => rank(b) - rank(a));
  const firstF1 = (o: Offer) => o.series === 'f1' && o.seat === 'race' && c.f1Debut === null;
  // 첫 F1 계약서에 한 서명이 이후 모든 계약서에 그대로 쓰인다
  const sig = firstF1Signature ?? signature ?? { strokes: [], typed: c.driver.name };

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      {confirmBox.dialog}
      <SeasonSummary r={record} />

      {(pending.length > 0 || resolvedThisYear.length > 0) && (
        <Card title="전환점">
          <div className="space-y-3">
            {resolvedThisYear.map((e) => (
              <div key={e.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-zinc-400">{e.title} · {e.option}</div>
                <p className="mt-1 text-sm">{e.text}</p>
                {e.summary.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{e.summary.map((s, i) => <Pill key={i} tone={effectTone(s)}>{s}</Pill>)}</div>}
              </div>
            ))}
            {pending.map((card) => card.category === 'interview' ? (
              <div key={card.id} className="rounded-xl border border-sky-400/40 bg-sky-400/5 p-3">
                <div className="flex items-center gap-2"><Pill tone="blue">🎙 {EVENT_CATEGORY_LABEL[card.category]}</Pill><b>{card.title}</b></div>
                <div className="mt-3 rounded-lg bg-black/30 p-3">
                  <div className="text-[11px] text-zinc-400">기자 질문</div>
                  <p className="mt-0.5 text-sm text-zinc-100">{card.text}</p>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {card.options.map((o) => (
                    <button key={o.id} onClick={() => chooseEvent(card.id, o.id)} className="rounded-xl border border-white/15 p-3 text-left hover:bg-white/5">
                      <Pill tone={INTERVIEW_TONE[o.id]?.tone ?? 'zinc'}>{INTERVIEW_TONE[o.id]?.label ?? o.id}</Pill>
                      <div className="mt-1 font-bold">{o.label}</div>
                      {o.hint && <div className="mt-0.5 text-xs text-zinc-400">{o.hint}</div>}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div key={card.id} className="rounded-xl border border-racing/50 bg-racing/5 p-3">
                <div className="flex items-center gap-2"><Pill tone="red">{EVENT_CATEGORY_LABEL[card.category]}</Pill><b>{card.title}</b></div>
                <p className="mt-2 text-sm text-zinc-200">{card.text}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {card.options.map((o) => (
                    <button key={o.id} onClick={() => chooseEvent(card.id, o.id)} className="rounded-xl border border-white/15 p-3 text-left hover:bg-white/5">
                      <div className="font-bold">{o.label}</div>
                      {o.hint && <div className="mt-0.5 text-xs text-zinc-400">{o.hint}</div>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {pending.length > 0 ? (
        <Card><p className="text-sm text-zinc-400">전환점을 먼저 결정하면 다음 시즌 제안이 열립니다.</p></Card>
      ) : (
      <>
      <Tip id="offseason" title="오프시즌: 다음 시즌 팀을 고르는 시간">
        <p>팀들의 <b>제안</b>을 비교하세요. 매니저가 제안마다 추천·괜찮음·비추천과 이유를 달아 줍니다. 팀 성능이 높을수록 성적을 내기 쉽고, 시설이 좋을수록 훈련 효율이 오릅니다.</p>
        <p>"계약서 보기"를 눌러 서명하면 다음 시즌 팀이 정해집니다. 시트를 사야 하는 제안은 자금을 확인하세요.</p>
      </Tip>
      <Card title={`${c.year} 오프시즌 · ${c.year + 1} 시즌 제안`}>
        {advice && <ManagerCard a={advice} />}
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
            <OfferCard key={o.id} o={o} advice={advice?.perOffer[o.id]} onPick={() => (o.id === 'stay' ? acceptOffer(o, joinAcademy, null) : setPicked(o))} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap justify-between gap-2">
          <Button variant="ghost" onClick={() => skipSeat(joinAcademy)}>{draftedNext(c) ? '입대하기' : c.military && c.year < c.military.end ? '복무 이어 가기' : '시트 없이 1년 보내기'}</Button>
          <Button variant="danger" onClick={() => confirmBox.ask(<>은퇴를 선언할까요? <b>되돌릴 수 없습니다.</b> 지금까지의 커리어가 은퇴 화면에 기록됩니다.</>, retire, { confirmLabel: '은퇴 선언', danger: true })}>은퇴 선언</Button>
        </div>
      </Card>
      </>
      )}

      {picked && (
        <ContractModal
          offer={picked}
          name={c.driver.fullName ?? c.driver.name}
          firstF1={firstF1(picked)}
          signature={sig}
          onCancel={() => setPicked(null)}
          onSigned={(s) => { acceptOffer(picked, joinAcademy, s); setPicked(null); }}
        />
      )}
    </div>
  );
}
