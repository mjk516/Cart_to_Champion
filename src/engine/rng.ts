// 결정적 난수. 엔진 전체에서 Math.random 대신 이 모듈만 쓴다(SPEC §10, PRD §8.2).

export type Rng = () => number;

/** mulberry32: 32비트 시드 → [0, 1) 난수 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 여러 값을 하나의 32비트 시드로 섞는다(FNV-1a 변형). 같은 입력이면 항상 같은 값. */
export function hashSeed(...parts: Array<number | string>): number {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= 0x9e3779b9;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** 용도별 독립 스트림. 예: rngFor(seed, 'lap', 12) */
export function rngFor(...parts: Array<number | string>): Rng {
  return mulberry32(hashSeed(...parts));
}

/** 표준정규분포(Box–Muller) */
export function normal(rng: Rng): number {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function int(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick: empty list');
  return items[Math.floor(rng() * items.length)] as T;
}

/** 가중치 비례로 하나를 고른다 */
export function weightedPick<T>(rng: Rng, items: readonly T[], weight: (t: T) => number): T {
  const total = items.reduce((s, t) => s + Math.max(0, weight(t)), 0);
  if (items.length === 0 || total <= 0) throw new Error('weightedPick: no weight');
  let r = rng() * total;
  for (const t of items) {
    r -= Math.max(0, weight(t));
    if (r <= 0) return t;
  }
  return items[items.length - 1] as T;
}
