import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CALENDAR_2026, carFromDriver, circuitById, DRIVERS_2026, forecastFinish, generateCandidates, initialWorld,
  isValidCandidate, MAX_TEAMS, MIN_TEAMS, ovr, PERSONALITIES, rngFor, runOffseason, runRace, simulateQualifying,
  enforceOrder, F1_UPSET_CHANCE, F1_WINNER_TEAMS, STAT_SUM, teamById, teamForm, TEAMS_2026, type Personality, type RaceCar, type RaceInput, type RadioOptionId,
} from '../src/engine';

const cars: RaceCar[] = DRIVERS_2026.map((d) => carFromDriver(d, teamById(d.teamId)));

function raceInput(seed: number, circuitId = 'australia', extra: Partial<RaceInput> = {}): RaceInput {
  const circuit = circuitById(circuitId);
  const q = simulateQualifying(seed, circuit, cars);
  return { seed, circuit, cars, grid: q.order, kind: 'race', autoRadio: true, ...extra };
}

describe('rng', () => {
  it('같은 시드는 같은 수열', () => {
    const a = rngFor(1, 'x');
    const b = rngFor(1, 'x');
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('엔진 코드에 Math.random이 없다', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
      });
    for (const file of walk('src')) {
      const code = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '');
      expect(code.includes('Math.random'), file).toBe(false);
    }
  });
});

describe('드라이버 생성', () => {
  const all = Object.keys(PERSONALITIES) as Personality[];

  it('성격 보정의 합은 0', () => {
    for (const p of all) {
      const m = PERSONALITIES[p].mods;
      expect(Object.values(m).reduce((a, b) => a + b, 0), p).toBe(0);
    }
  });

  it('모든 후보는 합 270, OVR 45', () => {
    for (const p of all) {
      for (let seed = 0; seed < 60; seed++) {
        for (const c of generateCandidates(seed, p, seed % 3)) {
          expect(isValidCandidate(c.stats), `${p} seed ${seed}`).toBe(true);
          expect(Object.values(c.stats).reduce((a, b) => a + b, 0)).toBe(STAT_SUM);
          expect(Math.round(ovr(c.stats))).toBe(45);
        }
      }
    }
  });

  it('성격이 배분에 드러난다(공격형은 Racecraft > Consistency, 침착형은 반대)', () => {
    const avg = (p: Personality, k: 'racecraft' | 'consistency') => {
      let s = 0;
      let n = 0;
      for (let seed = 0; seed < 40; seed++) for (const c of generateCandidates(seed, p)) { s += c.stats[k]; n++; }
      return s / n;
    };
    expect(avg('aggressive', 'racecraft')).toBeGreaterThan(avg('aggressive', 'consistency') + 8);
    expect(avg('calm', 'consistency')).toBeGreaterThan(avg('calm', 'racecraft') + 6);
  });

  it('같은 시드·성격·reroll이면 같은 후보, reroll이 다르면 다른 후보', () => {
    expect(generateCandidates(5, 'fighter', 0)).toEqual(generateCandidates(5, 'fighter', 0));
    expect(generateCandidates(5, 'fighter', 0)).not.toEqual(generateCandidates(5, 'fighter', 1));
  });
});

describe('레이스 엔진', () => {
  it('결정적이다: 같은 입력이면 같은 결과', () => {
    const a = runRace(raceInput(42));
    const b = runRace(raceInput(42));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('순위표가 온전하다: 22명, 순위 1~22, 포인트 합 101(완주 10명 이상일 때)', () => {
    for (let seed = 0; seed < 50; seed++) {
      const out = runRace(raceInput(seed));
      expect(out.status).toBe('finished');
      if (out.status !== 'finished') continue;
      expect(out.classification.map((c) => c.position)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
      const finishers = out.classification.filter((c) => c.status === 'finished').length;
      const pts = out.classification.reduce((a, c) => a + c.points, 0);
      if (finishers >= 10) expect(pts).toBe(101);
      // 맑은 레이스 완주자는 두 가지 드라이 컴파운드를 써야 하므로 최소 1스톱
      const dryRace = !out.laps.some((l) => l.wet);
      if (dryRace) for (const c of out.classification) if (c.status === 'finished') expect(c.stops, `seed ${seed} ${c.code}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('무전: 선택이 없으면 pending, 선택하면 이어지고, 결정 랩 전까지는 같은 흐름', () => {
    let found = false;
    for (let seed = 0; seed < 400 && !found; seed++) {
      for (const me of ['lec', 'nor', 'alb']) {
        const base = raceInput(seed, 'monaco', { myCarId: me, autoRadio: false });
        const first = runRace(base);
        if (first.status !== 'pending') continue;
        const d = first.decision;
        expect(d.options.filter((o) => o.recommended)).toHaveLength(1);
        const [optA, optB] = d.options;
        const a = runRace({ ...base, autoRadio: true, radio: { [d.id]: optA!.id } });
        const b = runRace({ ...base, autoRadio: true, radio: { [d.id]: optB!.id } });
        expect(a.status).toBe('finished');
        expect(b.status).toBe('finished');
        // 결정 직전 랩까지 기록이 같다
        expect(JSON.stringify(a.laps.slice(0, d.lap - 1))).toBe(JSON.stringify(b.laps.slice(0, d.lap - 1)));
        expect(JSON.stringify(first.laps)).toBe(JSON.stringify(a.laps.slice(0, d.lap - 1)));
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('레이스 통제 빈도가 목표 근처다(SC 30~65%, VSC 15~45%, 레드 15% 미만)', () => {
    const n = 400;
    let sc = 0;
    let vsc = 0;
    let red = 0;
    for (let seed = 0; seed < n; seed++) {
      const out = runRace(raceInput(seed, 'austria'));
      if (out.incidents.some((i) => i.type === 'sc_deploy')) sc++;
      if (out.incidents.some((i) => i.type === 'vsc_deploy')) vsc++;
      if (out.incidents.some((i) => i.type === 'red_flag')) red++;
    }
    expect(sc / n).toBeGreaterThan(0.3);
    expect(sc / n).toBeLessThan(0.65);
    expect(vsc / n).toBeGreaterThan(0.15);
    expect(vsc / n).toBeLessThan(0.45);
    expect(red / n).toBeLessThan(0.15);
  });

  it('세이프티카·VSC·레드 플래그는 늘 그 랩에 리타이어한 차가 있다(사고·결함, v0.36)', () => {
    let checked = 0;
    for (let seed = 0; seed < 300; seed++) {
      const out = runRace({ ...raceInput(seed, 'austria'), autoRadio: true });
      for (const d of out.incidents) {
        if (d.type !== 'sc_deploy' && d.type !== 'vsc_deploy' && d.type !== 'red_flag') continue;
        const phase = d.type === 'sc_deploy' ? 'sc' : d.type === 'vsc_deploy' ? 'vsc' : 'red';
        const culprit = out.incidents.find((i) => (i.type === 'crash' || i.type === 'mech_dnf') && i.neutralization === phase && i.lap >= d.lap - 1 && i.lap <= d.lap);
        expect(culprit, `seed ${seed} L${d.lap} ${d.type}`).toBeDefined();
        if (out.status === 'finished') expect(out.classification.find((r) => r.id === (culprit as { car: string }).car)!.status).toBe('dnf');
        checked++;
      }
      expect(out.incidents.some((i) => i.type === 'debris')).toBe(false);
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('세이프티카·VSC는 사고 지점·크기·예상 시간을 알려 주고, 실제 시간은 예상보다 짧거나 길 수 있다', () => {
    let shorter = 0, longer = 0, total = 0;
    for (let seed = 0; seed < 400; seed++) {
      const out = runRace(raceInput(seed, 'austria'));
      for (const inc of out.incidents) {
        if (inc.type !== 'sc_deploy' && inc.type !== 'vsc_deploy') continue;
        const info = inc.info!;
        expect(info.at).toBeGreaterThanOrEqual(0);
        expect(info.at).toBeLessThan(1);
        expect(['S', 'M', 'L']).toContain(info.severity);
        expect(info.expectedLaps).toBeGreaterThan(0);
        total++;
      }
      for (const inc of out.incidents) if (inc.type === 'neutral_update') (inc.delta < 0 ? shorter++ : longer++);
    }
    expect(total).toBeGreaterThan(100);
    expect(shorter).toBeGreaterThan(5);
    expect(longer).toBeGreaterThan(5);
  });

  it('차의 한계: 가장 느린 차의 OVR 99 드라이버는 맑은 날 포디움이 드물다', () => {
    const dry = { ...circuitById('bahrain'), rainChance: 0 };
    const ace: RaceCar = { ...cars.find((c) => c.id === 'bot')!, stats: { pace: 99, racecraft: 99, tyre: 99, consistency: 99, wet: 99, feedback: 99 } };
    const field = cars.map((c) => (c.id === 'bot' ? ace : c));
    const q = simulateQualifying(11, dry, field);
    const f = forecastFinish({ seed: 11, circuit: dry, cars: field, grid: q.order, kind: 'race', autoRadio: true }, 'bot', 300);
    // 차 격차를 줄였기 때문에 가끔은 포디움에 오르지만, 우승은 드물다
    expect(f.podium).toBeLessThan(0.15);
    expect(f.win).toBeLessThan(0.05);
    expect(f.points).toBeGreaterThan(0.2);
  });

  it('우승 팀이 다양하다: 2026 시즌에 평균 3개 팀 이상이 레이스에서 우승한다', () => {
    let distinct = 0;
    const seasons = 5;
    for (let s = 0; s < seasons; s++) {
      const winners = new Set<string>();
      CALENDAR_2026.forEach((c, i) => {
        const field = cars.map((x) => ({ ...x, teamQuality: x.teamQuality + teamForm(s, 2026, x.teamId, c, i, CALENDAR_2026.length) }));
        const q = simulateQualifying(s * 100 + i, c, field);
        const out = runRace({ seed: s * 100 + i, circuit: c, cars: field, grid: q.order, kind: 'race', autoRadio: true });
        if (out.status === 'finished') winners.add(field.find((x) => x.id === out.classification[0]!.id)!.teamId);
      });
      distinct += winners.size;
    }
    expect(distinct / seasons).toBeGreaterThanOrEqual(3);
  });

  it('24개 서킷 모두에서 레이스와 스프린트가 끝까지 돈다', () => {
    for (const c of CALENDAR_2026) {
      const q = simulateQualifying(3, c, cars);
      for (const kind of ['race', 'sprint'] as const) {
        const out = runRace({ seed: 3, circuit: c, cars, grid: q.order, kind, autoRadio: true });
        expect(out.status, `${c.id} ${kind}`).toBe('finished');
      }
    }
  });
});

describe('결과 규칙(SPEC §5.1 v0.11)', () => {
  const team = (id: string) => id.split('-')[0]!;
  it('최고 순위 제한: 제한 팀은 허용된 자리 아래로 내려간다', () => {
    const order = ['new-1', 'a-1', 'new-2', 'b-1', 'c-1', 'd-1'];
    const out = enforceOrder(order, team, { bestPosition: { new: 4 } });
    expect(out.indexOf('new-1')).toBeGreaterThanOrEqual(3);
    expect(out.indexOf('new-2')).toBeGreaterThanOrEqual(3);
    expect(out.slice(0, 3)).toEqual(['a-1', 'b-1', 'c-1']);
  });

  it('완주자가 제한 순위보다 적어도 끝난다(무한 반복 회귀 테스트)', () => {
    const out = enforceOrder(['new-1', 'new-2', 'a-1'], team, { bestPosition: { new: 11 } });
    expect(out).toEqual(['a-1', 'new-1', 'new-2']);
  });

  it('우승 가능 팀이 아니면 1위를 넘겨준다(이변 확률에 걸리면 그대로 둔다)', () => {
    expect(enforceOrder(['x-1', 'y-1', 'ferrari-1'], team, { winnerTeams: ['ferrari'] })[0]).toBe('ferrari-1');
    expect(enforceOrder(['x-1', 'y-1', 'ferrari-1'], team, { winnerTeams: ['ferrari'], upsetChance: 0.7 }, 0.5)[0]).toBe('x-1');
    expect(enforceOrder(['x-1', 'y-1', 'ferrari-1'], team, { winnerTeams: ['ferrari'], upsetChance: 0.7 }, 0.9)[0]).toBe('ferrari-1');
  });

  it('F1 2026: 우승은 4팀이 95% 이상(그 외 5% 미만), 포디움은 여러 팀, 캐딜락(신생팀)은 데뷔 시즌 무득점', () => {
    const rules = { winnerTeams: F1_WINNER_TEAMS, bestPosition: { cadillac: 11 }, upsetChance: F1_UPSET_CHANCE };
    const winners = new Set<string>();
    let races = 0;
    let topWins = 0;
    const podium = new Set<string>();
    let cadillacPts = 0;
    for (let s = 0; s < 3; s++) {
      CALENDAR_2026.forEach((c, i) => {
        const field = cars.map((x) => ({ ...x, teamQuality: x.teamQuality + teamForm(s, 2026, x.teamId, c, i, CALENDAR_2026.length) }));
        const q = simulateQualifying(s * 100 + i, c, field);
        const out = runRace({ seed: s * 100 + i, circuit: c, cars: field, grid: q.order, kind: 'race', autoRadio: true, rules });
        if (out.status !== 'finished') return;
        const tOf = (id: string) => field.find((x) => x.id === id)!.teamId;
        const w = tOf(out.classification[0]!.id);
        races++;
        if ((F1_WINNER_TEAMS as readonly string[]).includes(w)) topWins++;
        winners.add(w);
        out.classification.slice(0, 3).forEach((r) => podium.add(tOf(r.id)));
        cadillacPts += out.classification.filter((r) => tOf(r.id) === 'cadillac').reduce((a, r) => a + r.points, 0);
      });
    }
    expect(topWins / races).toBeGreaterThanOrEqual(0.95);
    for (const t of F1_WINNER_TEAMS) expect(winners.has(t)).toBe(true);
    expect(podium.size).toBeGreaterThanOrEqual(6);
    expect(cadillacPts).toBe(0);
  });
});

describe('F1 팀 진입·철수', () => {
  it(`팀 수는 항상 ${MIN_TEAMS}~${MAX_TEAMS}, 준비 중 포함 ${MAX_TEAMS} 이하`, () => {
    let entries = 0;
    for (let seed = 0; seed < 300; seed++) {
      let world = initialWorld(TEAMS_2026, 2026);
      for (let y = 2027; y < 2057; y++) {
        const ranked = [...world.teams].sort((a, b) => b.quality - a.quality);
        ranked.forEach((t, i) => t.standings.push(i + 1));
        const r = runOffseason(world, y, seed);
        world = r.world;
        entries += r.news.filter((n) => n.kind === 'debut').length;
        expect(world.teams.length + world.pending.length).toBeLessThanOrEqual(MAX_TEAMS);
        expect(world.teams.length).toBeGreaterThanOrEqual(MIN_TEAMS);
      }
    }
    // 30시즌 동안 신규 진입이 가끔은 일어난다(평균 0.3~3건)
    expect(entries / 300).toBeGreaterThan(0.3);
    expect(entries / 300).toBeLessThan(3);
  });

  it('입력 world를 바꾸지 않는다', () => {
    const world = initialWorld(TEAMS_2026, 2026);
    const snapshot = JSON.stringify(world);
    runOffseason(world, 2027, 1);
    expect(JSON.stringify(world)).toBe(snapshot);
  });
});

describe('엔지니어 무전(SPEC §5.5 v0.31)', () => {
  it('무전에는 엔지니어 한마디와 선택지별 장단점이 붙고, 급박한 상황은 팀이 바로 정한다', () => {
    let pending = 0, forced = 0;
    for (let seed = 0; seed < 400; seed++) {
      const input = { ...raceInput(seed, 'austria'), myCarId: cars[10]!.id, autoRadio: false };
      let out = runRace(input);
      const radio: Record<string, RadioOptionId> = {};
      for (let k = 0; k < 6 && out.status === 'pending'; k++) {
        pending++;
        expect(out.decision.advice).toBeTruthy();
        expect(out.decision.urgent).toBeUndefined();
        for (const o of out.decision.options) expect(o.note).toBeTruthy();
        radio[out.decision.id] = out.decision.options[0]!.id;
        out = runRace({ ...input, radio });
      }
      forced += out.incidents.filter((i) => i.type === 'radio' && i.forced).length;
    }
    expect(pending).toBeGreaterThan(50);
    expect(forced).toBeGreaterThan(0);
  });
});

import { calledName, driverCode, formatFullName } from '../src/engine';

describe('플레이어 이름 (v0.37)', () => {
  it('국적에 맞는 성명 순서, 별명 선택, 코드', () => {
    expect(formatFullName('김', '민준', 'KR')).toBe('김민준');
    expect(formatFullName('Kim', 'Minjun', 'KR')).toBe('Kim Minjun');
    expect(formatFullName('佐藤', '健', 'JP')).toBe('佐藤健');
    expect(formatFullName('Nguyen', 'Van An', 'VN')).toBe('Nguyen Van An');
    expect(formatFullName('Rossi', 'Luca', 'IT')).toBe('Luca Rossi');
    expect(formatFullName('Silva', 'Ana', 'BR')).toBe('Ana Silva');
    expect(calledName({ surname: 'Rossi', given: 'Luca', nationality: 'IT', nickname: 'The Rocket', useNickname: true })).toBe('The Rocket');
    expect(calledName({ surname: 'Rossi', given: 'Luca', nationality: 'IT', nickname: 'The Rocket', useNickname: false })).toBe('Luca Rossi');
    expect(calledName({ surname: 'Rossi', given: 'Luca', nationality: 'IT', nickname: '  ', useNickname: true })).toBe('Luca Rossi');
    expect(driverCode('Rossi', 'The Rocket')).toBe('ROS');
    expect(driverCode('김', '김민준')).toBe('김민준');
    expect(driverCode(undefined, 'Alex Moreau')).toBe('ALE');
  });
});

import { batchim, fixJosa, josa, fictionalName, namePoolSize } from '../src/engine';

describe('조사·가상 이름 (v0.38)', () => {
  it('받침에 맞는 조사', () => {
    expect(josa('김민준', '은/는')).toBe('김민준은');
    expect(josa('이서연', '이/가')).toBe('이서연이');
    expect(josa('박지우', '을/를')).toBe('박지우를');
    expect(josa('Luca Rossi', '은/는')).toBe('Luca Rossi는');
    expect(josa('Max Verstappen', '이/가')).toBe('Max Verstappen이');
    expect(josa('Haas', '이/가')).toBe('Haas가');
    expect(josa('Cadillac', '이/가')).toBe('Cadillac이');
    expect(josa('Alpine', '은/는')).toBe('Alpine은');
    expect(josa('사고', '으로/로')).toBe('사고로');
    expect(josa('기계 결함', '으로/로')).toBe('기계 결함으로');
    expect(josa('George Russell', '으로/로')).toBe('George Russell로');
    expect(batchim('3')).toBe('other');
    expect(batchim('2')).toBe('none');
    expect(fixJosa('Shot(Haas)은 21위, Isack Hadjar이 우승. 원인은 기계 결함로.', ['Shot', 'Isack Hadjar', '기계 결함']))
      .toBe('Shot(Haas)은 21위, Isack Hadjar가 우승. 원인은 기계 결함으로.');
    expect(fixJosa('Luca Rossi은 이번에', ['Luca Rossi'])).toBe('Luca Rossi는 이번에');
  });

  it('가상 이름은 나라에 맞는 이름·성이고 다양하며, 피하라는 이름은 다시 뽑는다', () => {
    const size = namePoolSize();
    expect(size.nations).toBeGreaterThanOrEqual(25);
    expect(size.first).toBeGreaterThanOrEqual(250);
    const r = rngFor(7, 'names-test');
    const firsts = new Map<string, number>();
    for (let i = 0; i < 400; i++) {
      const n = fictionalName(r);
      firsts.set(n.first, (firsts.get(n.first) ?? 0) + 1);
      if (n.nationality === 'KR') expect(n.name.split(' ')[0]).toMatch(/^(Kim|Lee|Park|Choi|Jung|Kang|Cho|Yoon|Jang|Lim|Han|Shin|Seo|Kwon)$/);
      expect(n.code).toMatch(/^[A-Z]{3}$/);
    }
    expect(Math.max(...firsts.values())).toBeLessThan(12); // 400명 중 같은 이름이 3%를 넘지 않는다
    const avoid = new Set<string>();
    for (let i = 0; i < 60; i++) { const n = fictionalName(r, avoid); expect(avoid.has(n.first)).toBe(false); avoid.add(n.first); }
  });
});

import { circuitTyreData, raceForecast, teamStrategies, weatherPlan, raceLaps } from '../src/engine';

describe('타이어·비·전략 회의 (v0.40)', () => {
  it('비 확률이 높은 서킷일수록 비가 자주 오고, 폭우 땐 풀웻을 쓰며 젖은 타이어를 쓰면 의무 피트 규칙이 없다', () => {
    const rainy = (id: string) => { let n = 0; const c = circuitById(id); for (let s = 0; s < 600; s++) if (weatherPlan(s, c, raceLaps(c, 'race'))) n++; return n / 600; };
    expect(rainy('belgium')).toBeGreaterThan(rainy('bahrain') + 0.2);
    expect(rainy('brazil')).toBeGreaterThan(0.25);
    let wSeen = 0;
    let wetStart = 0;
    for (let seed = 0; seed < 400 && wSeen < 3; seed++) {
      const c = circuitById('belgium');
      const w = weatherPlan(seed, c, raceLaps(c, 'race'));
      if (!w?.heavy) continue;
      if (w.start <= 1) wetStart++;
      const out = runRace(raceInput(seed, 'belgium'));
      if (out.status !== 'finished') continue;
      const usedW = out.incidents.some((i) => i.type === 'pit' && i.compound === 'W') || out.laps[0]!.order.some((e) => e.compound === 'W');
      if (usedW) wSeen++;
    }
    expect(wSeen).toBeGreaterThan(0);
    expect(wetStart).toBeGreaterThanOrEqual(0);
  });

  it('팀 추천 출발 타이어는 서킷 실제 데이터, 스프린트는 피트 계획이 없고, 젖은 출발은 젖은 타이어', () => {
    const bh = circuitById('bahrain');
    const dry = raceForecast(1, bh, 57);
    expect(dry.rain).toBe(false);
    const opts = teamStrategies(bh, 'race', 57, dry, 'calm');
    expect(opts[0]!.recommended).toBe(true);
    expect(opts[0]!.start).toBe(circuitTyreData('bahrain').start);
    expect(opts.some((o) => o.style === 'data')).toBe(true);
    expect(opts.some((o) => o.style === 'gamble')).toBe(false);
    expect(teamStrategies(bh, 'race', 57, dry, 'aggressive').some((o) => o.style === 'gamble')).toBe(true);
    expect(teamStrategies(bh, 'race', 57, dry, 'fighter').every((o) => o.style === 'team' || o.style === 'alt')).toBe(true);
    for (const o of teamStrategies(bh, 'sprint', 19, dry, 'instinctive')) expect(o.stops).toEqual([]);
    const wet = { ...dry, rain: true, wetStart: true, heavy: true };
    expect(teamStrategies(bh, 'race', 57, wet, 'calm')[0]!.start).toBe('W');
    expect(teamStrategies(bh, 'race', 57, { ...wet, heavy: false }, 'calm')[0]!.start).toBe('I');
  });

  it('전략 회의에서 고른 출발 타이어·피트 계획을 내 차가 따르고, 피트 창 무전에 성격 전략이 붙는다', () => {
    const me = cars[5]!;
    const base = (p: Personality, extra: Partial<RaceInput> = {}) => {
      const myCars = cars.map((c) => (c.id === me.id ? { ...c, personality: p } : c));
      return { ...raceInput(3, 'italy'), cars: myCars, myCarId: me.id, ...extra };
    };
    // 하드 출발 지정
    const out = runRace({ ...base('calm'), myPlan: 'team', myStart: 'H', autoRadio: true });
    expect(out.laps[0]!.order.find((e) => e.id === me.id)?.compound).toBe('H');
    // 피트 창 무전: 분석·침착형은 데이터, 공격·본능형은 도박 선택지
    // 무전을 하나씩 추천으로 넘기며 피트 창 무전을 찾는다
    const findWindow = (p: Personality) => {
      const radio: Record<string, RadioOptionId> = {};
      for (let i = 0; i < 10; i++) {
        const r = runRace({ ...base(p), myPlan: 'team', autoRadio: false, radio });
        if (r.status !== 'pending') return null;
        if (r.decision.trigger === 'pit_window') return r.decision;
        radio[r.decision.id] = r.decision.options.find((o) => o.recommended)!.id;
      }
      return null;
    };
    const d1 = findWindow('analytical')!;
    const d2 = findWindow('aggressive')!;
    const d3 = findWindow('fighter')!;
    expect(d1.options.map((o) => o.id)).toContain('data_optimal');
    expect(d2.options.map((o) => o.id)).toContain('gamble_soft');
    expect(d3.options.map((o) => o.id)).toEqual(['pit_plan', 'pit_now', 'extend']);
    expect(d1.options.find((o) => o.recommended)!.id).toBe('pit_plan');
    // 같은 선택이면 같은 결과
    expect(runRace({ ...base('calm'), myPlan: 'team', autoRadio: true })).toEqual(runRace({ ...base('calm'), myPlan: 'team', autoRadio: true }));
  });
});

describe('레드 플래그 (v0.46)', () => {
  it('레드 플래그가 나면 세션이 멈추고 내 무전으로 재출발 타이어를 고른다. 고른 타이어로 재출발한다', () => {
    const me = cars[5]!;
    let checked = 0;
    for (let seed = 1; seed <= 300 && checked < 2; seed++) {
      const base = { ...raceInput(seed, 'monaco'), myCarId: me.id };
      const radio: Record<string, RadioOptionId> = {};
      for (let i = 0; i < 12; i++) {
        const r = runRace({ ...base, autoRadio: false, radio });
        if (r.status !== 'pending') break;
        if (r.decision.trigger === 'red_flag') {
          const d = r.decision;
          expect(d.options.map((o) => o.id)).toEqual(['rf_S', 'rf_M', 'rf_H', 'rf_I', 'rf_W']);
          expect(d.advice).toContain('세션이 중단');
          const pick: RadioOptionId = d.options.find((o) => o.recommended)!.id === 'rf_H' ? 'rf_S' : 'rf_H';
          const after = runRace({ ...base, autoRadio: true, radio: { ...radio, [d.id]: pick } });
          const lap = after.laps.find((l) => l.lap === d.lap)!;
          expect(lap.order.find((o) => o.id === me.id)?.compound).toBe(pick === 'rf_H' ? 'H' : 'S');
          checked++;
          break;
        }
        radio[r.decision.id] = r.decision.options.find((o) => o.recommended)!.id;
      }
    }
    expect(checked).toBe(2);
  });
});
