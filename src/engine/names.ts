// 가상 드라이버 이름 생성기(SPEC §2.2). 실존 F1 드라이버 성(姓)과 겹치지 않게 한다.

import { DRIVERS_2026 } from './data';
import { pick, rngFor, type Rng } from './rng';

/**
 * 나라별 이름 풀(SPEC v0.38): 이름과 성이 같은 나라에서 나온다(한국 성 + 이탈리아 이름 같은 조합이 없게).
 * weight는 모터스포츠에서 드라이버가 나오는 정도. 실존 F1 드라이버 성과 겹치는 성은 뽑지 않는다.
 */
interface NamePool { weight: number; first: string[]; last: string[] }
const POOLS: Record<string, NamePool> = {
  GB: { weight: 3, first: ['Oliver', 'Harry', 'Jack', 'Callum', 'Archie', 'Freddie', 'Rory', 'Alfie', 'Toby', 'Jamie', 'Ethan', 'Reuben', 'Kieran', 'Owen'], last: ['Whitmore', 'Ashford', 'Pemberton', 'Hale', 'Carver', 'Langley', 'Thornton', 'Blake', 'Fairfax', 'Holloway', 'Kendrick', 'Marsh', 'Radcliffe', 'Sutton'] },
  IT: { weight: 2, first: ['Lorenzo', 'Matteo', 'Tommaso', 'Edoardo', 'Riccardo', 'Davide', 'Filippo', 'Gabriele', 'Niccolò', 'Pietro', 'Samuele', 'Elia'], last: ['Rossetti', 'Marchetti', 'Bianchini', 'Santoro', 'Ferraro', 'Galli', 'Moretti', 'Lombardi', 'Barbieri', 'Fontana', 'Caruso', 'Vitale'] },
  FR: { weight: 2, first: ['Adrien', 'Théo', 'Hugo', 'Louis', 'Baptiste', 'Mathis', 'Clément', 'Maxence', 'Raphaël', 'Enzo', 'Valentin', 'Corentin'], last: ['Moreau', 'Delacroix', 'Laurent', 'Fournier', 'Girard', 'Lambert', 'Rousseau', 'Mercier', 'Chevalier', 'Bonnet', 'Faure', 'Garnier'] },
  DE: { weight: 2, first: ['Leon', 'Felix', 'Jonas', 'Lukas', 'Maximilian', 'Paul', 'Niklas', 'Moritz', 'Tim', 'Fabian', 'Jannik', 'Henrik'], last: ['Kessler', 'Brandt', 'Vogel', 'Weber', 'Krüger', 'Hartmann', 'Lehmann', 'Bauer', 'Schäfer', 'Wolff', 'Engel', 'Seidel'] },
  ES: { weight: 2, first: ['Pablo', 'Iker', 'Álvaro', 'Hugo', 'Daniel', 'Javier', 'Mario', 'Adrián', 'Sergio', 'Marcos', 'Rubén', 'Unai'], last: ['Castell', 'Ortega', 'Navarro', 'Romero', 'Domínguez', 'Ruiz', 'Serrano', 'Molina', 'Herrera', 'Prieto', 'Vidal', 'Campos'] },
  NL: { weight: 1.4, first: ['Daan', 'Sem', 'Lars', 'Thijs', 'Bram', 'Jesse', 'Ruben', 'Niels', 'Joris', 'Stijn'], last: ['de Groot', 'Visser', 'Bakker', 'van Dijk', 'Smit', 'Mulder', 'de Wit', 'Hendriks', 'Dekker', 'van Leeuwen'] },
  BR: { weight: 1.5, first: ['Rafael', 'Gustavo', 'Thiago', 'Felipe', 'Caio', 'Matheus', 'Enzo', 'Bruno', 'Vinícius', 'Davi', 'Arthur', 'Heitor'], last: ['Ferraz', 'Duarte', 'Mendes', 'Carvalho', 'Ribeiro', 'Almeida', 'Barros', 'Teixeira', 'Moura', 'Cardoso', 'Rocha', 'Pires'] },
  US: { weight: 1.5, first: ['Tyler', 'Mason', 'Logan', 'Cole', 'Brody', 'Hunter', 'Chase', 'Wyatt', 'Carter', 'Grayson', 'Easton', 'Jaxon'], last: ['Quinn', 'Harper', 'Brooks', 'Sullivan', 'Reed', 'Coleman', 'Hayes', 'Porter', 'Bennett', 'Walsh', 'Griffin', 'Monroe'] },
  CA: { weight: 0.9, first: ['Liam', 'Nathan', 'Mathieu', 'Gabriel', 'Owen', 'Xavier', 'Samuel', 'Benoît'], last: ['Tremblay', 'Gagnon', 'Bouchard', 'MacLeod', 'Fraser', 'Côté', 'Pelletier', 'Morin'] },
  JP: { weight: 1.2, first: ['Haruto', 'Ren', 'Sota', 'Yuma', 'Kaito', 'Riku', 'Hinata', 'Takumi', 'Daiki', 'Kenta', 'Shun', 'Itsuki'], last: ['Sato', 'Tanaka', 'Kobayashi', 'Nakamura', 'Yamamoto', 'Matsumoto', 'Inoue', 'Kimura', 'Fujiwara', 'Ishikawa', 'Kondo', 'Ogawa'] },
  KR: { weight: 0.6, first: ['Ji-hoon', 'Seo-jun', 'Do-yun', 'Ha-jun', 'Eun-woo', 'Tae-yang', 'Joon-ho', 'Hyun-woo', 'Seung-min', 'Woo-jin', 'Jae-won', 'Si-woo', 'Min-jun', 'Yeon-woo'], last: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon', 'Jang', 'Lim', 'Han', 'Shin', 'Seo', 'Kwon'] },
  CN: { weight: 0.8, first: ['Haoran', 'Zihan', 'Yuxuan', 'Junjie', 'Mingyu', 'Tianyi', 'Zhengyang', 'Weilun', 'Kaiwen', 'Bowen'], last: ['Wang', 'Li', 'Chen', 'Liu', 'Yang', 'Huang', 'Lin', 'Xu', 'Sun', 'Ma'] },
  IN: { weight: 0.7, first: ['Arjun', 'Rohan', 'Kabir', 'Vihaan', 'Aditya', 'Ishaan', 'Karan', 'Dev'], last: ['Mehta', 'Sharma', 'Kapoor', 'Iyer', 'Reddy', 'Nair', 'Malhotra', 'Bhatia'] },
  AU: { weight: 1, first: ['Cooper', 'Lachlan', 'Riley', 'Hamish', 'Flynn', 'Bailey', 'Jett', 'Darcy', 'Kai'], last: ['Mitchell', 'Clarke', 'Gallagher', 'Doyle', 'Fletcher', 'Kerr', 'Matheson', 'Nolan', 'Pritchard'] },
  NZ: { weight: 0.5, first: ['Nikau', 'Blake', 'Hunter', 'Mitchell', 'Tama', 'Finn'], last: ['Ngata', 'McKenzie', 'Tuhoe', 'Rangi', 'Wallace', 'Burke'] },
  FI: { weight: 0.9, first: ['Eetu', 'Aleksi', 'Joona', 'Onni', 'Veeti', 'Elias', 'Lauri', 'Topias'], last: ['Aalto', 'Lindqvist', 'Koskinen', 'Heikkinen', 'Laine', 'Nieminen', 'Salonen', 'Virtanen'] },
  SE: { weight: 0.7, first: ['Viktor', 'Gustav', 'Axel', 'Hugo', 'Linus', 'Albin', 'Melker'], last: ['Lindgren', 'Bergström', 'Nyberg', 'Sandberg', 'Holm', 'Ekström', 'Wallin'] },
  DK: { weight: 0.8, first: ['Mikkel', 'Rasmus', 'Frederik', 'Mads', 'Oskar', 'Emil', 'Asger'], last: ['Halvorsen', 'Jessen', 'Kjær', 'Lund', 'Dahl', 'Holst', 'Bech'] },
  BE: { weight: 0.9, first: ['Arthur', 'Jules', 'Wout', 'Lucas', 'Milan', 'Victor', 'Siebe'], last: ['Peeters', 'Janssens', 'Maes', 'Claes', 'Wouters', 'Dubois', 'Lemaire'] },
  AT: { weight: 0.6, first: ['Lukas', 'Florian', 'Tobias', 'Elias', 'Simon', 'Raphael'], last: ['Gruber', 'Huber', 'Pichler', 'Steiner', 'Moser', 'Leitner'] },
  CH: { weight: 0.5, first: ['Noah', 'Luca', 'Gian', 'Nico', 'Joel', 'Matteo'], last: ['Meier', 'Brunner', 'Zürcher', 'Frei', 'Keller', 'Baumann'] },
  PL: { weight: 0.6, first: ['Jakub', 'Kacper', 'Szymon', 'Filip', 'Mikołaj', 'Antoni'], last: ['Kowalski', 'Nowak', 'Wiśniewski', 'Zieliński', 'Kamiński', 'Lewandowski'] },
  CZ: { weight: 0.4, first: ['Tomáš', 'Jakub', 'Ondřej', 'Vojtěch', 'Matěj'], last: ['Novák', 'Dvořák', 'Černý', 'Procházka', 'Kučera'] },
  PT: { weight: 0.5, first: ['Tiago', 'Duarte', 'Rodrigo', 'Afonso', 'Gonçalo', 'Martim'], last: ['Ferreira', 'Santos', 'Costa', 'Oliveira', 'Pereira', 'Lopes'] },
  MX: { weight: 1, first: ['Diego', 'Santiago', 'Emiliano', 'Sebastián', 'Mateo', 'Leonardo', 'Iker', 'Rodrigo'], last: ['Corral', 'Villalobos', 'Garza', 'Treviño', 'Salazar', 'Ochoa', 'Cervantes', 'Zamora'] },
  AR: { weight: 0.9, first: ['Matías', 'Tomás', 'Joaquín', 'Facundo', 'Bautista', 'Thiago', 'Agustín'], last: ['Riva', 'Benítez', 'Acosta', 'Medina', 'Sosa', 'Quiroga', 'Ledesma'] },
  CO: { weight: 0.4, first: ['Andrés', 'Juan Pablo', 'Camilo', 'Esteban', 'Nicolás'], last: ['Restrepo', 'Ospina', 'Cárdenas', 'Valencia', 'Arango'] },
  EE: { weight: 0.3, first: ['Kaspar', 'Rasmus', 'Oliver', 'Karl'], last: ['Tamm', 'Saar', 'Kask', 'Mägi'] },
  TH: { weight: 0.4, first: ['Thanawat', 'Kittipong', 'Natthapong', 'Pakin'], last: ['Srisuk', 'Chaiyaporn', 'Wongsakul', 'Rattanakorn'] },
  ZA: { weight: 0.4, first: ['Ruan', 'Jaden', 'Liam', 'Thabo', 'Pieter'], last: ['van der Merwe', 'Botha', 'Nkosi', 'Pretorius', 'Steyn'] },
  IE: { weight: 0.5, first: ['Cian', 'Oisín', 'Darragh', 'Seán', 'Conor'], last: ['Byrne', 'Kavanagh', 'Brennan', 'Doherty', 'Gallagher'] },
};
const POOL_KEYS = Object.keys(POOLS);
const POOL_TOTAL = POOL_KEYS.reduce((a, k) => a + POOLS[k]!.weight, 0);

const REAL_SURNAMES = new Set(DRIVERS_2026.map((d) => d.name.split(' ').slice(1).join(' ').toLowerCase()));

function pickNation(rng: Rng): string {
  let x = rng() * POOL_TOTAL;
  for (const k of POOL_KEYS) { x -= POOLS[k]!.weight; if (x <= 0) return k; }
  return POOL_KEYS[0]!;
}

/** 이름 풀에 있는 모든 이름 수(테스트·화면 안내용) */
export function namePoolSize(): { nations: number; first: number; last: number } {
  return {
    nations: POOL_KEYS.length,
    first: POOL_KEYS.reduce((a, k) => a + POOLS[k]!.first.length, 0),
    last: POOL_KEYS.reduce((a, k) => a + POOLS[k]!.last.length, 0),
  };
}

/**
 * 가상 인물 이름. 나라를 먼저 고르고 그 나라의 이름·성을 쓴다. 이름 순서는 그 나라 방식(한국·중국 등은 성이 먼저).
 * avoid: 이미 쓰는 이름(이름 부분)·성명. 같은 이름(예: 같은 Min-jun)이 한 그리드에 겹치지 않게 다시 뽑는다
 */
export function fictionalName(rng: Rng, avoid?: Set<string>): { name: string; code: string; nationality: string; first: string } {
  let fallback: { name: string; code: string; nationality: string; first: string } | null = null;
  for (let i = 0; i < 30; i++) {
    const nationality = pickNation(rng);
    const pool = POOLS[nationality]!;
    const last = pick(rng, pool.last);
    const first = pick(rng, pool.first);
    if (REAL_SURNAMES.has(last.toLowerCase())) continue;
    const name = formatFullName(last, first, nationality);
    const letters = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z]/g, '');
    // 성이 두 글자(Li, Ma)면 이름 첫 글자를 붙여 세 글자로
    const code = (letters(last) + letters(first)).slice(0, 3).toUpperCase();
    const out = { name, code, nationality, first };
    if (!fallback) fallback = out;
    if (avoid && (avoid.has(first) || avoid.has(name))) continue;
    return out;
  }
  return fallback ?? { name: 'Alex Moreau', code: 'MOR', nationality: 'FR', first: 'Alex' };
}

/** 이전 버전 가상 이름 생성기의 이름 목록(이전 저장 파일의 "Min-jun Park" 같은 이름을 알아보는 데 쓴다) */
const LEGACY_FIRST = ['Luca', 'Mateo', 'Noah', 'Elias', 'Leon', 'Hugo', 'Oskar', 'Theo', 'Rafael', 'Tomas', 'Kai', 'Jonas', 'Felix',
  'Adrien', 'Marco', 'Diego', 'Sebastian', 'Emil', 'Nathan', 'Ryo', 'Haruto', 'Min-jun', 'Ji-ho', 'Arjun', 'Yuki',
  'Lorenzo', 'Pablo', 'Victor', 'Matias', 'Owen', 'Callum', 'Finn', 'Anton', 'Milan', 'Bruno', 'Iker'];
const KNOWN_FIRST = new Set([...LEGACY_FIRST, ...Object.values(POOLS).flatMap((p) => p.first)]);

/** 실제·가상 드라이버 이름에서 이름 부분(성을 뺀 것)을 꺼낸다. 순서가 나라 방식과 달라도 이름 목록으로 알아본다 */
export function firstNameOf(name: string, nationality: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const western = parts.slice(0, -1).join(' ');
  const eastern = parts.slice(1).join(' ');
  if (KNOWN_FIRST.has(parts[0]!) && !KNOWN_FIRST.has(eastern)) return parts[0]!;
  if (KNOWN_FIRST.has(eastern) && !KNOWN_FIRST.has(parts[0]!)) return eastern;
  return FAMILY_FIRST_NATIONS.has(nationality) ? eastern : western;
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

/**
 * 이전 저장 파일의 가상 드라이버 이름 정리(SPEC v0.39): 이름(이름 부분)이나 성명이 앞선 드라이버·플레이어와 겹치는
 * 가상 드라이버만 나라별 이름 풀에서 새 이름을 받는다. 실제 F1 드라이버와 겹치지 않는 이름은 그대로 둔다.
 * 월드 챔피언 명단·시즌 순위표에 남은 이름도 함께 바꾼다. 바꾼 드라이버 수를 돌려준다(c를 직접 바꾼다).
 */
export function renameDuplicateDrivers(c: {
  seed: number;
  driver: { name: string; fullName?: string };
  world: { drivers: Array<{ id: string; name: string; code: string; nationality: string; real: boolean }>; champions: Array<{ driverId: string; name: string }> };
  history: Array<{ f1Standings?: { drivers: Array<{ id: string; name: string }> } }>;
}): number {
  const used = new Set<string>([c.driver.name, ...(c.driver.fullName ? [c.driver.fullName] : [])]);
  for (const d of c.world.drivers) if (d.real) { used.add(d.name); used.add(firstNameOf(d.name, d.nationality)); }
  const renamed = new Map<string, string>();
  for (const d of c.world.drivers) {
    if (d.real) continue;
    const first = firstNameOf(d.name, d.nationality);
    if (!used.has(first) && !used.has(d.name)) { used.add(first); used.add(d.name); continue; }
    const nm = fictionalName(rngFor(c.seed, 'rename-driver', d.id), used);
    d.name = nm.name;
    d.code = nm.code;
    d.nationality = nm.nationality;
    used.add(nm.first);
    used.add(nm.name);
    renamed.set(d.id, nm.name);
  }
  if (renamed.size) {
    for (const ch of c.world.champions) { const n = renamed.get(ch.driverId); if (n) ch.name = n; }
    for (const h of c.history) for (const row of h.f1Standings?.drivers ?? []) { const n = renamed.get(row.id); if (n) row.name = n; }
  }
  return renamed.size;
}
