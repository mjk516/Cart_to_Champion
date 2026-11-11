// 오프시즌(SPEC §7·§2.1): 제안 만들기, 선택 반영, 팀·캘린더·AI 드라이버 세계 진행.

import { CALENDAR_2026_SLOTS, type Career, HOME_MARKET_BONUS, type Offer, type Offseason, type OffseasonChoice, PRINCIPAL_CHANGE_CHANCE, ROOKIE_GUARANTEE_POS, ROOKIE_GUARANTEE_POS_HOME, hasHomeGp } from './careerCore';
import { MAJOR_FLOOR, OTHERS_CAP, newRookie, superLicencePoints } from './season';
import { clamp, juniorTeams, lerp } from './careerInternal';
import { WEALTH_TIERS } from './creation';
import { PERSONALITIES } from './creation';
import { evolveCalendar } from './calendar';
import { ALL_F1_CIRCUITS, CALENDAR_2027_SLOTS, circuitById, F1_WINNER_TEAMS, ovr } from './data';
import { int, normal, pick, rngFor, type Rng } from './rng';
import { ACADEMIES, nextSeries, SERIES, seriesLabel, SUPER_LICENCE_MIN_AGE, SUPER_LICENCE_REQUIRED, type SeriesId } from './series';
import { runOffseason } from './teams';
import { STAT_KEYS } from './types';

// ── 오프시즌 ────────────────────────────────────────────────────────
interface SeatPlan {
  /** 이번 오프시즌에 은퇴하는 AI 드라이버 */
  retiring: string[];
  /** 계약 만료 후 재계약하지 않는 AI 드라이버(자리가 빈다) */
  released: string[];
  /** 팀별 빈자리 수 */
  open: Map<string, number>;
}

/**
 * 팀이 드라이버에게 요구하는 OVR. 고정값이 아니라 현재 그리드 분포를 따른다:
 * 차 성능 1위 팀은 그리드 OVR 최상위권, 하위 팀은 20위 근처 수준을 원한다.
 */
function teamRequirement(c: Career, teamId: string): number {
  const grid = c.world.drivers.filter((d) => d.teamId && !d.retired).map((d) => ovr(d.stats)).sort((a, b) => b - a);
  const teams = [...c.world.teams.teams].sort((a, b) => b.quality - a.quality);
  const idx = Math.max(0, teams.findIndex((t) => t.id === teamId));
  // 우승 가능 4팀(차 성능 상위)은 그리드 최상위 2~3명 수준을 요구한다
  const at = Math.min(grid.length - 1, Math.round(idx < 4 ? idx * 0.8 + 1 : idx * 1.8 + 1));
  return (grid[at] ?? 80) - 0.5;
}

function seatPlan(c: Career): SeatPlan {
  const r = rngFor(c.seed, 'seat-plan', c.year);
  const nextYear = c.year + 1;
  const retiring: string[] = [];
  const released: string[] = [];
  const open = new Map<string, number>();
  for (const d of c.world.drivers) {
    if (d.retired || !d.teamId) continue;
    const team = c.world.teams.teams.find((t) => t.id === d.teamId);
    if (!team) continue;
    const age = nextYear - d.birthYear;
    const o = ovr(d.stats);
    const retire = age >= 42 || (age >= 38 && r() < 0.25 * (age - 37)) || (age >= 31 && o < 76 && d.contractEnd <= c.year);
    if (retire) {
      retiring.push(d.id);
      open.set(d.teamId, (open.get(d.teamId) ?? 0) + 1);
      continue;
    }
    if (d.contractEnd <= c.year) {
      const keep = o >= teamRequirement(c, team.id) - 3 + normal(r) * 1.5;
      if (!keep) {
        released.push(d.id);
        open.set(d.teamId, (open.get(d.teamId) ?? 0) + 1);
      }
    }
  }
  // 플레이어 F1 계약이 끝나면 그 자리도 빈다
  if (c.contract?.series === 'f1' && c.contract.seat === 'race' && c.contract.teamId && c.contract.endYear <= c.year) {
    open.set(c.contract.teamId, (open.get(c.contract.teamId) ?? 0) + 1);
  }
  return { retiring, released, open };
}

function maxYears(age: number): number {
  return age >= 39 ? 1 : age >= 36 ? 2 : 3;
}

/** 오프시즌 제안 목록. 같은 career면 항상 같은 목록을 돌려준다 */
export function getOffseason(c: Career): Offseason {
  const last = c.history[c.history.length - 1];
  if (!last || last.year !== c.year) throw new Error('run the season before the offseason');
  const r = rngFor(c.seed, 'offers', c.year);
  const nextYear = c.year + 1;
  const nextAge = c.age + 1;
  const wealth = WEALTH_TIERS[c.driver.wealthTier];
  const notes: string[] = [];
  const offers: Offer[] = [];
  const pct = last.position ? 1 - (last.position - 1) / Math.max(1, last.fieldSize) : 0;
  const perf = last.races ? clamp(last.expectedAvg - last.actualAvg, -10, 10) / 10 : -0.3;
  const scout = clamp(pct * 0.6 + perf * 0.2 + (c.media.reputation / 100) * 0.2 + (c.flags?.scoutBonus ?? 0), 0, 1);
  const budget = c.funds + (nextAge < 21 && c.f1Debut === null ? wealth.familySupport : 0);
  const academyCovers = (s: SeriesId) => !!c.academy && s !== 'f1';
  const affordable = (s: SeriesId, cost: number) => academyCovers(s) || cost <= budget;

  const current = last.series;
  // 계약이 남아 있으면 "계약 유지"
  if (c.contract && c.contract.endYear > c.year) {
    offers.push({ ...c.contract, id: 'stay', years: c.contract.endYear - c.year, affordable: affordable(c.contract.series, c.contract.seatCost), note: '현 계약 유지' });
  }

  // 하부 리그 제안
  const juniorOffers = (s: Exclude<SeriesId, 'f1'>, strength: number, label: string) => {
    if (nextAge < SERIES[s].minAge) return;
    const teams = juniorTeams(s, nextYear, c.seed);
    const n = teams.length;
    const picked: number[] = [];
    teams.forEach((_t, i) => {
      if (picked.length >= 3) return;
      const minScout = 0.85 - (i / (n - 1)) * 0.75;
      if (strength + normal(r) * 0.08 >= minScout) picked.push(i);
    });
    // 하위 2팀은 언제나 자리를 내준다(페이 시트, 돈이 없으면 매니지먼트 후원)
    for (const i of [n - 2, n - 1]) if (i >= 0 && !picked.includes(i)) picked.push(i);
    for (const i of picked) {
      const t = teams[i]!;
      // 재능 할인: 스카우트 점수가 높으면 팀이 시트 비용을 깎아 준다(최대 80%)
      const discount = clamp((strength - 0.5) * 1.6, 0, 0.8);
      const cost = Math.round(lerp(SERIES[s].seatCost[1], SERIES[s].seatCost[0], i / (n - 1)) * (1 - discount));
      const own = affordable(s, cost);
      const mgmt = !own && nextAge <= 22;
      offers.push({
        id: `${s}:${t.name}`, series: s, team: t.name, seat: 'race', endYear: nextYear, salary: 0, seatCost: cost,
        teamQuality: t.quality, facility: t.facility, years: 1, affordable: own || mgmt, management: mgmt || undefined,
        note: mgmt ? `${label} · ${SERIES[s].label} · 매니지먼트 후원(F1 연봉 15%, 8년)` : `${label} · ${SERIES[s].label}`,
      });
    }
  };

  const next = nextSeries(current);
  if (current === 'kart') {
    if (nextAge >= SERIES.f4.minAge) juniorOffers('f4', scout - 0.1, '승격');
    else juniorOffers('kart', scout + 0.15, '인터내셔널 카트');
  } else if (current !== 'f1' && next) {
    // F2·F3 챔피언은 규정상 같은 시리즈에 다시 나갈 수 없다
    const championBarred = last.champion && (current === 'f2' || current === 'f3');
    if (championBarred) notes.push(`${seriesLabel(current)} 챔피언은 같은 시리즈에 다시 출전할 수 없다`);
    else juniorOffers(current as Exclude<SeriesId, 'f1'>, scout + 0.1, '잔류');
    if (next !== 'f1') juniorOffers(next as Exclude<SeriesId, 'f1'>, scout - 0.12, '승격');
    const skip = next !== 'f1' ? nextSeries(next) : null;
    if (last.champion && skip && skip !== 'f1') juniorOffers(skip as Exclude<SeriesId, 'f1'>, scout - 0.25, '월반');
  } else if (current === 'f1' && last.seat !== 'race' && nextAge <= 26 && !c.totals.juniorTitles.some((t) => t.endsWith('FIA F2'))) {
    // 리저브·무소속에서 F2로 돌아가 다시 레이스 시트를 노릴 수 있다
    juniorOffers('f2', scout + 0.1, 'F2 복귀');
  }

  // F1 제안
  const sl = superLicencePoints(c);
  const inF1Race = c.contract?.series === 'f1' && c.contract.seat === 'race';
  const f1Eligible = inF1Race || c.f1Debut !== null || (sl >= SUPER_LICENCE_REQUIRED && nextAge >= SUPER_LICENCE_MIN_AGE);
  if (current === 'f2' || current === 'f3' || current === 'f1') {
    if (!f1Eligible) notes.push(`슈퍼 라이선스 포인트 부족(${sl}/${SUPER_LICENCE_REQUIRED})`);
    const plan = seatPlan(c);
    const academyTeams = ACADEMIES.find((a) => a.name === c.academy)?.teamIds ?? [];
    const f1Perf = current === 'f1' && last.seat === 'race' ? clamp(last.expectedAvg - last.actualAvg, -6, 6) * 0.3 + (last.teammateBeat - 0.5) * 3 : perf * 2 + (pct - 0.7) * 5;
    // F2 상위권 졸업생 보너스, 36세 이후 나이 감점(전성기는 37세까지)
    const graduate = current === 'f2' && last.seat === 'race' ? (last.champion ? 4 : (last.position ?? 99) <= 3 ? 2 : 0) : 0;
    const agePenalty = Math.max(0, nextAge - 36) * 1.0;
    // F1 데뷔 전에는 캘린더에 자기 나라 그랑프리가 있으면 팀들이 홈 시장을 보고 더 쳐준다(데뷔 뒤에는 성적으로만 평가)
    const homeMarket = c.f1Debut === null && hasHomeGp(c) ? HOME_MARKET_BONUS : 0;
    const rating = ovr(c.driver.stats) + f1Perf + c.media.reputation / 40 + graduate - agePenalty + homeMarket;
    const sortedTeams = [...c.world.teams.teams].sort((a, b) => b.quality - a.quality);
    for (const t of sortedTeams) {
      const openSeats = plan.open.get(t.id) ?? 0;
      // 상위 4팀은 F1 경험이 없는 신인에게 더 높은 기준을 둔다(아카데미 소속이면 완화)
      const top4 = sortedTeams.indexOf(t) < 4;
      const rookiePenalty = c.f1Debut === null && top4 && !academyTeams.includes(t.id) ? 4 : 0;
      // 하위 6팀은 신인에게 기준을 낮춘다(신인은 보통 하위 팀에서 시작)
      const rookieRelax = c.f1Debut === null && sortedTeams.indexOf(t) >= sortedTeams.length - 6 ? 3 : 0;
      const req = teamRequirement(c, t.id) + rookiePenalty - rookieRelax - (academyTeams.includes(t.id) ? 2 : 0);
      const isMyTeam = inF1Race && c.contract?.teamId === t.id;
      const years = Math.max(1, Math.min(maxYears(nextAge), int(r, 1, 3)));
      if (f1Eligible && openSeats > 0 && rating + normal(r) * 1.5 >= req - (isMyTeam ? 3 : 0)) {
        const salary = Math.round(clamp(1_000_000 + (rating - 76) * 1_400_000, 800_000, 45_000_000) * (0.6 + t.budget * 0.6));
        offers.push({
          id: `f1:${t.id}`, series: 'f1', team: t.name, teamId: t.id, seat: 'race', endYear: c.year + years, salary, seatCost: 0,
          teamQuality: t.quality, facility: t.budget, years, affordable: true, note: isMyTeam ? '재계약' : 'F1 레이스 시트',
        });
        continue;
      }
      const bottom3 = sortedTeams.indexOf(t) >= sortedTeams.length - 3;
      if (f1Eligible && openSeats > 0 && bottom3 && !isMyTeam && (c.driver.wealthTier >= 4 || c.funds >= 8_000_000) && rating >= req - 8) {
        const cost = Math.round(5_000_000 + (t.quality - 0.75) * 50_000_000);
        offers.push({
          id: `f1pay:${t.id}`, series: 'f1', team: t.name, teamId: t.id, seat: 'race', endYear: nextYear, salary: 0, seatCost: cost,
          teamQuality: t.quality, facility: t.budget, years: 1, affordable: cost <= c.funds, note: '페이 시트(스폰서 자금으로 시트 확보)',
        });
        continue;
      }
      const reserveCandidate = current === 'f1' || (current === 'f2' && (pct >= 0.6 || !!c.academy));
      if (reserveCandidate && sortedTeams.indexOf(t) < 5 && !isMyTeam && rating >= req - 7 && nextAge <= 28 && r() < 0.5) {
        offers.push({
          id: `f1res:${t.id}`, series: 'f1', team: t.name, teamId: t.id, seat: 'reserve', endYear: nextYear, salary: 300_000, seatCost: 0,
          teamQuality: t.quality, facility: t.budget, years: 1, affordable: true, note: '리저브·테스트 드라이버',
        });
      }
    }
    // 신인 보장: F2 상위 5위(또는 리저브)이고 슈퍼 라이선스를 채웠는데 레이스 제안이 없으면,
    // 하위 4팀 중 한 팀이 가장 약한 드라이버를 내보내고 자리를 내준다
    const hasRaceOffer = offers.some((o) => o.series === 'f1' && o.seat === 'race' && o.id !== 'stay');
    const rookieGuarantee =
      f1Eligible && !inF1Race && nextAge <= 25 &&
      ((current === 'f2' && last.seat === 'race' && (last.position ?? 99) <= (homeMarket ? ROOKIE_GUARANTEE_POS_HOME : ROOKIE_GUARANTEE_POS)) || (current === 'f1' && last.seat === 'reserve'));
    if (rookieGuarantee && !hasRaceOffer) {
      const bottom = sortedTeams.slice(-4);
      const target = bottom
        .flatMap((t) => c.world.drivers.filter((d) => d.teamId === t.id && !d.retired && !plan.retiring.includes(d.id) && !plan.released.includes(d.id)).map((d) => ({ t, d })))
        .sort((a, b) => ovr(a.d.stats) - ovr(b.d.stats))[0];
      if (target) {
        const years = Math.max(1, Math.min(maxYears(nextAge), 2));
        offers.push({
          id: `f1:${target.t.id}`, series: 'f1', team: target.t.name, teamId: target.t.id, seat: 'race', endYear: c.year + years,
          salary: Math.round(900_000 + target.t.budget * 600_000), seatCost: 0, teamQuality: target.t.quality, facility: target.t.budget,
          years, affordable: true, displaceDriverId: target.d.id, note: `F1 레이스 시트 · ${target.t.name}가 신인을 위해 ${target.d.name}의 자리를 비웠다`,
        });
      }
    }
  }

  // 아카데미
  let academyOffer: string | null = null;
  if (!c.academy && (current === 'kart' || current === 'f4' || current === 'freca' || current === 'f3') && pct >= 0.8) {
    if (r() < 0.5 * (1 + wealth.academyInterest) * pct) academyOffer = pick(r, ACADEMIES).name;
  }
  if (c.academy && (current === 'f3' || current === 'f2') && (last.position ?? 99) > 10) {
    notes.push(`${c.academy}에서 방출됐다`);
  }

  // 방출: 성격이 나쁠수록 계약이 남아 있어도 팀이 내보낼 수 있다(SPEC §3.4 v0.11)
  let released = false;
  const pdef = PERSONALITIES[c.driver.personality];
  if (c.contract && c.contract.seat === 'race' && last.seat === 'race') {
    const conflict = (last.teammateBeat < 0.4 ? 1.5 : 1) * (perf < 0 ? 1.3 : 1);
    if (rngFor(c.seed, 'release', c.year)() < Math.max(0, pdef.releaseRisk * conflict + (c.flags?.releaseRisk ?? 0))) {
      released = true;
      const team = c.contract.team;
      for (let i = offers.length - 1; i >= 0; i--) if (offers[i]!.team === team) offers.splice(i, 1);
      notes.push(`${team}, ${c.driver.name}에게 방출 통보(${pdef.releaseReason})`);
    }
  }

  return { year: c.year, offers, released, academyOffer, notes };
}

function fillOpenSeats(c: Career, r: Rng, nextYear: number): void {
  const used = new Set(c.world.drivers.filter((d) => !d.retired && d.teamId).map((d) => d.number));
  if (c.driver.number) used.add(c.driver.number); // 플레이어 번호는 AI 신인에게 주지 않는다
  let rookieIdx = 0;
  for (const t of c.world.teams.teams) {
    const playerHere = c.contract?.series === 'f1' && c.contract.seat === 'race' && c.contract.teamId === t.id ? 1 : 0;
    let have = c.world.drivers.filter((d) => d.teamId === t.id && !d.retired).length + playerHere;
    while (have < 2) {
      const free = c.world.drivers
        .filter((d) => !d.retired && !d.teamId && nextYear - d.birthYear < 36)
        .sort((a, b) => ovr(b.stats) - ovr(a.stats))[0];
      const pickFree = free && ovr(free.stats) >= teamRequirement(c, t.id) - 4;
      const d = pickFree ? free : newRookie(r, nextYear, rookieIdx++, used);
      if (!pickFree) c.world.drivers.push(d);
      d.teamId = t.id;
      d.contractEnd = nextYear + int(r, 0, 2);
      have++;
    }
  }
}

function ageWorldDrivers(c: Career, r: Rng, nextYear: number): void {
  for (const d of c.world.drivers) {
    if (d.retired) continue;
    const age = nextYear - d.birthYear;
    if (age <= 27 && ovr(d.stats) < d.potential) {
      // 잠재력까지 해마다 OVR +1~1.5 정도
      for (const k of STAT_KEYS) d.stats[k] = Math.min(97, d.stats[k] + int(r, 0, 2));
    } else if (age >= 38) {
      // AI도 플레이어와 같다: 37세까지 유지, 38세부터 하락
      for (const k of STAT_KEYS) {
        const fast = k === 'pace' || k === 'wet';
        d.stats[k] = Math.max(40, d.stats[k] - int(r, 0, Math.min(2, age - 37) + (fast ? 1 : 0)));
      }
    }
  }
  // 5년마다 규정 변경: 팀 판도가 크게 흔들린다
  const regReset = nextYear % 5 === 1;
  for (const t of c.world.teams.teams) {
    const shake = regReset ? normal(r) * 0.03 : normal(r) * 0.012;
    // 평균으로 끌어당기는 힘을 키워 한 팀이 오래 독주하지 못하게 한다
    const q = t.quality + shake + (t.budget - 0.8) * 0.006 - (t.quality - 0.89) * 0.2;
    // 신생팀 추격 개발: 2~3년 차 시즌(teamAge 1~2)에만 +0.004.
    // 4년 차(teamAge 3)부터는 보너스 없이 다른 중위권 팀과 똑같이 평균 회귀·상한 규칙만 받는다
    const teamAge = nextYear - t.founded;
    // 데뷔하는 해에는 출발 조건(NEW_TEAM_START) 그대로 둔다: 모든 신생팀이 캐딜락과 같은 성능으로 첫 시즌을 치른다
    if (teamAge <= 0) continue;
    const catchUp = teamAge >= 1 && teamAge <= 2 ? 0.004 : 0;
    // 팀 대표 교체(SPEC §2.1 v0.25): 팀마다 시즌당 6%. 새 대표가 팀을 추스르면 차가 좋아지고, 혼란이 생기면 나빠진다
    const pr = rngFor(c.seed, 'principal', nextYear, t.id);
    let principal = 0;
    if (pr() < PRINCIPAL_CHANGE_CHANCE) {
      const good = pr() < 0.55;
      principal = (good ? 1 : -1) * (0.006 + pr() * 0.008);
      c.world.principalLog = [...(c.world.principalLog ?? []), { season: nextYear, teamId: t.id, team: t.name, good, delta: Math.round(principal * 1000) / 1000 }];
      c.world.news.push({ season: nextYear, kind: 'principal', team: t.name, text: good ? `${t.name}, 새 팀 대표 선임. 조직이 정비돼 차가 좋아질 것이라는 평가` : `${t.name}, 팀 대표 교체 뒤 내부 혼란. 개발 방향이 흔들린다` });
    }
    // 우승 가능 4팀은 늘 선두권(0.90 이상), 나머지는 0.915 이하: 포디움은 가능하지만 시즌 챔피언 경쟁은 4팀 몫
    const top = (F1_WINNER_TEAMS as readonly string[]).includes(t.id);
    // 메이저 4팀(0.915 이상)과 나머지(0.885 이하)가 겹치지 않게: 메이저 팀 레이스 시트면 챔피언십 8위 안이 거의 보장된다
    t.quality = top ? clamp(q + principal, MAJOR_FLOOR, 0.95) : clamp(q + catchUp + principal, 0.83, OTHERS_CAP);
  }
}

/** 오프시즌 선택을 반영하고 다음 해로 넘어간다 */
export function applyOffseason(input: Career, choice: OffseasonChoice): Career {
  if (input.pendingEvents?.length) throw new Error(`resolve events first: ${input.pendingEvents.join(', ')}`);
  const c: Career = structuredClone(input);
  const off = getOffseason(input);
  c.choiceLog.push({ year: c.year, kind: 'offseason', choice });
  const nextYear = c.year + 1;
  const r = rngFor(c.seed, 'offseason-apply', c.year);

  if (choice.retire) {
    c.retired = true;
    if (c.contract?.series === 'f1' && c.contract.seat === 'race') c.contract = null;
    return c;
  }

  if (choice.joinAcademy && off.academyOffer) c.academy = off.academyOffer;
  if (off.released) {
    c.totals.releases += 1;
    // 업적(다시 일어서다)과 커리어 기록용으로 그 시즌 기록에 남긴다
    const lastRec = c.history[c.history.length - 1];
    if (lastRec) lastRec.notes = [...lastRec.notes, '시즌 뒤 팀에서 방출'];
    c.media.pressure = Math.min(100, c.media.pressure + 15);
    c.media.reputation = Math.max(0, c.media.reputation - 5);
  }
  if (off.notes.some((n) => n.includes('방출'))) c.academy = null;

  // 세계: 은퇴·방출 확정
  const plan = seatPlan(input);
  for (const d of c.world.drivers) {
    if (plan.retiring.includes(d.id)) { d.retired = true; d.teamId = null; }
    if (plan.released.includes(d.id)) d.teamId = null;
  }

  const offer = choice.offerId ? off.offers.find((o) => o.id === choice.offerId) : undefined;
  if (choice.offerId && !offer) throw new Error(`unknown offer ${choice.offerId}`);
  if (offer && !offer.affordable) throw new Error(`offer ${offer.id} is not affordable`);
  if (offer) {
    const { id: _id, years: _y, affordable: _a, note: _n, displaceDriverId, ...contract } = offer;
    c.contract = contract;
    if (offer.management && !c.management) c.management = { share: 0.15, years: 8, startYear: null };
    if (displaceDriverId) {
      const d = c.world.drivers.find((x) => x.id === displaceDriverId);
      if (d) d.teamId = null;
    }
    if (offer.series === 'f1' && offer.seat === 'race' && c.f1Debut === null) {
      c.f1Debut = nextYear;
      if (c.management && c.management.startYear === null) c.management.startYear = nextYear;
    }
  } else {
    c.contract = null;
  }

  // 팀 진입·철수
  const teamOut = runOffseason(c.world.teams, nextYear, c.seed);
  const removed = c.world.teams.teams.filter((t) => !teamOut.world.teams.some((x) => x.id === t.id)).map((t) => t.id);
  c.world.teams = teamOut.world;
  c.world.news.push(...teamOut.news);
  for (const d of c.world.drivers) if (d.teamId && removed.includes(d.teamId)) d.teamId = null;
  if (c.contract?.teamId && removed.includes(c.contract.teamId)) c.contract = null;

  // 2027 시즌은 공식 발표된 캘린더를 쓴다(SPEC §2.1 v0.21). 그 뒤로는 낮은 확률의 무작위 변화
  if (nextYear === 2027) {
    c.world.calendar = CALENDAR_2027_SLOTS.map((s) => ({ ...s }));
    c.world.calendarLog = [...(c.world.calendarLog ?? []), { season: 2027, out: 'netherlands', in: 'portimao' }, { season: 2027, out: 'barcelona', in: 'istanbul' }];
    c.world.news.push({ season: 2027, kind: 'calendar', team: 'Portimão', text: '2027 F1 캘린더: 24라운드. 바레인·사우디 복귀, Portimão·Istanbul Park 합류, Zandvoort·Barcelona-Catalunya 제외' });
  }
  // F1 캘린더 변화(낮은 확률, 21세기 개최 서킷만 복귀)
  const cal = nextYear === 2027 ? { slots: c.world.calendar!, change: null } : evolveCalendar(c.world.calendar ?? CALENDAR_2026_SLOTS, nextYear, c.seed, ALL_F1_CIRCUITS.map((x) => x.id), c.world.calendarLog ?? []);
  c.world.calendar = cal.slots.map((s) => ({ ...s }));
  if (cal.change) {
    c.world.calendarLog = [...(c.world.calendarLog ?? []), cal.change];
    const outName = circuitById(cal.change.out).name, inName = circuitById(cal.change.in).name;
    c.world.news.push({ season: nextYear, kind: 'calendar', team: inName, text: `${nextYear} F1 캘린더: ${inName} 복귀, ${outName} 제외` });
  }

  ageWorldDrivers(c, r, nextYear);
  fillOpenSeats(c, r, nextYear);

  c.flags = {};
  // 내 팀의 대표가 바뀌었으면 팀 내 입지도 바뀐다: 새 대표가 나를 믿으면 방출 위험 ↓·압박 ↓, 아니면 반대
  const myTeamId = c.contract?.series === 'f1' ? c.contract.teamId : undefined;
  const myChange = myTeamId ? c.world.principalLog?.find((p) => p.season === nextYear && p.teamId === myTeamId) : undefined;
  if (myChange) {
    const backs = rngFor(c.seed, 'principal-player', nextYear)() < (myChange.good ? 0.65 : 0.35);
    c.flags.releaseRisk = backs ? -0.03 : 0.04;
    c.media.pressure = clamp(c.media.pressure + (backs ? -8 : 10), 0, 100);
    c.world.news.push({ season: nextYear, kind: 'principal', team: myChange.team, text: backs ? `새 팀 대표가 ${c.driver.name}을 팀의 중심으로 보고 있다(팀 내 입지 상승)` : `새 팀 대표가 ${c.driver.name}의 자리를 다시 따져 보겠다고 했다(팀 내 입지 흔들림)` });
  }
  c.year = nextYear;
  c.age += 1;
  return c;
}
