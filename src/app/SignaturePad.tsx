// 서명 패드(SPEC §3.3): Pointer Events로 마우스·터치·펜을 모두 받는다. 외부 라이브러리 없이 <canvas>로 그린다.

import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Signature, Stroke } from './store';
import { Button } from './ui';

const MAX_POINTS = 2000;
const MIN_STEP = 0.004; // 정규화 좌표 기준 최소 간격(점 간소화)

function totalLength(strokes: Stroke[], aspect: number): number {
  let L = 0;
  for (const s of strokes) for (let i = 1; i < s.length; i++) {
    L += Math.hypot((s[i]![0]! - s[i - 1]![0]!), (s[i]![1]! - s[i - 1]![1]!) / aspect);
  }
  return L;
}

function bboxWidth(strokes: Stroke[]): number {
  const xs = strokes.flat().map((p) => p[0]!);
  return xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
}

export function SignaturePad({ name, onDone, hint, doneLabel = '완료' }: { name: string; onDone: (s: Signature) => void; hint?: string; doneLabel?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const [error, setError] = useState('');

  const draw = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = el.getBoundingClientRect();
    if (el.width !== Math.round(width * dpr)) { el.width = Math.round(width * dpr); el.height = Math.round(height * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    // 서명선
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, height * 0.72);
    ctx.lineTo(width - 24, height * 0.72);
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
    const all = current.current ? [...strokes, current.current] : strokes;
    for (const s of all) {
      for (let i = 1; i < s.length; i++) {
        const a = s[i - 1]!;
        const b = s[i]!;
        // 빠르면 가늘게, 느리면 굵게. 펜 압력이 있으면 압력을 쓴다
        const dt = Math.max(1, (b[2] ?? 0) - (a[2] ?? 0));
        const speed = Math.hypot((b[0]! - a[0]!) * width, (b[1]! - a[1]!) * height) / dt;
        const pressure = b[3] && b[3] > 0 && b[3] !== 0.5 ? b[3] : null;
        ctx.lineWidth = pressure ? 1.5 + pressure * 4 : Math.max(1.4, Math.min(4.2, 4.2 - speed * 1.6));
        ctx.beginPath();
        ctx.moveTo(a[0]! * width, a[1]! * height);
        const mx = ((a[0]! + b[0]!) / 2) * width;
        const my = ((a[1]! + b[1]!) / 2) * height;
        ctx.quadraticCurveTo(a[0]! * width, a[1]! * height, mx, my);
        ctx.lineTo(b[0]! * width, b[1]! * height);
        ctx.stroke();
      }
    }
  }, [strokes]);

  useEffect(() => {
    draw();
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [
      Math.round(((e.clientX - r.left) / r.width) * 1000) / 1000,
      Math.round(((e.clientY - r.top) / r.height) * 1000) / 1000,
      Math.round(e.timeStamp),
      Math.round((e.pressure || 0) * 100) / 100,
    ];
  };
  const pointCount = strokes.reduce((a, s) => a + s.length, 0);

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        aria-label="서명 패드: 마우스나 손가락으로 서명하세요"
        className="h-40 w-full cursor-crosshair rounded-xl bg-[#f6f1e7] shadow-inner sm:h-[200px]"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          current.current = [point(e)];
          setError('');
          draw();
        }}
        onPointerMove={(e) => {
          const s = current.current;
          if (!s || pointCount + s.length >= MAX_POINTS) return;
          const p = point(e);
          const last = s[s.length - 1]!;
          if (Math.hypot(p[0]! - last[0]!, p[1]! - last[1]!) < MIN_STEP) return;
          s.push(p);
          draw();
        }}
        onPointerUp={() => {
          const s = current.current;
          current.current = null;
          if (s && s.length > 1) setStrokes((prev) => [...prev, s]);
          else draw();
        }}
      />
      {hint && <p className="text-xs text-zinc-400">{hint}</p>}
      {error && <p className="text-sm font-bold text-amber-300">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => setStrokes([])} disabled={!strokes.length}>지우기</Button>
        <Button variant="ghost" onClick={() => setStrokes((p) => p.slice(0, -1))} disabled={!strokes.length}>한 획 취소</Button>
        <Button variant="ghost" onClick={() => onDone({ strokes: [], typed: name })}>이름으로 서명 만들기</Button>
        <Button
          className="ml-auto"
          onClick={() => {
            const el = canvasRef.current;
            const aspect = el ? el.getBoundingClientRect().width / el.getBoundingClientRect().height : 2.8;
            if (!strokes.length || totalLength(strokes, aspect) < 0.3 || bboxWidth(strokes) < 0.2) {
              setError('조금 더 크게 그려 주세요');
              return;
            }
            onDone({ strokes });
          }}
        >
          {doneLabel}
        </Button>
      </div>
    </div>
  );
}
