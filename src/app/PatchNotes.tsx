// 패치노트 화면: 항목(새 기능·개선·밸런스·수정·기타)별 탭으로 걸러 보고, 날짜별로 묶는다(데이터는 patchNotesData.ts).
// 세부 내용은 접어 두고 제목만 보여 줘서 스크롤을 줄인다.

import { useState } from 'react';
import { PATCH_NOTES, type PatchTag } from './patchNotesData';
import { useGame } from './store';
import { Button, Card, Pill } from './ui';

const TAGS: PatchTag[] = ['새 기능', '개선', '밸런스', '수정', '기타'];

const TAG_TONE: Record<PatchTag, 'green' | 'blue' | 'amber' | 'red' | 'zinc'> = {
  '새 기능': 'green', '개선': 'blue', '밸런스': 'amber', '수정': 'red', '기타': 'zinc',
};

const TAB_ACTIVE: Record<PatchTag | 'all', string> = {
  all: 'bg-white text-zinc-900',
  '새 기능': 'bg-emerald-400 text-zinc-900',
  '개선': 'bg-sky-400 text-zinc-900',
  '밸런스': 'bg-amber-400 text-zinc-900',
  '수정': 'bg-red-400 text-zinc-900',
  '기타': 'bg-zinc-300 text-zinc-900',
};

function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

const ALL_ITEMS = PATCH_NOTES.flatMap((d) => d.items);
const COUNT: Record<PatchTag | 'all', number> = {
  all: ALL_ITEMS.length,
  ...Object.fromEntries(TAGS.map((t) => [t, ALL_ITEMS.filter((i) => i.tag === t).length])) as Record<PatchTag, number>,
};

export function PatchNotes() {
  const { go, career } = useGame();
  const [tab, setTab] = useState<PatchTag | 'all'>('all');
  const [openAll, setOpenAll] = useState(false);
  const days = PATCH_NOTES
    .map((d) => ({ ...d, items: tab === 'all' ? d.items : d.items.filter((i) => i.tag === tab) }))
    .filter((d) => d.items.length > 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-black">패치노트</h1>
        <Button variant="ghost" onClick={() => go(career ? (career.retired ? 'retired' : 'dashboard') : 'home')}>돌아가기</Button>
      </header>

      <div className="sticky top-[49px] z-30 -mx-4 border-b border-white/10 bg-zinc-950/90 px-4 py-2 backdrop-blur">
        <div role="tablist" aria-label="패치노트 항목" className="flex flex-wrap gap-1.5">
          {(['all', ...TAGS] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition ${tab === t ? TAB_ACTIVE[t] : 'bg-white/5 text-zinc-300 hover:bg-white/10'}`}>
              {t === 'all' ? '전체' : t} <span className={tab === t ? 'opacity-70' : 'text-zinc-500'}>{COUNT[t]}</span>
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-zinc-500">
          <span>제목을 누르면 자세한 내용이 펼쳐집니다.</span>
          <button onClick={() => setOpenAll((v) => !v)} className="underline hover:text-zinc-300">{openAll ? '모두 접기' : '모두 펼치기'}</button>
        </div>
      </div>

      {days.map((day) => (
        <Card key={day.date} title={dateLabel(day.date)} right={<span className="text-xs text-zinc-500">{day.items.length}개</span>}>
          <ul className="divide-y divide-white/5" aria-label={`${dateLabel(day.date)} 변경 사항`}>
            {day.items.map((it) => (
              <li key={it.title}>
                {it.details ? (
                  <details open={openAll} key={`${it.title}-${openAll}`} className="group py-2">
                    <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                      {tab === 'all' && <Pill tone={TAG_TONE[it.tag]}>{it.tag}</Pill>}
                      <span className="min-w-0 flex-1 text-sm font-bold text-zinc-100">{it.title}</span>
                      <span aria-hidden className="shrink-0 text-xs text-zinc-500 transition group-open:rotate-90">›</span>
                    </summary>
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs leading-relaxed text-zinc-400">
                      {it.details.map((d) => <li key={d}>{d}</li>)}
                    </ul>
                  </details>
                ) : (
                  <div className="flex items-center gap-2 py-2">
                    {tab === 'all' && <Pill tone={TAG_TONE[it.tag]}>{it.tag}</Pill>}
                    <span className="text-sm font-bold text-zinc-100">{it.title}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
