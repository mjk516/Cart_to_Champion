// 실제 서킷 레이아웃 빌드 스크립트(SPEC §5.5 서킷 데이터).
// 원본: bacinger/f1-circuits (MIT). f1-circuits.geojson을 받아 경로를 인자로 넘긴다.
//   npx tsx scripts/build-circuits.ts <f1-circuits.geojson 경로>
// 위경도를 평면 좌표로 바꾸고, 트랙 뷰 상자(640×300)에 가장 크게 들어가도록 돌린 뒤
// SVG path로 저장한다. 결과: src/app/circuitPaths.ts

import { readFileSync, writeFileSync } from 'node:fs';
import { ALL_F1_CIRCUITS } from '../src/engine/data';

const W = 640, H = 300, PAD = 16;

/** 게임 서킷 id → bacinger id */
const MAP: Record<string, string> = {
  australia: 'au-1953', china: 'cn-2004', japan: 'jp-1962', bahrain: 'bh-2002', saudi_arabia: 'sa-2021',
  miami: 'us-2022', canada: 'ca-1978', monaco: 'mc-1929', barcelona: 'es-1991', austria: 'at-1969',
  britain: 'gb-1948', belgium: 'be-1925', hungary: 'hu-1986', netherlands: 'nl-1948', italy: 'it-1922',
  madrid: 'es-2026', azerbaijan: 'az-2016', singapore: 'sg-2008', usa: 'us-2012', mexico: 'mx-1962',
  brazil: 'br-1940', las_vegas: 'us-2023', qatar: 'qa-2004', abu_dhabi: 'ae-2009',
  // 캘린더 복귀 후보(21세기 F1 개최 서킷)
  imola: 'it-1953', portimao: 'pt-2008', istanbul: 'tr-2005', sepang: 'my-1999', hockenheim: 'de-1932',
  nurburgring: 'de-1927', paul_ricard: 'fr-1969', magny_cours: 'fr-1960', mugello: 'it-1914', indianapolis: 'us-1909',
};

interface Feature { properties: { id: string }; geometry: { type: string; coordinates: number[][] } }

const src = process.argv[2];
if (!src) throw new Error('f1-circuits.geojson 경로를 인자로 주세요');
const geo = JSON.parse(readFileSync(src, 'utf8')) as { features: Feature[] };

function toPath(coords: number[][]): string {
  const lat0 = coords.reduce((a, c) => a + c[1]!, 0) / coords.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  // 북쪽이 위가 되도록 y를 뒤집는다
  const pts = coords.map(([lon, lat]) => [lon! * k, -lat!] as const);
  let best = { scale: 0, ang: 0 };
  for (let deg = 0; deg < 180; deg += 3) {
    const a = (deg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    const xs = pts.map(([x, y]) => x * ca - y * sa), ys = pts.map(([x, y]) => x * sa + y * ca);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    const scale = Math.min((W - 2 * PAD) / w, (H - 2 * PAD) / h);
    if (scale > best.scale * 1.02) best = { scale, ang: a }; // 거의 같으면 덜 돌린 쪽
  }
  const ca = Math.cos(best.ang), sa = Math.sin(best.ang);
  const rot = pts.map(([x, y]) => [x * ca - y * sa, x * sa + y * ca] as const);
  const minX = Math.min(...rot.map((p) => p[0])), maxX = Math.max(...rot.map((p) => p[0]));
  const minY = Math.min(...rot.map((p) => p[1])), maxY = Math.max(...rot.map((p) => p[1]));
  const ox = (W - (maxX - minX) * best.scale) / 2, oy = (H - (maxY - minY) * best.scale) / 2;
  return rot
    .map(([x, y], i) => `${i ? 'L' : 'M'}${(ox + (x - minX) * best.scale).toFixed(1)},${(oy + (y - minY) * best.scale).toFixed(1)}`)
    .join(' ') + ' Z';
}

const out: Record<string, string> = {};
for (const c of ALL_F1_CIRCUITS) {
  const id = MAP[c.id];
  const f = geo.features.find((x) => x.properties.id === id);
  if (!f || f.geometry.type !== 'LineString') throw new Error(`레이아웃 없음: ${c.id} (${id})`);
  out[c.id] = toPath(f.geometry.coordinates);
}

const body = Object.entries(out).map(([k, v]) => `  ${k}: '${v}',`).join('\n');
writeFileSync('src/app/circuitPaths.ts', `// 자동 생성 파일: scripts/build-circuits.ts. 직접 고치지 마세요.
// 서킷 레이아웃 원본: bacinger/f1-circuits, Copyright (c) 2019-2025 Tomislav Bacinger, MIT License.
// 트랙 뷰 상자 ${W}×${H} 기준 SVG path. F1 그랑프리에서만 쓴다(하부 리그는 일반 레이아웃).

export const CIRCUIT_PATHS: Record<string, string> = {
${body}
};
`);
console.log(`서킷 ${Object.keys(out).length}개 저장`);
