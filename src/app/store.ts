// 앱 상태와 로컬 저장(SPEC §10, PRD SV-1·SV-2).
// 엔진 Career는 그대로 저장하고, 화면 상태(현재 화면, 서명, 계약서 보관함, 원화 표시)만 덧붙인다.

import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import {
  applyOffseason, createCareer, getOffseason, resolveEvent, runSeason,
  type Career, type CareerSetup, type Offer, type SeasonRecord, type TrainingId,
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

export type Screen = 'home' | 'create' | 'dashboard' | 'offseason' | 'retired' | 'settings';

interface State {
  screen: Screen;
  career: Career | null;
  signature: Signature | null;
  firstF1Signature: Signature | null;
  contracts: SignedContract[];
  lastRecord: SeasonRecord | null;
  showKrw: boolean;
  go: (s: Screen) => void;
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
};

export const useGame = create<State>()(
  persist(
    (set, get) => ({
      ...initial,
      go: (screen) => set({ screen }),
      startCareer: (setup, signature) =>
        set({ career: createCareer(setup), signature, firstF1Signature: null, contracts: [], lastRecord: null, screen: 'dashboard' }),
      playSeason: (plan) => {
        const c = get().career;
        if (!c) return;
        const { career, record } = runSeason(c, plan);
        set({ career, lastRecord: record, screen: 'offseason' });
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
      reset: () => set({ ...initial }),
      exportSave: () => {
        const { career, signature, firstF1Signature, contracts, showKrw } = get();
        return JSON.stringify({ app: 'kart-to-champion', saveVersion: SAVE_VERSION, career, signature, firstF1Signature, contracts, showKrw });
      },
      importSave: (json) => {
        try {
          const d = JSON.parse(json);
          if (d?.app !== 'kart-to-champion' || !d.career?.schemaVersion) return false;
          set({
            career: d.career, signature: d.signature ?? null, firstF1Signature: d.firstF1Signature ?? null,
            contracts: d.contracts ?? [], showKrw: d.showKrw ?? true, lastRecord: null,
            screen: d.career.retired ? 'retired' : 'dashboard',
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
        firstF1Signature: s.firstF1Signature, contracts: s.contracts, lastRecord: s.lastRecord, showKrw: s.showKrw,
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
