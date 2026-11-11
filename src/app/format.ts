// 금액 표시(SPEC §7, PRD CT-6): 유로 기본 + 원화 환산. 모든 금액은 formatMoney 하나를 거친다.

/** ⚠️ 임시값. 출시 직전 실제 환율로 정해 고정한다(SPEC §14) */
export const EUR_KRW = 1600;

export function formatEur(eur: number): string {
  const sign = eur < 0 ? '−' : '';
  const v = Math.abs(eur);
  if (v >= 1_000_000) return `${sign}€${(v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)}M`;
  if (v >= 1_000) return `${sign}€${Math.round(v / 1_000)}k`;
  return `${sign}€${Math.round(v)}`;
}

export function formatKrw(eur: number): string {
  const won = Math.abs(eur) * EUR_KRW;
  const sign = eur < 0 ? '−' : '';
  if (won >= 100_000_000) return `${sign}약 ${(won / 100_000_000).toFixed(won >= 1_000_000_000 ? 0 : 1)}억 원`;
  return `${sign}약 ${Math.round(won / 10_000).toLocaleString('ko-KR')}만 원`;
}

export function formatMoney(eur: number, showKrw: boolean): string {
  return showKrw ? `${formatEur(eur)} (${formatKrw(eur)})` : formatEur(eur);
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
