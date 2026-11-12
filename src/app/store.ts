// 앱 상태와 로컬 저장(SPEC §10, PRD SV-1·SV-2).
// 엔진 Career는 그대로 저장하고, 화면 상태(현재 화면, 서명, 계약서 보관함, 원화 표시)만 덧붙인다.

import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import {
  applyOffseason, createCareer, getOffseason, renameDuplicateDrivers, resolveEvent, runSeason,
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

export type Screen = 'home' | 'create' | 'dashboard' | 'offseason' | 'retired' | 'settings' | 'weekend' | 'records' | 'guide';

/** 기자회견 자동 응답(SPEC §6.1): null이면 매번 직접 고른다 */
export type InterviewAuto = null | 'humble' | 'confident' | 'bold' | 'joke';

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
  /** 여름·가을 내구레이스 출전(훈련 계획에서 고름) */
  endurance?: boolean;
  /** 레이스 트랙 뷰를 어디까지 봤는지(key = `라운드:세션 번호`). 중간에 닫아도 그 랩부터 다시 본다 */
  raceLap?: { key: string; lap: number };
  /** 그랑프리 결승 뒤 올린 SNS 글(라운드 → 선택지 id) */
  sns?: Record<string, string>;
}

/** 대시보드에서 짜던 훈련 계획(시즌 시작 전에 닫아도 남는다) */
export interface PlanDraft {
  year: number;
  plan: TrainingId[];
  endurance: boolean;
}

/** 만들던 드라이버(커리어 만들기 중간에 닫아도 남는다) */
export interface CreateDraft {
  seed: number;
  step: number;
  name: string;
  surname?: string;
  given?: string;
  nickname?: string;
  useNickname?: boolean;
  nationality: string;
  wealth: number;
  personality: string;
  reroll: number;
  candidate: number;
  focus: string[];
  helmet: unknown;
  numberText: string;
}

/** 자동 백업(커리어별 최근 상태, 최대 3개) */
export interface BackupEntry {
  seed: number;
  name: string;
  year: number;
  retired: boolean;
  savedAt: string;
  data: string;
}
export const BACKUP_KEY = 'kart-to-champion-backups';
const MAX_BACKUPS = 3;

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
  /** 닫은 첫 안내(SPEC §10 v0.26). 한 번 닫으면 다시 뜨지 않는다 */
  seenTips: string[];
  planDraft: PlanDraft | null;
  setPlanDraft: (d: PlanDraft | null) => void;
  createDraft: CreateDraft | null;
  setCreateDraft: (d: CreateDraft | null) => void;
  /** 이어하기: 멈췄던 곳(주말·오프시즌·대시보드)으로 간다 */
  resume: () => void;
  dismissTip: (id: string) => void;
  resetTips: () => void;
  go: (s: Screen) => void;
  startLive: (plan: TrainingId[], endurance?: boolean) => void;
  updateLive: (patch: Partial<LiveSeason>) => void;
  /** 라이브 시즌을 마친다(남은 라운드는 엔지니어 추천으로 자동 진행) */
  finishLive: () => void;
  startCareer: (setup: CareerSetup, signature: Signature) => void;
  playSeason: (plan: TrainingId[], endurance?: boolean) => void;
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
  seenTips: [] as string[],
  planDraft: null as PlanDraft | null,
  createDraft: null as CreateDraft | null,
};

/** 저장 파일을 열 때 한 번: 겹치는 가상 드라이버 이름을 새 이름 풀로 바꾼다(SPEC v0.39) */
export function migrateCareer(c: Career | null): Career | null {
  if (!c || c.flags?.namesV2) return c;
  const next = structuredClone(c);
  renameDuplicateDrivers(next);
  next.flags = { ...(next.flags ?? {}), namesV2: 1 };
  return next;
}

/** 진행 중인 커리어가 멈춘 곳 */
export function resumeScreen(career: Career | null, live: LiveSeason | null): Screen {
  if (!career) return 'home';
  if (career.retired) return 'retired';
  if (live && live.year === career.year) return 'weekend';
  const last = career.history[career.history.length - 1];
  if (last && last.year === career.year) return 'offseason';
  return 'dashboard';
}

function readBackups(): BackupEntry[] {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

export function listBackups(): BackupEntry[] {
  return readBackups();
}

/** 커리어마다 최근 상태 하나씩, 최근 것 3개까지 따로 보관한다(새 커리어를 시작해도 지난 커리어를 되살릴 수 있게) */
function writeBackup(data: string, c: Career): void {
  try {
    const entry: BackupEntry = { seed: c.seed, name: c.driver.name, year: c.year, retired: !!c.retired, savedAt: new Date().toISOString(), data };
    const list = [entry, ...readBackups().filter((b) => b.seed !== c.seed)].slice(0, MAX_BACKUPS);
    localStorage.setItem(BACKUP_KEY, JSON.stringify(list));
  } catch { /* 저장 공간이 없으면 백업은 건너뛴다 */ }
}

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
      setPlanDraft: (planDraft) => set({ planDraft }),
      setCreateDraft: (createDraft) => set({ createDraft }),
      resume: () => {
        const { career, live, createDraft } = get();
        set({ screen: !career && createDraft ? 'create' : resumeScreen(career, live) });
      },
      startLive: (plan, endurance = false) => {
        const c = get().career;
        if (!c) return;
        set({ live: { year: c.year, plan, round: 0, step: 0, radio: {}, points: {}, skipped: [], endurance }, screen: 'weekend' });
      },
      updateLive: (patch) => {
        const l = get().live;
        if (l) set({ live: { ...l, ...patch } });
      },
      finishLive: () => {
        const c = get().career;
        const l = get().live;
        if (!c || !l) return;
        const { career, record } = runSeason(c, l.plan, l.radio, { endurance: l.endurance, sns: l.sns });
        set({ career: autoInterview(career, get().interviewAuto), lastRecord: record, live: null, screen: 'offseason' });
      },
      startCareer: (setup, signature) =>
        set({ career: { ...createCareer(setup), flags: { namesV2: 1 } }, signature, firstF1Signature: null, contracts: [], lastRecord: null, screen: 'dashboard', createDraft: null, planDraft: null, live: null }),
      playSeason: (plan, endurance = false) => {
        const c = get().career;
        if (!c) return;
        const { career, record } = runSeason(c, plan, {}, { endurance });
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
      dismissTip: (id) => set({ seenTips: [...new Set([...get().seenTips, id])] }),
      resetTips: () => set({ seenTips: [] }),
      // 새 커리어: 표시·자동 응답 설정은 남긴다
      reset: () => set({ ...initial, showKrw: get().showKrw, interviewAuto: get().interviewAuto, seenTips: get().seenTips }),
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
            career: migrateCareer(d.career), signature: d.signature ?? null, firstF1Signature: d.firstF1Signature ?? null,
            contracts: d.contracts ?? [], showKrw: d.showKrw ?? true, lastRecord: d.lastRecord ?? null, live,
            interviewAuto: d.interviewAuto ?? get().interviewAuto,
            screen: resumeScreen(d.career, live), planDraft: null,
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
        screen: s.screen === 'create' && !s.createDraft ? 'home' : s.screen, career: s.career, signature: s.signature,
        firstF1Signature: s.firstF1Signature, contracts: s.contracts, lastRecord: s.lastRecord, showKrw: s.showKrw, live: s.live,
        interviewAuto: s.interviewAuto, seenTips: s.seenTips, planDraft: s.planDraft, createDraft: s.createDraft,
      }),
      // 이전 저장 파일에는 초안이 없다
      merge: (persisted, current) => ({ ...current, ...(persisted as object), career: migrateCareer((persisted as any)?.career ?? null), planDraft: (persisted as any)?.planDraft ?? null, createDraft: (persisted as any)?.createDraft ?? null }),
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

// 커리어 상태가 바뀔 때(시즌 진행·오프시즌 선택·이벤트) 자동 백업을 남긴다. 레이스 랩 진행 같은 잦은 변화에는 쓰지 않는다
useGame.subscribe((s, prev) => {
  if (s.career && (s.career !== prev.career || s.live?.round !== prev.live?.round)) writeBackup(s.exportSave(), s.career);
});
// 백업이 없던 이전 저장 파일도 열자마자 한 번 백업한다
{
  const s0 = useGame.getState();
  if (s0.career && !readBackups().some((b) => b.seed === s0.career!.seed)) writeBackup(s0.exportSave(), s0.career);
}

/** 휴대폰 브라우저가 저장 공간을 정리할 때 이 사이트 데이터를 지우지 않도록 요청한다(지원하는 브라우저만) */
export function requestPersistentStorage(): void {
  try { void navigator.storage?.persist?.(); } catch { /* 지원하지 않음 */ }
}
