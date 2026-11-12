// 저장 파일 내보내기·가져오기와 기자회견 자동 응답(SPEC §6.1, §10)
import { describe, expect, it } from 'vitest';
import { useGame } from '../src/app/store';

const setup = { seed: 41, name: '저장테스트', nationality: 'KR', wealthTier: 3 as const, personality: 'calm' as const, candidateIndex: 0, focus: ['pace' as const] };

describe('저장 파일', () => {
  it('내보낸 파일을 그대로 다시 가져올 수 있다(라이브 시즌·서명 포함)', () => {
    const g = useGame.getState();
    g.startCareer(setup, { strokes: [[[0.1, 0.2, 0, 0.5]]] });
    useGame.getState().playSeason(['sim', 'sim', 'rest', 'rest', 'rest', 'rest'] as never);
    const before = useGame.getState().career!;
    const json = useGame.getState().exportSave();
    const peek = useGame.getState().peekSave(json);
    expect(peek).toEqual({ ok: true, name: '저장테스트', year: before.year, retired: false });
    useGame.getState().reset();
    expect(useGame.getState().career).toBeNull();
    expect(useGame.getState().importSave(json)).toBe(true);
    expect(useGame.getState().career).toEqual(before);
    expect(useGame.getState().signature?.strokes.length).toBe(1);
  });

  it('다른 파일이나 깨진 파일은 이유와 함께 거절한다', () => {
    const peek = useGame.getState().peekSave;
    expect(peek('not json')).toMatchObject({ ok: false });
    expect(peek(JSON.stringify({ app: 'other' }))).toMatchObject({ ok: false, reason: '이 게임의 저장 파일이 아닙니다.' });
    expect(peek(JSON.stringify({ app: 'kart-to-champion', career: { schemaVersion: 1 } }))).toMatchObject({ ok: false });
    expect(useGame.getState().importSave('{}')).toBe(false);
  });
});

describe('기자회견 자동 응답', () => {
  it('켜 두면 시즌이 끝날 때 기자회견을 그 톤으로 처리한다', () => {
    useGame.getState().setInterviewAuto('bold');
    useGame.getState().reset();
    expect(useGame.getState().interviewAuto).toBe('bold'); // 새 커리어에도 설정이 남는다
    useGame.getState().startCareer({ ...setup, seed: 52 }, { strokes: [] });
    let answered = 0;
    for (let i = 0; i < 6; i++) {
      const s = useGame.getState();
      s.playSeason(['sim', 'sim', 'rest', 'rest', 'rest', 'rest'] as never);
      const c = useGame.getState().career!;
      expect((c.pendingEvents ?? []).some((id) => id.startsWith('iv_'))).toBe(false);
      answered += (c.eventLog ?? []).filter((e) => e.year === c.year && e.id.startsWith('iv_')).length;
      for (const id of [...(c.pendingEvents ?? [])]) useGame.getState().chooseEvent(id, pendingFirstOption(id));
      const cur = useGame.getState().career!;
      const off = getOffseason(cur);
      const pick = DEFAULT_POLICY.offseason(cur, off).offerId;
      const offer = off.offers.find((o) => o.id === pick);
      if (offer) useGame.getState().acceptOffer(offer, true, null);
      else useGame.getState().skipSeat(true);
    }
    expect(answered).toBeGreaterThan(0);
    useGame.getState().setInterviewAuto(null);
  });
});

import { DEFAULT_POLICY, EVENT_BY_ID, getOffseason } from '../src/engine';
function pendingFirstOption(id: string): string { return EVENT_BY_ID.get(id)!.options[0]!.id; }

import { firstNameOf } from '../src/engine';

describe('이전 저장 파일 이름 정리 (v0.39)', () => {
  it('가져오면 겹치는 가상 드라이버 이름을 한 번만 새로 짓는다', () => {
    useGame.getState().startCareer({ ...setup, seed: 77 }, { strokes: [] });
    expect(useGame.getState().career!.flags?.namesV2).toBe(1);
    const old = structuredClone(useGame.getState().career!);
    delete old.flags!.namesV2;
    const base = old.world.drivers.find((d) => d.real)!;
    const fake = (id: string, name: string) => ({ ...structuredClone(base), id, name, code: 'XXX', nationality: 'KR', real: false });
    old.world.drivers.push(fake('gen_a', 'Min-jun Park'), fake('gen_b', 'Min-jun Kim'), fake('gen_c', 'Min-jun Lee'));
    old.world.champions.push({ year: 2030, driverId: 'gen_b', name: 'Min-jun Kim', teamId: base.teamId ?? '' });
    expect(useGame.getState().importSave(JSON.stringify({ app: 'kart-to-champion', saveVersion: 1, career: old }))).toBe(true);
    const c = useGame.getState().career!;
    expect(c.flags?.namesV2).toBe(1);
    const fic = c.world.drivers.filter((d) => !d.real);
    const firsts = fic.map((d) => firstNameOf(d.name, d.nationality));
    expect(new Set(firsts).size).toBe(firsts.length);
    expect(fic.find((d) => d.id === 'gen_a')!.name).toBe('Min-jun Park');
    const b = fic.find((d) => d.id === 'gen_b')!;
    expect(b.name).not.toBe('Min-jun Kim');
    expect(c.world.champions.at(-1)!.name).toBe(b.name);
    // 플래그가 있으면 다시 가져와도 그대로
    useGame.getState().importSave(JSON.stringify({ app: 'kart-to-champion', saveVersion: 1, career: c }));
    expect(useGame.getState().career!.world.drivers.find((d) => d.id === 'gen_b')!.name).toBe(b.name);
  });
});
