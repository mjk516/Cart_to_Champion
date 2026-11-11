// 드라이버 헬멧(SPEC §3.6 v0.25): 바탕색·포인트색·무늬와 차 번호로 그리는 옆모습 헬멧.

import type { Helmet } from '../engine';

export function HelmetView({ helmet, number, size = 96 }: { helmet: Helmet; number?: number; size?: number }) {
  const { base, accent, pattern } = helmet;
  const id = `helmet-${base.slice(1)}-${accent.slice(1)}-${pattern}`;
  const shell = 'M14 62 C14 30 36 12 62 12 C86 12 104 28 106 52 L106 66 C106 72 102 76 96 76 L60 76 L54 86 L22 86 C17 86 14 82 14 76 Z';
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 120 96" role="img" aria-label={`헬멧${number ? ` · ${number}번` : ''}`} className="shrink-0">
      <defs><clipPath id={id}><path d={shell} /></clipPath></defs>
      <path d={shell} fill={base} />
      <g clipPath={`url(#${id})`}>
        {pattern === 'stripe' && <rect x="0" y="38" width="120" height="10" fill={accent} />}
        {pattern === 'chevron' && <path d="M0 30 L60 52 L120 30 L120 44 L60 66 L0 44 Z" fill={accent} />}
        {pattern === 'split' && <rect x="60" y="0" width="60" height="96" fill={accent} />}
        {pattern === 'stars' && [[34, 30], [54, 22], [46, 46], [26, 52]].map(([x, y], i) => (
          <path key={i} transform={`translate(${x} ${y}) scale(0.9)`} d="M0 -7 L2 -2 L7 -2 L3 1 L5 7 L0 3 L-5 7 L-3 1 L-7 -2 L-2 -2 Z" fill={accent} />
        ))}
      </g>
      {/* 바이저 */}
      <path d="M64 40 L104 40 C106 46 106 56 104 62 L70 62 C64 62 62 56 62 50 Z" fill="#0f172a" stroke="#000" strokeOpacity={0.4} />
      <path d="M70 44 L100 44" stroke="#fff" strokeOpacity={0.35} strokeWidth={2} strokeLinecap="round" />
      <path d={shell} fill="none" stroke="#000" strokeOpacity={0.45} strokeWidth={2} />
      {number !== undefined && (
        <text x="36" y="76" textAnchor="middle" fontSize="18" fontWeight={900} fill={accent} stroke={base === accent ? '#000' : 'none'} strokeWidth={0.6} fontFamily="system-ui, sans-serif">{number}</text>
      )}
    </svg>
  );
}
