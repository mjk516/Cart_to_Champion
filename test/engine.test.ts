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
