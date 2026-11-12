// 언론·팬 반응 피드(SPEC §6.1): 가상 매체·가상 해설가·팀 공식 계정·팬 게시물
import { useEffect, useState } from 'react';
import { PLATFORM_LABEL, PLATFORM_LIKE, type Chat, type FeedItem, type FanPlatform } from '../engine';

const PLATFORM_STYLE: Record<FanPlatform, string> = {
  reddit: 'bg-orange-500/15 text-orange-300',
  dcinside: 'bg-blue-500/15 text-blue-300',
  x: 'bg-white/10 text-zinc-200',
};

const KIND_STYLE: Record<FeedItem['kind'], { badge: string; label: string }> = {
  press: { badge: 'bg-sky-500/15 text-sky-300', label: '기사' },
  expert: { badge: 'bg-violet-500/15 text-violet-300', label: '분석' },
  team: { badge: 'bg-emerald-500/15 text-emerald-300', label: '팀' },
  fan: { badge: 'bg-white/10 text-zinc-300', label: '팬' },
};

export function FeedList({ items }: { items: FeedItem[] }) {
  return (
    <ul className="space-y-2" aria-label="언론·팬 반응">
      {items.map((f, i) => {
        const k = KIND_STYLE[f.kind];
        return (
          <li key={i} className="rounded-xl border border-white/10 bg-zinc-950/60 p-3">
            <div className="flex items-center gap-2 text-xs">
              {f.platform
                ? <span className={`rounded-full px-2 py-0.5 font-bold ${PLATFORM_STYLE[f.platform]}`}>{PLATFORM_LABEL[f.platform]}</span>
                : <span className={`rounded-full px-2 py-0.5 font-bold ${k.badge}`}>{k.label}</span>}
              <span className="font-bold text-zinc-200">{f.author}</span>
              {f.translated && <span className="text-zinc-500">번역</span>}
              {f.likes !== undefined && <span className="ml-auto text-zinc-500">{f.platform ? PLATFORM_LIKE[f.platform] : '♥'} {f.likes.toLocaleString('ko-KR')}</span>}
            </div>
            <p className="mt-1.5 text-sm text-zinc-200">{f.text}</p>
          </li>
        );
      })}
    </ul>
  );
}

/** 댓글 한 줄 */
export function ChatLine({ c }: { c: Chat }) {
  return (
    <li className="chat-in flex items-start gap-2 text-xs">
      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${PLATFORM_STYLE[c.platform]}`}>{PLATFORM_LABEL[c.platform]}</span>
      <span className="shrink-0 font-bold text-zinc-400">{c.author}</span>
      <span className="text-zinc-200">{c.text}</span>
    </li>
  );
}

/** 시즌 반응 아래에서 계속 바뀌며 올라오는 댓글(SPEC §6.1 v0.30). 한 번에 3개, 2.6초마다 하나씩 */
export function RollingComments({ comments, title = '실시간 댓글' }: { comments: Chat[]; title?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (comments.length <= 3) return;
    const id = setInterval(() => setN((v) => v + 1), 2600);
    return () => clearInterval(id);
  }, [comments.length]);
  if (!comments.length) return null;
  const shown = [0, 1, 2].map((k) => ({ i: n + k, c: comments[(n + k) % comments.length]! })).slice(0, Math.min(3, comments.length)).reverse();
  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-zinc-950/60 p-3" aria-label={title}>
      <div className="mb-2 flex items-center gap-2 text-xs font-bold text-zinc-300"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />{title}</div>
      <ul className="space-y-1.5">{shown.map(({ i, c }) => <ChatLine key={i} c={c} />)}</ul>
    </div>
  );
}
