// M1 엔진 확인용 명령줄 도구.
//   npm run race -- --circuit monaco --seed 7 --me lec [--sprint] [--forecast]
//   npm run create -- --personality aggressive --seed 1 [--reroll 0]
//   npm run teams -- --seasons 25 --seed 3
//   npm run career -- --personality fighter --wealth 3 --seed 1

import {
  CALENDAR_2026, carFromDriver, circuitById, DRIVERS_2026, forecastDecision, forecastFinish, generateCandidates,
  initialWorld, ovr, PERSONALITIES, recommendedFocus, runOffseason, runRace, simulateQualifying, teamById,
  TEAMS_2026, autoplayCareer, seriesLabel, WEALTH_TIERS, type Incident, type Personality, type RaceInput, type RadioOptionId,
  type WealthTier,
} from './engine';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : 'true';
}

const code = (id: string) => DRIVERS_2026.find((d) => d.id === id)?.code ?? id.toUpperCase();

function describe(inc: Incident): string | null {
  switch (inc.type) {
    case 'overtake': return `L${inc.lap} · ${code(inc.by)}, ${code(inc.on)} 추월 → P${inc.position}`;
    case 'lead_change': return `L${inc.lap} · 선두 변경: ${code(inc.leader)}`;
    case 'crash': return `L${inc.lap} · ${code(inc.car)} 사고 리타이어${inc.neutralization !== 'none' ? ` (${inc.neutralization.toUpperCase()})` : ''}`;
    case 'mech_dnf': return `L${inc.lap} · ${code(inc.car)} 기계 결함 리타이어${inc.neutralization !== 'none' ? ` (${inc.neutralization.toUpperCase()})` : ''}`;
    case 'debris': return `L${inc.lap} · 트랙 위 잔해`;
    case 'sc_deploy': return `L${inc.lap} · 🟨 세이프티카 출동`;
    case 'vsc_deploy': return `L${inc.lap} · 🟨 VSC`;
    case 'red_flag': return `L${inc.lap} · 🟥 레드 플래그`;
    case 'sc_end': return `L${inc.lap} · 세이프티카 복귀`;
    case 'vsc_end': return `L${inc.lap} · VSC 종료`;
    case 'restart': return `L${inc.lap} · 재출발`;
    case 'rain_start': return `L${inc.lap} · 🌧 비 시작`;
    case 'rain_stop': return `L${inc.lap} · 비 그침`;
    case 'radio': return `L${inc.lap} · 📻 무전 ${inc.decisionId} → ${inc.choice}`;
    case 'pit': return null;
  }
}

function race(): void {
  const circuit = circuitById(arg('circuit', 'monaco')!);
  const seed = Number(arg('seed', '7'));
  const me = arg('me');
  const kind = arg('sprint') ? 'sprint' : 'race';
  const cars = DRIVERS_2026.map((d) => carFromDriver(d, teamById(d.teamId)));
  const q = simulateQualifying(seed, circuit, cars, undefined, kind === 'sprint' ? 'SQ' : 'Q');

  console.log(`\n${circuit.name} ${kind === 'race' ? '레이스' : '스프린트'} · seed ${seed}${me ? ` · 내 드라이버 ${code(me)}` : ''}`);
  console.log(`\n퀄리파잉: ${q.order.map((id, i) => `${i + 1}.${code(id)}`).join(' ')}`);

  const input: RaceInput = { seed, circuit, cars, grid: q.order, kind, myCarId: me, radio: {} };

  if (me && arg('forecast')) {
    const f = forecastFinish(input, me, 200);
    console.log(`\n예상 순위(200회): P${f.p10}~P${f.p90} (중앙 P${f.p50}) · 포인트 ${(f.points * 100).toFixed(0)}% · 포디움 ${(f.podium * 100).toFixed(0)}% · 우승 ${(f.win * 100).toFixed(0)}% · DNF ${(f.dnf * 100).toFixed(0)}%`);
  }

  // 무전이 나오면 선택지별 예상 순위를 보여 주고 엔지니어 추천을 고른다
  let out = runRace(input);
  while (out.status === 'pending') {
    const dcs = out.decision;
    console.log(`\n📻 L${dcs.lap} 무전 (${dcs.trigger})`);
    for (const o of dcs.options) {
      const f = forecastDecision(input, dcs, o.id, 60);
      console.log(`   ${o.recommended ? '★' : ' '} ${o.label.padEnd(14)} 예상 P${f.p10}~P${f.p90} (중앙 P${f.p50})`);
    }
    const choice = (dcs.options.find((o) => o.recommended) ?? dcs.options[0])!.id as RadioOptionId;
    input.radio = { ...input.radio, [dcs.id]: choice };
    out = runRace(input);
  }

  console.log('\n주요 사건');
  for (const inc of out.incidents) {
    const line = describe(inc);
    if (!line) continue;
    if (inc.type === 'overtake' && me && inc.by !== me && inc.on !== me && inc.position > 3) continue;
    console.log(`  ${line}`);
  }

  console.log('\n결과');
  for (const c of out.classification) {
    const gap = c.status === 'finished' ? (c.position === 1 ? '우승' : `+${(c.gap ?? 0).toFixed(1)}s`) : `DNF (${c.reason}, L${c.laps})`;
    const mark = c.id === me ? ' ◀' : '';
    console.log(`  ${String(c.position).padStart(2)}. ${c.code}  그리드 ${String(c.grid).padStart(2)}  ${gap.padEnd(20)} 스톱 ${c.stops}  ${c.points ? `${c.points}pt` : ''}${mark}`);
  }
}

function create(): void {
  const personality = (arg('personality', 'aggressive') as Personality);
  if (!PERSONALITIES[personality]) throw new Error(`성격: ${Object.keys(PERSONALITIES).join(', ')}`);
  const seed = Number(arg('seed', '1'));
  const reroll = Number(arg('reroll', '0'));
  const def = PERSONALITIES[personality];
  console.log(`\n${def.label} — "${def.motto}"`);
  console.log(`집중 육성 추천: ${recommendedFocus(personality).join(', ')}\n`);
  for (const cnd of generateCandidates(seed, personality, reroll)) {
    const s = cnd.stats;
    console.log(`후보 ${cnd.index + 1}: OVR ${cnd.ovr} (${ovr(s).toFixed(2)})  Pace ${s.pace} · Racecraft ${s.racecraft} · Tyre ${s.tyre} · Consistency ${s.consistency} · Wet ${s.wet} · Feedback ${s.feedback}`);
  }
}

function teams(): void {
  const seasons = Number(arg('seasons', '25'));
  const seed = Number(arg('seed', '3'));
  let world = initialWorld(TEAMS_2026, 2026);
  for (let y = 2027; y < 2027 + seasons; y++) {
    // 순위는 차 성능 순으로 단순 근사(M1). 실제로는 시즌 결과에서 채운다.
    const ranked = [...world.teams].sort((a, b) => b.quality - a.quality);
    ranked.forEach((t, i) => t.standings.push(i + 1));
    const r = runOffseason(world, y, seed);
    world = r.world;
    for (const n of r.news) console.log(`${n.season} · ${n.text}`);
  }
  console.log(`\n${seasons}시즌 후: 팀 ${world.teams.length}개, 준비 중 ${world.pending.length}개`);
}

function career(): void {
  const personality = (arg('personality', 'fighter') as Personality);
  const wealthTier = Number(arg('wealth', '3')) as WealthTier;
  const seed = Number(arg('seed', '1'));
  const name = arg('name', '김민준')!;
  const t0 = Date.now();
  const c = autoplayCareer({ seed, name, nationality: 'KR', wealthTier, personality, candidateIndex: 0, focus: recommendedFocus(personality) });
  const won = (n: number) => `€${(n / 1e6).toFixed(2)}M`;
  console.log(`\n${name} · ${PERSONALITIES[personality].label} · 자산 ${WEALTH_TIERS[wealthTier].label} · seed ${seed}\n`);
  for (const h of c.history) {
    const pos = h.position ? `P${h.position}/${h.fieldSize}` : '-';
    const g = h.growth;
    console.log(
      `${h.year} ${String(h.age).padStart(2)}세 ${seriesLabel(h.series).padEnd(7)} ${(h.team ?? '시트 없음').padEnd(18)} ${h.seat.padEnd(7)} ${pos.padEnd(7)} ` +
        `${h.wins}승 ${h.podiums}포디움  OVR ${h.ovrStart}→${h.ovrEnd} (훈련 ${g.training} · 경기 ${g.racing} · 환경 ${g.environment}${g.aging ? ` · 노화 ${g.aging}` : ''})  SL ${h.superLicence}  자금 ${won(h.fundsEnd)}`,
    );
    console.log(`        ${h.headline}${h.notes.length ? ` — ${h.notes.join(' / ')}` : ''}`);
  }
  const t = c.totals;
  console.log(`\n은퇴 ${c.age}세 · F1 데뷔 ${c.f1Debut ?? '없음'} · F1 타이틀 ${t.f1Titles} · 출전 ${t.f1Starts} · 우승 ${t.f1Wins} · 포디움 ${t.f1Podiums} · 폴 ${t.f1Poles}`);
  console.log(`주니어 타이틀: ${t.juniorTitles.join(', ') || '없음'} · 최고 OVR ${t.bestOvr} · 통산 수입 ${won(t.earnings)} · 아카데미 ${c.academy ?? '없음'}`);
  console.log(`F1 팀 수 ${c.world.teams.teams.length} · 팀 뉴스 ${c.world.news.length}건 · 최근 챔피언: ${c.world.champions.slice(-5).map((x) => `${x.year} ${x.name}`).join(', ')}`);
  console.log(`(${Date.now() - t0}ms)`);
}

const cmd = process.argv[2];
if (cmd === 'race') race();
else if (cmd === 'create') create();
else if (cmd === 'teams') teams();
else if (cmd === 'career') career();
else {
  console.log('사용법: race | create | teams | career');
  console.log(`서킷: ${CALENDAR_2026.map((c) => c.id).join(', ')}`);
}
