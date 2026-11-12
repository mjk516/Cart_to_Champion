// 예전 주소 → 새 주소로 커리어 옮기기: 저장 파일을 압축해 새 주소 링크(#move=)에 실어 보낸다.
// 링크는 브라우저 안에서만 오가고(주소의 # 뒤는 서버로 가지 않는다) 새 주소에서 받자마자 지운다.

import { SITE_URL } from './site';

const PREFIX = '#move=';

function toB64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function packSave(text: string): Promise<string> {
  if (typeof CompressionStream === 'undefined') return 'u.' + encodeURIComponent(text);
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return 'g.' + toB64url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

export async function unpackSave(data: string): Promise<string> {
  if (data.startsWith('u.')) return decodeURIComponent(data.slice(2));
  if (!data.startsWith('g.')) throw new Error('unknown');
  const stream = new Blob([fromB64url(data.slice(2))]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

/** 새 주소로 가는 링크(저장 파일 포함) */
export async function moveUrl(saveText: string, base = SITE_URL): Promise<string> {
  return base + PREFIX + (await packSave(saveText));
}

/** 새 주소에서: 링크로 넘어온 저장 파일을 꺼내고 주소에서 지운다 */
export async function takeIncomingSave(): Promise<string | null> {
  if (typeof location === 'undefined' || !location.hash.startsWith(PREFIX)) return null;
  const data = location.hash.slice(PREFIX.length);
  history.replaceState(null, '', location.pathname + location.search);
  try { return await unpackSave(data); } catch { return null; }
}
