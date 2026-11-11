// 앱 상태와 로컬 저장(SPEC §10, PRD SV-1·SV-2).
// 엔진 Career는 그대로 저장하고, 화면 상태(현재 화면, 서명, 계약서 보관함, 원화 표시)만 덧붙인다.

import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import {
  applyOffseason, createCareer, getOffseason, resolveEvent, runSeason,
  type Career, type CareerSetup, type Offer, type RadioOptionId, type SeasonRecord, type TrainingId,
} from '../engine';

/** 획: [x, y, t, pressure] 목록. x·y는 0~1로 정규화(SPEC §3.3) */
export type Stroke = number[][];
export interface Signature {
  strokes: Stroke[];
  /** "이름으로 서명 만들기"를 고른 경우 */
  typed?: string;
}

export interface SignedContract {
  year: number;
  series: string;
  team: string;
  seat: 'race' | 'reserve';
  years: number;
  salary: number;
  seatCost: number;
  note: string;
  signature: Signature;
  firstF1: boolean;
}

export type Screen = 'home' | 'create' | 'dashboard' | 'offseason' | 'retired' | 'settings' | 'weekend' | 'records';

/** 기자회견 자동 응답(SPEC §6.1): null이면 매번 직접 고른다 */
export type InterviewAuto = null | 'humble' | 'confident' | 'bold';

/** F1 라이브 시즌 진행 상태(SPEC §5.3). 세션 중간에 닫아도 이어진다 */
export interface LiveSeason {
  year: number;
  plan: TrainingId[];
  round: number;
  /** 0 = 주말 시작 화면, 1부터 세션 */
  step: number;
  radio: Record<string, RadioOptionId>;
  /** 지금까지 치른 레이스의 누적 포인트 */
  points: Record<string, number>;
  /** 레이스 결과로 바로 간 라운드(라이브 재생 생략) */
  skipped: number[];
}

interface State {
  screen: Screen;
  career: Career | null;
  signature: Signature | null;
  firstF1Signature: Signature | null;
  contracts: SignedContract[];
  lastRecord: SeasonRecord | null;
  showKrw: boolean;
  live: LiveSeason | null;
  interviewAuto: InterviewAuto;
  setInterviewAuto: (v: InterviewAuto) => void;
  go: (s: Screen) => void;
  startLive: (plan: TrainingId[]) => void;
  updateLive: (patch: Partial<LiveSeason>) => void;
  /** 라이브 시즌을 마친다(남은 라운드는 엔지니어 추천으로 자동 진행) */
  finishLive: () => void;
  startCareer: (setup: CareerSetup, signature: Signature) => void;
  playSeason: (plan: TrainingId[]) => void;
  /** 제안을 받아들인다. 서명은 계약서 화면에서 받는다 */
  acceptOffer: (offer: Offer, joinAcademy: boolean, signature: Signature | null) => void;
  /** 전환점 이벤트 선택(SPEC §6) */
  chooseEvent: (eventId: string, optionId: string) => void;
  /** 시트 없이 1년 보내기 */
  skipSeat: (joinAcademy: boolean) => void;
  retire: () => void;
  setSignature: (s: Signature) => void;
  setShowKrw: (v: boolean) => void;
  reset: () => void;
  /** 저장 파일을 확인만 한다(가져오기 전 미리 보기). 잘못된 파일이면 이유를 돌려준다 */
  peekSave: (json: string) => { ok: true; name: string; year: number; retired: boolean } | { ok: false; reason: string };
  importSave: (json: string) => boolean;
  exportSave: () => string;
}

export const SAVE_VERSION = 1;

/** localStorage는 시크릿 모드 등에서 예외를 던질 수 있다. 실패해도 게임은 계속된다 */
const safeStorage: StateStorage = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { /* 저장 실패: 무시 */ } },
  removeItem: (k) => { try { localStorage.removeItem(k); } catch { /* 무시 */ } },
};

const initial = {
  screen: 'home' as Screen,
  career: null,
  signature: null,
  firstF1Signature: null,
  contracts: [] as SignedContract[],
  lastRecord: null,
  showKrw: true,
  live: null as LiveSeason | null,
  interviewAuto: null as InterviewAuto,
};

/** 기자회견 자동 응답이 켜져 있으면 이번 오프시즌 기자회견을 그 톤으로 처리한다 */
function autoInterview(c: Career, tone: InterviewAuto): Career {
  if (!tone) return c;
  let out = c;
  for (const id of c.pendingEvents ?? []) if (id.startsWith('iv_')) out = resolveEvent(out, id, tone).career;
  return out;
}

function validSave(d: any): string | null {
  if (d?.app !== 'kart-to-champion') return '이 게임의 저장 파일이 아닙니다.';
  const c = d.career;
  if (!c?.schemaVersion || !c.driver?.name || !Array.isArray(c.history) || !c.world?.teams || typeof c.year !== 'number') return '저장 파일이 손상됐거나 형식이 맞지 않습니다.';
  if ((d.saveVersion ?? 1) > SAVE_VERSION) return '더 새로운 버전에서 만든 저장 파일입니다.';
  return null;
}

export const useGame = create<State>()(
  persist(
    (set, get) => ({
      ...initial,
      go: (screen) => set({ screen }),
      startLive: (plan) => {
        const c = get().career;
        if (!c) return;
        set({ live: { year: c.year, plan, round: 0, step: 0, radio: {}, points: {}, skipped: [] }, screen: 'weekend' });
      },
      updateLive: (patch) => {
        const l = get().live;
        if (l) set({ live: { ...l, ...patch } });
      },
      finishLive: () => {
        const c = get().career;
        const l = get().live;
        if (!c || !l) return;
        const { career, record } = runSeason(c, l.plan, l.radio);
        set({ career: autoInterview(career, get().interviewAuto), lastRecord: record, live: null, screen: 'offseason' });
      },
      startCareer: (setup, signature) =>
        set({ career: createCareer(setup), signature, firstF1Signature: null, contracts: [], lastRecord: null, screen: 'dashboard' }),
      playSeason: (plan) => {
        const c = get().career;
        if (!c) return;
        const { career, record } = runSeason(c, plan);
        set({ career: autoInterview(career, get().interviewAuto), lastRecord: record, live: null, screen: 'offseason' });
      },
      acceptOffer: (offer, joinAcademy, signature) => {
        const c = get().career;
        if (!c) return;
        const firstF1 = offer.series === 'f1' && offer.seat === 'race' && c.f1Debut === null;
        const next = applyOffseason(c, { offerId: offer.id, joinAcademy });
        const contracts = [...get().contracts];
        if (offer.id !== 'stay' && signature) {
          contracts.push({
            year: c.year + 1, series: offer.series, team: offer.team, seat: offer.seat, years: offer.years,
            salary: offer.salary, seatCost: offer.seatCost, note: offer.note, signature, firstF1,
          });
        }
        set({ career: next, contracts, firstF1Signature: firstF1 && signature ? signature : get().firstF1Signature, screen: 'dashboard' });
      },
      chooseEvent: (eventId, optionId) => {
        const c = get().career;
        if (!c) return;
        set({ career: resolveEvent(c, eventId, optionId).career });
      },
      skipSeat: (joinAcademy) => {
        const c = get().career;
        if (!c) return;
        set({ career: applyOffseason(c, { offerId: null, joinAcademy }), screen: 'dashboard' });
      },
      retire: () => {
        const c = get().career;
        if (!c) return;
        const last = c.history[c.history.length - 1];
        // 시즌을 마친 오프시즌에만 은퇴를 기록할 수 있다
        const next = last && last.year === c.year ? applyOffseason(c, { offerId: null, retire: true }) : { ...c, retired: true };
        set({ career: next, screen: 'retired' });
      },
      setSignature: (signature) => set({ signature }),
      setShowKrw: (showKrw) => set({ showKrw }),
      setInterviewAuto: (interviewAuto) => set({ interviewAuto }),
      // 새 커리어: 표시·자동 응답 설정은 남긴다
      reset: () => set({ ...initial, showKrw: get().showKrw, interviewAuto: get().interviewAuto }),
      exportSave: () => {
        const { career, signature, firstF1Signature, contracts, showKrw, live, lastRecord, interviewAuto } = get();
        return JSON.stringify({ app: 'kart-to-champion', saveVersion: SAVE_VERSION, exportedAt: new Date().toISOString(), career, signature, firstF1Signature, contracts, showKrw, live, lastRecord, interviewAuto });
      },
      peekSave: (json) => {
        try {
          const d = JSON.parse(json);
          const bad = validSave(d);
          if (bad) return { ok: false, reason: bad };
          return { ok: true, name: d.career.driver.name, year: d.career.year, retired: !!d.career.retired };
        } catch {
          return { ok: false, reason: 'JSON 파일을 읽을 수 없습니다.' };
        }
      },
      importSave: (json) => {
        try {
          const d = JSON.parse(json);
          if (validSave(d)) return false;
          const live: LiveSeason | null = d.live && d.live.year === d.career.year ? d.live : null;
          set({
            career: d.career, signature: d.signature ?? null, firstF1Signature: d.firstF1Signature ?? null,
            contracts: d.contracts ?? [], showKrw: d.showKrw ?? true, lastRecord: d.lastRecord ?? null, live,
            interviewAuto: d.interviewAuto ?? get().interviewAuto,
            screen: d.career.retired ? 'retired' : live ? 'weekend' : 'dashboard',
          });
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: 'kart-to-champion-save',
      version: SAVE_VERSION,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        screen: s.screen === 'create' ? 'home' : s.screen, career: s.career, signature: s.signature,
        firstF1Signature: s.firstF1Signature, contracts: s.contracts, lastRecord: s.lastRecord, showKrw: s.showKrw, live: s.live,
        interviewAuto: s.interviewAuto,
      }),
    },
  ),
);

/** 오프시즌 화면용: 같은 career면 항상 같은 제안(엔진이 결정적) */
export function currentOffseason(c: Career) {
  const last = c.history[c.history.length - 1];
  return last && last.year === c.year && !c.retired ? getOffseason(c) : null;
}

export function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] ?? 1;
}
