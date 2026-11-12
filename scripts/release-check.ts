// 방출 점검: 좋은 시즌 뒤 방출이 얼마나 나오는지
import { autoplayCareer, PERSONALITIES, type Personality } from '../src/engine';
const n = Number(process.argv[2] ?? 60);
let champ = 0, champRel = 0, top3 = 0, top3Rel = 0, rel = 0, seasons = 0;
for (const p of Object.keys(PERSONALITIES) as Personality[]) {
  for (let i = 0; i < n; i++) {
    const c = autoplayCareer({ seed: 50_000 + i * 13, name: 'T', nationality: 'KR', wealthTier: 3, personality: p, candidateIndex: i % 3, focus: [] });
    for (const h of c.history) {
      if (h.series !== 'f1' || h.seat !== 'race') continue;
      seasons++;
      const r = h.notes.some((x) => x.includes('방출'));
      if (r) rel++;
      if (h.champion) { champ++; if (r) champRel++; }
      else if (h.position !== null && h.position <= 3) { top3++; if (r) top3Rel++; }
    }
  }
}
console.log(`F1 레이스 시즌 ${seasons}, 방출 ${rel} (${(rel / seasons * 100).toFixed(1)}%)`);
console.log(`챔피언 시즌 ${champ}, 그 뒤 방출 ${champRel} (${(champRel / Math.max(1, champ) * 100).toFixed(1)}%)`);
console.log(`2~3위 시즌 ${top3}, 그 뒤 방출 ${top3Rel} (${(top3Rel / Math.max(1, top3) * 100).toFixed(1)}%)`);
