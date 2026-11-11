import type { ReactNode } from 'react';

export function Card({ title, children, className = '', right }: { title?: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-zinc-900/70 p-4 sm:p-5 ${className}`}>
      {title && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold tracking-wide text-zinc-300">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({
  children, onClick, variant = 'primary', disabled, className = '', type = 'button',
}: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; className?: string; type?: 'button' | 'submit' }) {
  const styles = {
    primary: 'bg-racing text-white hover:bg-racing-dark disabled:bg-zinc-700 disabled:text-zinc-400',
    ghost: 'border border-white/15 text-zinc-200 hover:bg-white/5 disabled:opacity-40',
    danger: 'border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-40',
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${styles} ${className}`}>
      {children}
    </button>
  );
}

export function Bar({ value, max = 100, color = 'bg-racing', className = '' }: { value: number; max?: number; color?: string; className?: string }) {
  const w = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-white/10 ${className}`}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${w}%` }} />
    </div>
  );
}

export function Pill({ children, tone = 'zinc' }: { children: ReactNode; tone?: 'zinc' | 'red' | 'green' | 'amber' | 'blue' }) {
  const tones = {
    zinc: 'bg-white/10 text-zinc-200',
    red: 'bg-red-500/15 text-red-300',
    green: 'bg-emerald-500/15 text-emerald-300',
    amber: 'bg-amber-500/15 text-amber-300',
    blue: 'bg-sky-500/15 text-sky-300',
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${tones}`}>{children}</span>;
}

export const STAT_LABELS: Record<string, string> = {
  pace: '순간 속도',
  racecraft: '레이스크래프트',
  tyre: '타이어 관리',
  consistency: '일관성',
  wet: '우천',
  feedback: '기술 피드백',
};

export const SEAT_LABELS: Record<string, string> = { race: '레이스 시트', reserve: '리저브', none: '시트 없음' };

export const TEMPERAMENT_LABELS: Record<string, { label: string; tone: 'green' | 'amber' | 'red'; desc: string }> = {
  good: { label: '꾸준함', tone: 'green', desc: '실수가 적고 성적이 고르다. 대신 정상에 오를 한 방이 부족하다' },
  neutral: { label: '균형', tone: 'amber', desc: '꾸준함과 한 방 사이' },
  bad: { label: '한 방', tone: 'red', desc: '들쑥날쑥하지만 정상에 오를 잠재력이 크다. 팀과 부딪혀 방출될 수 있다' },
};
