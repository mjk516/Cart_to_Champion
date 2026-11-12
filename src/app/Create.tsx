// 드라이버 생성(SPEC §3): 기본 정보 → 헬멧·번호 → 자산 규모 → 성격 → 후보 → 집중 육성 → 서명

import { useEffect, useMemo, useState } from 'react';
import {
  ALL_F1_CIRCUITS, CALENDAR_2026, CALENDAR_2027_SLOTS, carNumberProblem, circuitById, DEFAULT_HELMET, defaultCarNumber, generateCandidates, HELMET_COLORS, HELMET_PATTERNS, RETURNING_CIRCUITS, ovr, PERSONALITIES, recommendedFocus, STAT_KEYS, WEALTH_TIERS,
  type Helmet, type Personality, type StatKey, type WealthTier,
} from '../engine';
import { formatMoney, pct } from './format';
import { HelmetView } from './Helmet';
import { SignaturePad } from './SignaturePad';
import { randomSeed, useGame } from './store';
import { Bar, Button, Card, Pill, STAT_LABELS, TEMPERAMENT_LABELS } from './ui';

/** 국적 목록(지역별). 국가 코드는 ISO 3166-1 alpha-2 */
const NATION_GROUPS: Array<[string, Array<[string, string]>]> = [
  ['아시아', [
    ['KR', '대한민국'], ['JP', '일본'], ['CN', '중국'], ['TW', '대만'], ['HK', '홍콩'], ['SG', '싱가포르'], ['MY', '말레이시아'],
    ['TH', '태국'], ['ID', '인도네시아'], ['PH', '필리핀'], ['VN', '베트남'], ['IN', '인도'], ['KZ', '카자흐스탄'], ['AZ', '아제르바이잔'],
  ]],
  ['유럽', [
    ['GB', '영국'], ['IE', '아일랜드'], ['FR', '프랑스'], ['DE', '독일'], ['IT', '이탈리아'], ['ES', '스페인'], ['PT', '포르투갈'],
    ['NL', '네덜란드'], ['BE', '벨기에'], ['LU', '룩셈부르크'], ['MC', '모나코'], ['CH', '스위스'], ['AT', '오스트리아'], ['HU', '헝가리'],
    ['CZ', '체코'], ['PL', '폴란드'], ['SK', '슬로바키아'], ['SI', '슬로베니아'], ['HR', '크로아티아'], ['RO', '루마니아'], ['GR', '그리스'],
    ['TR', '튀르키예'], ['DK', '덴마크'], ['SE', '스웨덴'], ['NO', '노르웨이'], ['FI', '핀란드'], ['EE', '에스토니아'], ['UA', '우크라이나'],
  ]],
  ['아메리카', [
    ['US', '미국'], ['CA', '캐나다'], ['MX', '멕시코'], ['BR', '브라질'], ['AR', '아르헨티나'], ['CL', '칠레'], ['CO', '콜롬비아'],
    ['VE', '베네수엘라'], ['PE', '페루'], ['UY', '우루과이'],
  ]],
  ['중동·아프리카', [
    ['AE', '아랍에미리트'], ['SA', '사우디아라비아'], ['QA', '카타르'], ['BH', '바레인'], ['IL', '이스라엘'], ['ZA', '남아프리카공화국'], ['MA', '모로코'],
    ['EG', '이집트'], ['KE', '케냐'], ['NG', '나이지리아'],
  ]],
  ['오세아니아', [['AU', '호주'], ['NZ', '뉴질랜드']]],
];
/** 국가 코드 → 국기 이모지 */
const flag = (code: string) => String.fromCodePoint(...[...code].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
/** 2026 캘린더에 그랑프리가 있는 나라(SPEC §3.1 홈 그랑프리) */
const HOME_GP = new Set(CALENDAR_2026.map((x) => x.country));
/** 지금은 없지만 캘린더가 바뀌면 그랑프리가 돌아올 수 있는 나라 */
const NEXT_YEAR_GP = new Set(CALENDAR_2027_SLOTS.map((s) => circuitById(s.id).country).filter((x) => !HOME_GP.has(x)));
const MAYBE_HOME_GP = new Set([...RETURNING_CIRCUITS, ...ALL_F1_CIRCUITS].map((x) => x.country).filter((x) => !HOME_GP.has(x) && !NEXT_YEAR_GP.has(x)));
const STEPS = ['기본 정보', '헬멧·번호', '자산 규모', '성격', '후보 선택', '서명'];

export function Create() {
  const { startCareer, showKrw, go, createDraft, setCreateDraft } = useGame();
  // 만들던 드라이버가 있으면 그 상태에서 이어 만든다
  const [draft] = useState(() => createDraft);
  const [seed] = useState(() => draft?.seed ?? randomSeed());
  const [step, setStep] = useState(draft?.step ?? 0);
  const [name, setName] = useState(draft?.name ?? '');
  const [nationality, setNationality] = useState(draft?.nationality ?? 'KR');
  const [wealth, setWealth] = useState<WealthTier>((draft?.wealth as WealthTier) ?? 3);
  const [personality, setPersonality] = useState<Personality>((draft?.personality as Personality) ?? 'fighter');
  const [reroll, setReroll] = useState(draft?.reroll ?? 0);
  const [candidate, setCandidate] = useState(draft?.candidate ?? 0);
  const [focus, setFocus] = useState<StatKey[]>((draft?.focus as StatKey[]) ?? recommendedFocus('fighter'));
  const [helmet, setHelmet] = useState<Helmet>((draft?.helmet as Helmet) ?? DEFAULT_HELMET);
  const [numberText, setNumberText] = useState(() => draft?.numberText ?? String(defaultCarNumber(seed)));
  useEffect(() => {
    // 이름을 쓰거나 다음 단계로 넘어간 뒤부터 저장한다
    if (!name.trim() && step === 0) return;
    setCreateDraft({ seed, step, name, nationality, wealth, personality, reroll, candidate, focus, helmet, numberText });
  }, [seed, step, name, nationality, wealth, personality, reroll, candidate, focus, helmet, numberText]); // eslint-disable-line react-hooks/exhaustive-deps
  const carNumber = Number(numberText);
  const numberError = numberText.trim() === '' ? '번호를 입력해 주세요' : carNumberProblem(carNumber);
  const candidates = useMemo(() => generateCandidates(seed, personality, reroll), [seed, personality, reroll]);

  const choosePersonality = (p: Personality) => {
    setPersonality(p);
    setFocus(recommendedFocus(p));
    setCandidate(0);
  };
  const canNext = step === 0 ? name.trim().length > 0 : step === 1 ? !numberError : true;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {STEPS.map((s, i) => (
          <span key={s} className={`whitespace-nowrap rounded-full px-2.5 py-1 font-bold ${i === step ? 'bg-racing text-white' : i < step ? 'bg-white/15 text-zinc-200' : 'bg-white/5 text-zinc-500'}`}>
            {i + 1}. {s}
          </span>
        ))}
      </div>

      {step === 0 && (
        <Card title="기본 정보">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-zinc-400">이름</span>
              <input
                aria-label="이름" value={name} onChange={(e) => setName(e.target.value.slice(0, 16))} placeholder="예: 김민준"
                className="w-full rounded-xl border border-white/15 bg-zinc-950 px-3 py-2.5 outline-none focus:border-racing"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-400">국적</span>
              <select aria-label="국적" value={nationality} onChange={(e) => setNationality(e.target.value)} className="w-full rounded-xl border border-white/15 bg-zinc-950 px-3 py-2.5">
                {NATION_GROUPS.map(([region, list]) => (
                  <optgroup key={region} label={region}>
                    {list.map(([code, label]) => <option key={code} value={code}>{flag(code)} {label}{HOME_GP.has(code) ? ' · 홈 그랑프리' : ''}</option>)}
                  </optgroup>
                ))}
              </select>
              <span className="block text-xs text-zinc-500">
                {HOME_GP.has(nationality)
                  ? '캘린더에 홈 그랑프리가 있어 F1 팀들이 홈 시장을 보고 더 쳐줍니다(F1 데뷔 전). 홈 그랑프리 주말에는 능력치가 조금 오르고, 멘탈은 성격에 따라 오르거나 내립니다.'
                  : NEXT_YEAR_GP.has(nationality)
                    ? '2026 캘린더에는 홈 그랑프리가 없지만, 공식 발표된 2027 캘린더에 이 나라 그랑프리가 있습니다.'
                    : MAYBE_HOME_GP.has(nationality)
                    ? '지금 캘린더에는 홈 그랑프리가 없지만, 캘린더가 바뀌면 이 나라 서킷이 돌아올 수 있습니다.'
                    : '캘린더에 홈 그랑프리가 없는 나라입니다.'}
              </span>
            </label>
          </div>
          <p className="mt-4 text-sm text-zinc-400">12세, 첫 카트 시즌부터 시작합니다.</p>
        </Card>
      )}

      {step === 1 && (
        <Card title="헬멧과 차 번호">
          <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-white/5 p-4">
              <HelmetView helmet={helmet} number={numberError ? undefined : carNumber} size={160} />
              <div className="text-sm font-bold">{name.trim() || '드라이버'} {numberError ? '' : `#${carNumber}`}</div>
            </div>
            <div className="space-y-4">
              {([['base', '바탕색'], ['accent', '포인트색']] as const).map(([key, label]) => (
                <div key={key}>
                  <div className="mb-1 text-xs text-zinc-400">{label}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {HELMET_COLORS.map((col) => (
                      <button key={col} aria-label={`${label} ${col}`} aria-pressed={helmet[key] === col} onClick={() => setHelmet((h) => ({ ...h, [key]: col }))}
                        className={`h-8 w-8 rounded-full border-2 ${helmet[key] === col ? 'border-white ring-2 ring-racing' : 'border-white/10'}`} style={{ background: col }} />
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <div className="mb-1 text-xs text-zinc-400">무늬</div>
                <div className="flex flex-wrap gap-1.5">
                  {HELMET_PATTERNS.map((p) => (
                    <button key={p.id} onClick={() => setHelmet((h) => ({ ...h, pattern: p.id }))}
                      className={`rounded-full px-3 py-1.5 text-sm font-bold ${helmet.pattern === p.id ? 'bg-racing text-white' : 'bg-white/5 text-zinc-300 hover:bg-white/10'}`}>{p.label}</button>
                  ))}
                </div>
              </div>
              <label className="block space-y-1">
                <span className="text-xs text-zinc-400">차 번호 (2~99)</span>
                <input aria-label="차 번호" inputMode="numeric" value={numberText} maxLength={2}
                  onChange={(e) => setNumberText(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                  className={`block w-28 rounded-xl border bg-zinc-950 px-3 py-2.5 text-lg font-black outline-none ${numberError ? 'border-red-500/70' : 'border-white/15 focus:border-racing'}`} />
                {numberError
                  ? <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">⚠️ {numberError}</p>
                  : <p className="text-xs text-emerald-300">쓸 수 있는 번호입니다. F1에 오르면 이 번호를 달고 달립니다.</p>}
              </label>
            </div>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card title="가정 자산 규모">
          <p className="mb-3 text-sm text-zinc-400">능력치는 모두 같습니다. 돈은 시작하는 팀과 경로를 바꿉니다. 돈이 모자라면 매니지먼트가 시트 비용을 대신 내고 나중에 F1 연봉의 15%를 가져갑니다.</p>
          <div className="grid gap-2 sm:grid-cols-5">
            {([1, 2, 3, 4, 5] as WealthTier[]).map((t) => {
              const w = WEALTH_TIERS[t];
              return (
                <button key={t} onClick={() => setWealth(t)} className={`rounded-xl border p-3 text-left transition ${wealth === t ? 'border-racing bg-racing/10' : 'border-white/10 hover:bg-white/5'}`}>
                  <div className="text-xs text-zinc-400">{t}단계</div>
                  <div className="text-lg font-black">{w.label}</div>
                  <div className="mt-2 text-xs text-zinc-300">시작 자금<br /><b>{formatMoney(w.startFunds, showKrw)}</b></div>
                  <div className="mt-1 text-xs text-zinc-300">가족 지원/년<br /><b>{formatMoney(w.familySupport, showKrw)}</b></div>
                  {w.growthBonus > 0 && <div className="mt-2"><Pill tone="green">성장 +{pct(w.growthBonus)}</Pill></div>}
                  {w.academyInterest < 0 && <div className="mt-2"><Pill tone="amber">아카데미 관심 {pct(w.academyInterest)}</Pill></div>}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card title="성격">
          <p className="mb-3 text-sm text-zinc-400">성격이 초기 능력치와 커리어를 정합니다. 꾸준한 성격은 성적이 고르지만 챔피언이 되기 어렵고, 한 방 있는 성격은 들쑥날쑥하지만 정상에 오를 수 있습니다. 대신 팀에서 방출될 수 있습니다.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(PERSONALITIES) as Personality[]).map((p) => {
              const d = PERSONALITIES[p];
              const t = TEMPERAMENT_LABELS[d.temperament]!;
              return (
                <button key={p} onClick={() => choosePersonality(p)} className={`rounded-xl border p-3 text-left transition ${personality === p ? 'border-racing bg-racing/10' : 'border-white/10 hover:bg-white/5'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black">{d.label}</span>
                    <Pill tone={t.tone}>{t.label}</Pill>
                    <span className="ml-auto text-xs text-zinc-400">방출 위험 {pct(d.releaseRisk)}/시즌</span>
                  </div>
                  <p className="mt-1 text-sm italic text-zinc-300">“{d.motto}”</p>
                  <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-[11px] text-zinc-400">
                    {STAT_KEYS.map((k) => (
                      <span key={k} className={d.mods[k] > 0 ? 'text-emerald-300' : d.mods[k] < 0 ? 'text-red-300' : ''}>
                        {STAT_LABELS[k]} {d.mods[k] > 0 ? '+' : ''}{d.mods[k]}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">{t.desc}</p>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card title="후보 선택" right={<Button variant="ghost" onClick={() => { setReroll((r) => r + 1); setCandidate(0); }}>다른 후보 보기</Button>}>
          <p className="mb-3 text-sm text-zinc-400">세 후보 모두 OVR 45, 능력치 합 270입니다. 구성만 다릅니다.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {candidates.map((cnd, i) => (
              <button key={i} onClick={() => setCandidate(i)} className={`rounded-xl border p-3 text-left ${candidate === i ? 'border-racing bg-racing/10' : 'border-white/10 hover:bg-white/5'}`}>
                <div className="mb-2 flex items-baseline justify-between"><b>후보 {i + 1}</b><span className="text-xs text-zinc-400">OVR {Math.round(ovr(cnd.stats))}</span></div>
                {STAT_KEYS.map((k) => (
                  <div key={k} className="mb-1.5">
                    <div className="flex justify-between text-[11px] text-zinc-400"><span>{STAT_LABELS[k]}</span><span>{cnd.stats[k]}</span></div>
                    <Bar value={cnd.stats[k]} />
                  </div>
                ))}
              </button>
            ))}
          </div>
          <div className="mt-4">
            <div className="mb-2 text-sm font-bold text-zinc-300">집중 육성(최대 2개, 성장 +20%)</div>
            <div className="flex flex-wrap gap-2">
              {STAT_KEYS.map((k) => {
                const on = focus.includes(k);
                return (
                  <button key={k} onClick={() => setFocus((f) => (on ? f.filter((x) => x !== k) : f.length < 2 ? [...f, k] : [f[1]!, k]))}
                    className={`rounded-full border px-3 py-1 text-xs font-bold ${on ? 'border-racing bg-racing/20 text-white' : 'border-white/15 text-zinc-300'}`}>
                    {STAT_LABELS[k]}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {step === 5 && (
        <Card title="서명 등록">
          <p className="mb-1 font-bold">프로 드라이버의 첫걸음. 앞으로 계약서에 쓸 서명을 남겨 주세요.</p>
          <p className="mb-3 text-xs text-zinc-500">실제로 쓰는 서명은 그리지 마세요. 서명은 이 기기에만 저장됩니다.</p>
          <SignaturePad
            name={name.trim()}
            doneLabel="커리어 시작"
            onDone={(sig) =>
              startCareer({ seed, name: name.trim(), nationality, wealthTier: wealth, personality, candidateIndex: candidate, reroll, focus, number: carNumber, helmet }, sig)
            }
          />
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={() => { if (step === 0) { setCreateDraft(null); go('home'); } else setStep(step - 1); }}>{step === 0 ? '취소' : '이전'}</Button>
        {step < 5 && <Button onClick={() => setStep(step + 1)} disabled={!canNext}>다음</Button>}
      </div>
    </div>
  );
}
