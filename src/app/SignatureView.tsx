// 서명 표시(SPEC §3.3): 정규화된 획을 SVG path로 그린다. animate면 획 순서대로 다시 그려진다(0.8초).

import type { Signature, Stroke } from './store';

const VW = 1000;
const VH = 300;

function strokePath(s: Stroke, w = VW, h = VH): string {
  if (s.length === 0) return '';
  const pts = s.map((p) => [(p[0] ?? 0) * w, (p[1] ?? 0) * h] as const);
  const [x0, y0] = pts[0]!;
  if (pts.length === 1) return `M${x0},${y0} l0.1,0`;
  let d = `M${x0.toFixed(1)},${y0.toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i]!;
    const [nx, ny] = pts[i + 1]!;
    d += ` Q${x.toFixed(1)},${y.toFixed(1)} ${((x + nx) / 2).toFixed(1)},${((y + ny) / 2).toFixed(1)}`;
  }
  const [lx, ly] = pts[pts.length - 1]!;
  return d + ` L${lx.toFixed(1)},${ly.toFixed(1)}`;
}

function strokeLength(s: Stroke): number {
  let L = 0;
  for (let i = 1; i < s.length; i++) {
    const dx = ((s[i]![0] ?? 0) - (s[i - 1]![0] ?? 0)) * VW;
    const dy = ((s[i]![1] ?? 0) - (s[i - 1]![1] ?? 0)) * VH;
    L += Math.hypot(dx, dy);
  }
  return L;
}

export function SignatureView({ sig, animate = false, className = '', color = 'currentColor' }: { sig: Signature; animate?: boolean; className?: string; color?: string }) {
  if (sig.typed) {
    return (
      <svg viewBox={`0 0 ${VW} ${VH}`} className={className} role="img" aria-label={`서명: ${sig.typed}`}>
        <text x={VW / 2} y={VH * 0.68} textAnchor="middle" fontFamily='"Nanum Pen Script", cursive' fontSize={170} fill={color} className={animate ? 'sig-fade' : ''}>
          {sig.typed}
        </text>
      </svg>
    );
  }
  const lengths = sig.strokes.map(strokeLength);
  const total = lengths.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className={className} role="img" aria-label="서명">
      {sig.strokes.map((s, i) => {
        const delay = (acc / total) * 0.8;
        const dur = Math.max(0.05, ((lengths[i] ?? 0) / total) * 0.8);
        acc += lengths[i] ?? 0;
        return (
          <path
            key={i}
            d={strokePath(s)}
            fill="none"
            stroke={color}
            strokeWidth={9}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            style={animate ? { strokeDasharray: 1, strokeDashoffset: 1, animation: `sig-draw ${dur}s linear ${delay}s forwards` } : undefined}
          />
        );
      })}
    </svg>
  );
}
