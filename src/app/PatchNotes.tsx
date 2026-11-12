// 패치노트 화면: 날짜별로 바뀐 내용을 보여 준다(데이터는 patchNotesData.ts).

import { PATCH_NOTES, type PatchTag } from './patchNotesData';
import { useGame } from './store';
import { Button, Card, Pill } from './ui';

const TAG_TONE: Record<PatchTag, 'green' | 'blue' | 'amber' | 'red' | 'zinc'> = {
  '새 기능': 'green', '개선': 'blue', '밸런스': 'amber', '수정': 'red', '기타': 'zinc',
};

function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

export function PatchNotes() {
  const { go, career } = useGame();
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-black">패치노트</h1>
        <Button variant="ghost" onClick={() => go(career ? (career.retired ? 'retired' : 'dashboard') : 'home')}>돌아가기</Button>
      </header>
      {PATCH_NOTES.map((day) => (
        <Card key={day.date} title={dateLabel(day.date)} right={<span className="text-xs text-zinc-500">{day.items.length}개</span>}>
          <ul className="space-y-3" aria-label={`${dateLabel(day.date)} 변경 사항`}>
            {day.items.map((it) => (
              <li key={it.title} className="border-b border-white/5 pb-3 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={TAG_TONE[it.tag]}>{it.tag}</Pill>
                  <span className="text-sm font-bold text-zinc-100">{it.title}</span>
                </div>
                {it.details && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs leading-relaxed text-zinc-400">
                    {it.details.map((d) => <li key={d}>{d}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
