// 밸런스 스크립트(SPEC §3.1, §12 M1). 자산 규모·성격별로 커리어를 자동 진행해 분포를 본다.
//   npm run balance -- --n 100
// 목표(SPEC §3.1): 다섯 단계 모두 F1 진출과 챔피언이 가능. F1 진출률은 ⑤ > ①, F1 진출 후 챔피언 비율은 ①이 가장 높게.

import { autoplayCareer, PERSONALITIES, type Personality, type WealthTier } from '../src/engine';

const nArg = process.argv.indexOf('--n');
const N = nArg >= 0 ? Number(process.argv[nArg + 1]) : 60;
const personalities = Object.keys(PERSONALITIES) as Personality[];

interface Row { f1: number; champ: number; titles: number; starts: number; wins: number; peak: number; retireAge: number; juniorTitles: number; noSeat: number; releases: number; podiums: number }
const pctf = (x: number) => `${(x * 100).toFixed(0)}%`.padStart(4);

function run(filter: (i: number) => { tier: WealthTier; p: Personality }): Row {
  const row: Row = { f1: 0, champ: 0, titles: 0, starts: 0, wins: 0, peak: 0, retireAge: 0, juniorTitles: 0, noSeat: 0, releases: 0, podiums: 0 };
  for (let i = 0; i < N; i++) {
    const { tier, p } = filter(i);
    const c = autoplayCareer({ seed: 10_000 + i * 7 + tier * 1000, name: 'Test', nationality: 'KR', wealthTier: tier, personality: p, candidateIndex: i % 3, focus: [] });
    if (c.f1Debut !== null) row.f1++;
    if (c.totals.f1Titles > 0) row.champ++;
    row.titles += c.totals.f1Titles;
    row.starts += c.totals.f1Starts;
    row.wins += c.totals.f1Wins;
    row.peak += c.totals.bestOvr;
    row.retireAge += c.age;
    row.juniorTitles += c.totals.juniorTitles.length;
    row.noSeat += c.history.filter((h) => h.seat === 'none').length;
    row.releases += c.totals.releases;
    row.podiums += c.totals.f1Podiums;
  }
  return row;
}

function print(label: string, r: Row): void {
  console.log(
    `${label.padEnd(10)} F1진출 ${pctf(r.f1 / N)}  챔피언 ${pctf(r.champ / N)}  진출 후 챔피언 ${r.f1 ? pctf(r.champ / r.f1) : '  - '}  ` +
      `평균 타이틀 ${(r.titles / N).toFixed(2)}  F1출전 ${(r.starts / N).toFixed(0).padStart(3)}  F1우승 ${(r.wins / N).toFixed(1).padStart(4)}  ` +
      `F1포디움 ${(r.podiums / N).toFixed(1).padStart(4)}  최고OVR ${(r.peak / N).toFixed(1)}  은퇴 ${(r.retireAge / N).toFixed(1)}세  방출 ${(r.releases / N).toFixed(2)}회  무소속시즌 ${(r.noSeat / N).toFixed(1)}`,
  );
}

const t0 = Date.now();
console.log(`커리어 ${N}개씩\n\n[자산 규모별]`);
for (const tier of [1, 2, 3, 4, 5] as WealthTier[]) print(`${tier}단계`, run((i) => ({ tier, p: personalities[i % personalities.length]! })));
let all = 0, allChamp = 0;
console.log('\n[성격별, 자산 3단계]');
for (const p of personalities) {
  const r = run(() => ({ tier: 3, p }));
  all += N; allChamp += r.champ;
  print(`${PERSONALITIES[p].label}(${PERSONALITIES[p].temperament})`, r);
}
console.log(`\n전체 챔피언 비율(성격별 표본 합): ${pctf(allChamp / all)} — 목표 10~20%`);
console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)}초`);
