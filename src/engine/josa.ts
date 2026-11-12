// 한국어 조사(SPEC v0.38): 이름 뒤에 붙는 은/는, 이/가, 을/를, 과/와, 으로/로를 받침에 맞게 고른다.
// 한글은 실제 받침으로, 숫자는 한국어 읽기로, 로마자 이름은 한국어로 읽을 때의 받침을 어림한다(Verstappen → 페르스타펜: 받침 있음).

export type JosaPair = '은/는' | '이/가' | '을/를' | '과/와' | '으로/로';

const DIGIT_BATCHIM: Record<string, boolean> = { '0': true, '1': true, '2': false, '3': true, '4': false, '5': false, '6': true, '7': true, '8': true, '9': false };
const VOWELS = 'aeiouy';

/** 받침: 'none' 없음, 'rieul' ㄹ 받침, 'other' 그 밖의 받침 */
export function batchim(word: string): 'none' | 'rieul' | 'other' {
  // 괄호 설명은 빼고 앞말로 판단한다: Shot(Haas) → Shot
  let w = word.trim();
  while (/\([^()]*\)$/.test(w)) w = w.replace(/\s*\([^()]*\)$/, '').trim();
  w = w.replace(/["'“”‘’.!?…\s]+$/, '');
  const ch = w.slice(-1);
  if (!ch) return 'none';
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    return jong === 0 ? 'none' : jong === 8 ? 'rieul' : 'other';
  }
  if (/[0-9]/.test(ch)) {
    // 10·100·1000은 십·백·천
    if (ch === '0' && /[1-9]0+$/.test(w)) return 'other';
    return ch === '1' || ch === '7' || ch === '8' ? 'rieul' : DIGIT_BATCHIM[ch] ? 'other' : 'none';
  }
  const latin = w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const last = latin.slice(-1);
  const prev = latin.slice(-2, -1);
  if (!/[a-z]/.test(last)) return 'none';
  if (last === 'l') return 'rieul';
  if (last === 'm' || last === 'n') return 'other';
  if (latin.endsWith('ng')) return 'other';
  // Alpine → 알핀, Anne → 앤: 끝 e가 소리 나지 않고 앞이 n·m이면 받침
  if (last === 'e' && (prev === 'n' || prev === 'm')) return 'other';
  // 짧은 모음 뒤의 k·c·t·p는 받침(Cadillac → 캐딜락, Shot → 샷), 그 밖(Mark → 마크)은 받침 없음
  if ('kctp'.includes(last)) {
    const before = latin.slice(-3, -2);
    return VOWELS.includes(prev) && !VOWELS.includes(before) ? 'other' : 'none';
  }
  return 'none';
}

/** 단어에 맞는 조사만 돌려준다 */
export function josaOf(word: string, pair: JosaPair): string {
  const b = batchim(word);
  if (pair === '으로/로') return b === 'other' ? '으로' : '로';
  const [withB, withoutB] = pair.split('/') as [string, string];
  return b === 'none' ? withoutB : withB;
}

/** 단어 + 맞는 조사 */
export function josa(word: string, pair: JosaPair): string {
  return word + josaOf(word, pair);
}

const PAIRS: Array<[string, JosaPair]> = [
  ['으로', '으로/로'], ['로', '으로/로'], ['은', '은/는'], ['는', '은/는'], ['이', '이/가'], ['가', '이/가'],
  ['을', '을/를'], ['를', '을/를'], ['과', '과/와'], ['와', '과/와'],
];
const PARTICLE = PAIRS.map(([p]) => p).join('|');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 템플릿에 이름을 넣은 뒤, 그 이름 바로 뒤의 조사를 받침에 맞게 고친다.
 * "{name}은" 같은 템플릿에 "Luca Rossi"가 들어가면 "Luca Rossi는"이 된다. 이름 뒤 괄호(팀 이름 등)도 건너뛴다.
 */
export function fixJosa(text: string, words: Array<string | undefined | null>): string {
  let out = text;
  const list = [...new Set(words.filter((w): w is string => !!w && w.trim().length > 0))].sort((a, b) => b.length - a.length);
  for (const w of list) {
    const re = new RegExp(`(${esc(w)})(\\s?\\([^()]*\\))?(${PARTICLE})(?=[\\s,.!?…"”'’)·:]|$)`, 'g');
    out = out.replace(re, (_m, word: string, paren: string | undefined, p: string) => {
      const pair = PAIRS.find(([x]) => x === p)![1];
      return `${word}${paren ?? ''}${josaOf(word, pair)}`;
    });
  }
  return out;
}
