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

// ── 플레이어 이름(SPEC v0.37) ─────────────────────────────────────────
/** 성을 먼저 부르는 나라(동아시아·베트남·헝가리 등) */
export const FAMILY_FIRST_NATIONS = new Set(['KR', 'KP', 'JP', 'CN', 'TW', 'HK', 'MO', 'VN', 'HU', 'KH']);

const EAST_SCRIPT = /^[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+$/u;

/**
 * 국적에 맞는 성명 순서. 한국·일본·중국 등은 "성 이름", 그 밖은 "이름 성".
 * 한글·한자·가나로만 쓴 이름은 띄어 쓰지 않는다(김민준, 佐藤健).
 */
export function formatFullName(surname: string, given: string, nationality: string): string {
  const s = surname.trim();
  const g = given.trim();
  if (!s) return g;
  if (!g) return s;
  if (FAMILY_FIRST_NATIONS.has(nationality)) return EAST_SCRIPT.test(s) && EAST_SCRIPT.test(g) ? `${s}${g}` : `${s} ${g}`;
  return `${g} ${s}`;
}

/** 경기·기사·댓글에서 부르는 이름: 별명으로 불리길 원하면 별명, 아니면 국적에 맞는 성명 */
export function calledName(x: { surname: string; given: string; nationality: string; nickname?: string; useNickname?: boolean }): string {
  const nick = x.nickname?.trim();
  return x.useNickname && nick ? nick : formatFullName(x.surname, x.given, x.nationality);
}

/** 타이밍 타워의 세 글자 코드: 로마자 성이면 성의 앞 세 글자(F1처럼), 아니면 본명에서(별명으로 불려도 코드는 본명) */
export function driverCode(surname: string | undefined, name: string): string {
  const latin = (surname ?? '').replace(/[^A-Za-z]/g, '');
  if (latin.length >= 3) return latin.slice(0, 3).toUpperCase();
  return name.replace(/[^A-Za-z가-힣]/g, '').slice(0, 3).toUpperCase() || 'YOU';
}
