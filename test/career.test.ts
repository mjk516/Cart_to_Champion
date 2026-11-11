import { describe, expect, it } from 'vitest';
import {
  applyOffseason, autoplayCareer, createCareer, DEFAULT_POLICY, getOffseason, MAX_TEAMS, MIN_TEAMS, replayCareer,
  EVENTS, managerAdvice, MAJOR_FLOOR, OTHERS_CAP, feedTemplateCount, pendingEventCards, resolveEvent, F1_WINNER_TEAMS, f1Rules, generateHidden, initialWorld, NEW_TEAM_START, PERSONALITIES, runOffseason, TEAMS_2026, runSeason, STAT_KEYS, SUPER_LICENCE_MIN_AGE, SUPER_LICENCE_REQUIRED, superLicencePoints, type CareerSetup,
} from '../src/engine';

const setup = (seed: number, extra: Partial<CareerSetup> = {}): CareerSetup => ({
  seed, name: '테스트', nationality: 'KR', wealthTier: 3, personality: 'fighter', candidateIndex: 0, focus: ['pace'], ...extra,
});

describe('커리어 생성', () => {
  it('12세 카트 선수로 시작하고, 자산 규모만큼 자금을 받는다', () => {
    const c = createCareer(setup(1, { wealthTier: 1 }));
    expect(c.age).toBe(12);
    expect(c.contract?.series).toBe('kart');
    expect(c.funds).toBe(30_000);
    expect(c.world.teams.teams).toHaveLength(11);
    expect(c.world.drivers.filter((d) => d.teamId)).toHaveLength(22);
  });
});

describe('시즌과 오프시즌', () => {
  it('runSeason과 applyOffseason은 입력을 바꾸지 않는다', () => {
    const c = createCareer(setup(2));
    const snap = JSON.stringify(c);
    let after = runSeason(c, DEFAULT_POLICY.training(c)).career;
    expect(JSON.stringify(c)).toBe(snap);
    for (const card of pendingEventCards(after)) after = resolveEvent(after, card.id, card.options[0]!.id).career;
    const snap2 = JSON.stringify(after);
    applyOffseason(after, DEFAULT_POLICY.offseason(after, getOffseason(after)));
    expect(JSON.stringify(after)).toBe(snap2);
  });

  it('없는 제안이나 감당할 수 없는 제안은 거부한다', () => {
    const c = runSeason(createCareer(setup(3)), ['rest', 'longrun']).career;
    expect(() => applyOffseason(c, { offerId: 'nope' })).toThrow();
    const pricey = getOffseason(c).offers.find((o) => !o.affordable);
    if (pricey) expect(() => applyOffseason(c, { offerId: pricey.id })).toThrow();
  });

  it('시즌 기록에 성장이 훈련·경기·환경으로 나뉘어 남는다', () => {
    const start = createCareer(setup(4));
    const { record } = runSeason(start, DEFAULT_POLICY.training(start));
    expect(record.ovrEnd).toBeGreaterThan(record.ovrStart);
    expect(record.growth.training).toBeGreaterThan(0);
    expect(record.growth.racing).toBeGreaterThan(0);
  });
});

describe('자동 진행 커리어', () => {
  const personalities = ['aggressive', 'calm', 'analytical', 'instinctive', 'fighter', 'showman'] as const;
  const careers = Array.from({ length: 24 }, (_, i) =>
    autoplayCareer(setup(100 + i, { wealthTier: ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5, personality: personalities[i % 6]!, candidateIndex: i % 3 })),
  );

  it('모든 커리어가 은퇴로 끝나고, 해마다 나이가 1씩 늘어난다', () => {
    for (const c of careers) {
      expect(c.retired).toBe(true);
      c.history.forEach((h, i) => {
        expect(h.age).toBe(12 + i);
        expect(h.year).toBe(2026 + i);
      });
    }
  });

  it('F1 레이스 데뷔는 슈퍼 라이선스 40점과 18세 이상일 때만', () => {
    for (const c of careers) {
      if (c.f1Debut === null) continue;
      const debut = c.history.find((h) => h.year === c.f1Debut);
      expect(debut?.series).toBe('f1');
      expect(debut!.age).toBeGreaterThanOrEqual(SUPER_LICENCE_MIN_AGE);
      const before = { ...c, history: c.history.filter((h) => h.year < c.f1Debut!) };
      expect(superLicencePoints(before, c.f1Debut - 1)).toBeGreaterThanOrEqual(SUPER_LICENCE_REQUIRED);
    }
  });

  it('F2·F3 챔피언은 다음 해 같은 시리즈에 나가지 않는다', () => {
    for (const c of careers) {
      c.history.forEach((h, i) => {
        const next = c.history[i + 1];
        if (h.champion && (h.series === 'f2' || h.series === 'f3') && next && next.seat === 'race') expect(next.series).not.toBe(h.series);
      });
    }
  });

  it('능력치는 20~99, 자금은 유한한 수, F1 팀 수는 10~12', () => {
    for (const c of careers) {
      for (const k of STAT_KEYS) {
        expect(c.driver.stats[k]).toBeGreaterThanOrEqual(20);
        expect(c.driver.stats[k]).toBeLessThanOrEqual(99);
      }
      for (const h of c.history) expect(Number.isFinite(h.fundsEnd)).toBe(true);
      expect(c.world.teams.teams.length + c.world.teams.pending.length).toBeLessThanOrEqual(MAX_TEAMS);
      expect(c.world.teams.teams.length).toBeGreaterThanOrEqual(MIN_TEAMS);
    }
  });

  it('대부분 F1 드라이버가 된다(80% 이상), 자산 1단계도 포함', () => {
    const f1 = careers.filter((c) => c.f1Debut !== null).length;
    expect(f1 / careers.length).toBeGreaterThanOrEqual(0.8);
    expect(careers.some((c) => c.driver.wealthTier === 1 && c.f1Debut !== null)).toBe(true);
  });

  it('F1 챔피언은 우승 가능 4팀에서 나온다(90% 이상)', () => {
    const all = careers.flatMap((c) => c.world.champions);
    const fromTop = all.filter((x) => (F1_WINNER_TEAMS as readonly string[]).includes(x.teamId)).length;
    expect(fromTop / all.length).toBeGreaterThanOrEqual(0.9);
  });

  it('메이저 4팀 레이스 시트 시즌은 대부분 챔피언십 8위 안(85% 이상)', () => {
    const names = ['McLaren', 'Ferrari', 'Mercedes', 'Red Bull Racing'];
    const seasons = careers.flatMap((c) => c.history.filter((h) => h.series === 'f1' && h.seat === 'race' && names.includes(h.team ?? '')));
    expect(seasons.length).toBeGreaterThanOrEqual(15);
    expect(seasons.filter((h) => (h.position ?? 99) <= 8).length / seasons.length).toBeGreaterThanOrEqual(0.85);
  });

  it('은퇴 시점 세계: 메이저 4팀은 차 성능 하한 이상, 나머지는 상한 이하', () => {
    for (const c of careers) {
      for (const t of c.world.teams.teams) {
        if ((F1_WINNER_TEAMS as readonly string[]).includes(t.id)) expect(t.quality).toBeGreaterThanOrEqual(MAJOR_FLOOR);
        else expect(t.quality).toBeLessThanOrEqual(OTHERS_CAP + 1e-9);
      }
    }
  });

  it('노화: 37세까지 능력치가 떨어지지 않고, 하락은 38세부터', () => {
    for (const c of careers) {
      for (const h of c.history) if (h.growth.aging < 0) expect(h.age, `${c.driver.name} ${h.year}`).toBeGreaterThanOrEqual(38);
    }
    for (let i = 0; i < 200; i++) expect(generateHidden(i, 'aggressive').peakEnd).toBeGreaterThanOrEqual(37);
  });

  it('나쁜 성격은 좋은 성격보다 방출이 잦다', () => {
    const rel = (t: 'good' | 'bad') => {
      const cs = careers.filter((c) => PERSONALITIES[c.driver.personality].temperament === t);
      return cs.reduce((a, c) => a + c.totals.releases, 0) / Math.max(1, cs.length);
    };
    expect(rel('bad')).toBeGreaterThan(rel('good'));
  });
});

describe('신생팀 규칙은 캐딜락만이 아니라 모든 진입 팀에 같다(SPEC §5.1 v0.12)', () => {
  it('새로 진입한 팀은 캐딜락과 같은 조건으로 출발한다', () => {
    const world = initialWorld(TEAMS_2026.filter((t) => t.id !== 'cadillac'), 2026);
    world.pending.push({ name: 'Porsche', manufacturer: true, approvedSeason: 2025, debutSeason: 2027 });
    const out = runOffseason(world, 2027, 1).world;
    const porsche = out.teams.find((t) => t.name === 'Porsche')!;
    const cadillac = TEAMS_2026.find((t) => t.id === 'cadillac')!;
    expect(porsche.founded).toBe(2027);
    expect(porsche.quality).toBe(NEW_TEAM_START.quality);
    expect(porsche.quality).toBe(cadillac.quality);
    expect(porsche.ops).toBe(cadillac.ops);
  });

  it('연차별 순위 제한: 1년 차 11위(무득점), 2~3년 차 4위(포디움 없음), 4년 차부터 제한 없음', () => {
    const c = createCareer(setup(1));
    c.world.teams.teams.push({ ...c.world.teams.teams[0]!, id: 'porsche_2030', name: 'Porsche', founded: 2030, standings: [] });
    const capAt = (year: number) => { c.year = year; return f1Rules(c).bestPosition?.['porsche_2030']; };
    expect(capAt(2030)).toBe(11);
    expect(capAt(2031)).toBe(4);
    expect(capAt(2032)).toBe(4);
    expect(capAt(2033)).toBeUndefined();
    // 캐딜락도 같은 규칙
    c.year = 2026;
    expect(f1Rules(c).bestPosition?.['cadillac']).toBe(11);
    c.year = 2029;
    expect(f1Rules(c).bestPosition?.['cadillac']).toBeUndefined();
  });
});

describe('성격 기질과 잠재력(SPEC §3.4 v0.11)', () => {
  it('나쁜 성격은 잠재력 상한이 높고 넓으며, 좋은 성격은 좁고 낮다', () => {
    const pots = (p: 'aggressive' | 'calm') => Array.from({ length: 300 }, (_, i) => generateHidden(i, p).potential);
    const bad = pots('aggressive');
    const good = pots('calm');
    expect(Math.max(...bad)).toBeGreaterThan(Math.max(...good) + 5);
    expect(Math.max(...good)).toBeLessThanOrEqual(88);
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    expect(spread(bad)).toBeGreaterThan(spread(good));
  });
});

describe('전환점 이벤트와 언론·팬 피드(SPEC §6, §6.1)', () => {
  it('이벤트 20개, 반응 문구 80개', () => {
    expect(EVENTS).toHaveLength(20);
    expect(new Set(EVENTS.map((e) => e.id)).size).toBe(20);
    expect(feedTemplateCount()).toBeGreaterThanOrEqual(80);
  });

  it('이벤트를 처리하기 전에는 오프시즌으로 넘어갈 수 없다', () => {
    let c = createCareer(setup(21));
    for (let i = 0; i < 6; i++) {
      c = runSeason(c, DEFAULT_POLICY.training(c)).career;
      if (c.pendingEvents?.length) {
        expect(() => applyOffseason(c, { offerId: null })).toThrow();
        return;
      }
      c = applyOffseason(c, DEFAULT_POLICY.offseason(c, getOffseason(c)));
    }
    throw new Error('6시즌 동안 이벤트가 한 번도 나오지 않았다');
  });

  it('커리어 동안 여러 종류의 이벤트를 겪고, 결과가 기록된다', () => {
    const c = autoplayCareer(setup(22, { personality: 'aggressive' }));
    const log = c.eventLog ?? [];
    expect(log.length).toBeGreaterThanOrEqual(8);
    expect(new Set(log.map((e) => e.id)).size).toBeGreaterThanOrEqual(6);
    for (const e of log) expect(e.text.length).toBeGreaterThan(0);
    // 같은 이벤트가 3년 안에 다시 나오지 않는다
    for (const e of log) expect(log.filter((x) => x.id === e.id && x.year > e.year && x.year < e.year + 3)).toHaveLength(0);
  });

  it('선택에 따라 결과가 달라진다(같은 시드, 다른 선택)', () => {
    let c = createCareer(setup(23));
    for (let i = 0; i < 10 && !c.pendingEvents?.length; i++) {
      c = runSeason(c, DEFAULT_POLICY.training(c)).career;
      if (!c.pendingEvents?.length) c = applyOffseason(c, DEFAULT_POLICY.offseason(c, getOffseason(c)));
    }
    const card = pendingEventCards(c)[0]!;
    const a = resolveEvent(c, card.id, card.options[0]!.id).career;
    const b = resolveEvent(c, card.id, card.options[card.options.length - 1]!.id).career;
    expect(JSON.stringify(a.eventLog)).not.toBe(JSON.stringify(b.eventLog));
  });

  it('시즌마다 언론·팬 피드가 3개 이상 붙고, 가상 매체만 쓴다', () => {
    const c = autoplayCareer(setup(24));
    for (const h of c.history) {
      expect((h.feed ?? []).length).toBeGreaterThanOrEqual(3);
      for (const f of h.feed ?? []) {
        if (f.kind === 'press') expect(['패독 데일리', '그리드 위클리', '레이싱 코리아 뉴스']).toContain(f.author);
        expect(f.text).not.toMatch(/\{\w+\}/);
      }
    }
  });
});

describe('선수 매니저 조언(SPEC §7 v0.15)', () => {
  it('커리어 시작 때 매니저가 배정된다', () => {
    const c = createCareer(setup(31));
    expect(c.manager?.name.length).toBeGreaterThan(0);
    expect(['growth', 'money', 'stable']).toContain(c.manager?.style);
  });

  it('오프시즌마다: 추천은 감당 가능한 실제 제안, F1 레이스 시트가 있으면 리저브를 추천하지 않는다, 메이저 팀엔 8위 안 근거', () => {
    let checkedMajor = false;
    for (const seed of [32, 33, 34, 35]) {
      let c = createCareer(setup(seed, { wealthTier: 4, personality: 'instinctive' }));
      for (let y = 0; y < 30 && !c.retired; y++) {
        c = runSeason(c, DEFAULT_POLICY.training(c)).career;
        for (const card of pendingEventCards(c)) c = resolveEvent(c, card.id, card.options[0]!.id).career;
        const off = getOffseason(c);
        const adv = managerAdvice(c, off);
        expect(adv.headline.length).toBeGreaterThan(0);
        expect(Object.keys(adv.perOffer).sort()).toEqual(off.offers.map((o) => o.id).sort());
        if (adv.recommendedOfferId) {
          const rec = off.offers.find((o) => o.id === adv.recommendedOfferId)!;
          expect(rec.affordable).toBe(true);
          const f1Race = off.offers.some((o) => o.series === 'f1' && o.seat === 'race' && o.affordable);
          if (f1Race) expect(rec.seat === 'reserve' && rec.series === 'f1').toBe(false);
        }
        for (const o of off.offers) {
          if (o.series === 'f1' && o.seat === 'race' && o.teamId && (F1_WINNER_TEAMS as readonly string[]).includes(o.teamId)) {
            expect(adv.perOffer[o.id]!.reasons.join(' ')).toContain('8위');
            checkedMajor = true;
          }
          if (!o.affordable) expect(adv.perOffer[o.id]!.verdict).toBe('avoid');
        }
        c = applyOffseason(c, DEFAULT_POLICY.offseason(c, off));
      }
    }
    expect(checkedMajor).toBe(true);
  });
});

describe('결정성과 재생(랭킹 검증 SPEC §9)', () => {
  it('같은 설정이면 같은 커리어', () => {
    expect(JSON.stringify(autoplayCareer(setup(7)))).toBe(JSON.stringify(autoplayCareer(setup(7))));
  });

  it('선택 기록만으로 커리어를 다시 계산하면 기록이 바이트 단위로 같다', () => {
    for (const seed of [8, 9, 10]) {
      const c = autoplayCareer(setup(seed, { wealthTier: 4 }));
      const replayed = replayCareer(c.setup, c.choiceLog);
      expect(JSON.stringify(replayed.history)).toBe(JSON.stringify(c.history));
      expect(JSON.stringify(replayed.totals)).toBe(JSON.stringify(c.totals));
      expect(JSON.stringify(replayed.world)).toBe(JSON.stringify(c.world));
    }
  });

  it('조작한 선택 기록은 재생 단계에서 걸린다', () => {
    const c = autoplayCareer(setup(11));
    const tampered = structuredClone(c.choiceLog);
    const off = tampered.find((e) => e.kind === 'offseason');
    if (off && off.kind === 'offseason') off.choice = { offerId: 'f1:mclaren' };
    expect(() => replayCareer(c.setup, tampered)).toThrow();
  });
});
