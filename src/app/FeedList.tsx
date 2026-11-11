// 언론·팬 반응 피드(SPEC §6.1): 가상 매체·가상 해설가·팀 공식 계정·팬 게시물
import { PLATFORM_LABEL, PLATFORM_LIKE, type FeedItem, type FanPlatform } from '../engine';

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
