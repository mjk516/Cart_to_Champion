// 가상 드라이버 이름 생성기(SPEC §2.2). 실존 F1 드라이버 성(姓)과 겹치지 않게 한다.

import { DRIVERS_2026 } from './data';
import { pick, type Rng } from './rng';

const FIRST = [
  'Luca', 'Mateo', 'Noah', 'Elias', 'Leon', 'Hugo', 'Oskar', 'Theo', 'Rafael', 'Tomas', 'Kai', 'Jonas', 'Felix',
  'Adrien', 'Marco', 'Diego', 'Sebastian', 'Emil', 'Nathan', 'Ryo', 'Haruto', 'Min-jun', 'Ji-ho', 'Arjun', 'Yuki',
  'Lorenzo', 'Pablo', 'Victor', 'Matias', 'Owen', 'Callum', 'Finn', 'Anton', 'Milan', 'Bruno', 'Iker',
];
const LAST = [
  'Moreau', 'Kessler', 'Varga', 'Lindqvist', 'Rossetti', 'Castell', 'Novak', 'Brandt', 'Okafor', 'Duarte', 'Ferraz',
  'Halvorsen', 'Marchetti', 'Delacroix', 'Vogel', 'Sato', 'Tanaka', 'Park', 'Kang', 'Mehta', 'Quinn', 'Hale',
  'Ortega', 'Santoro', 'Weber', 'Kowalski', 'Ivanov', 'Laurent', 'Mendes', 'Riva', 'Aalto', 'Bianchini', 'Corral',
];
const NATIONS = ['IT', 'FR', 'DE', 'GB', 'ES', 'NL', 'BR', 'JP', 'KR', 'US', 'AU', 'FI', 'PL', 'IN', 'MX', 'AR', 'BE', 'DK'];

const REAL_SURNAMES = new Set(DRIVERS_2026.map((d) => d.name.split(' ').slice(1).join(' ').toLowerCase()));

export function fictionalName(rng: Rng): { name: string; code: string; nationality: string } {
  for (let i = 0; i < 20; i++) {
    const last = pick(rng, LAST);
    if (REAL_SURNAMES.has(last.toLowerCase())) continue;
    const name = `${pick(rng, FIRST)} ${last}`;
    return { name, code: last.slice(0, 3).toUpperCase(), nationality: pick(rng, NATIONS) };
  }
  return { name: 'Alex Moreau', code: 'MOR', nationality: 'FR' };
}
