// 사이트 주소. GitHub Pages(예전 주소)에서 열면 새 주소로 옮겼다는 안내를 띄운다.

export const SITE_URL = 'https://cart-to-champion.vercel.app/';

export function onOldSite(): boolean {
  return typeof location !== 'undefined' && location.hostname.endsWith('github.io');
}
