// E2E 공통 도우미: 엔진으로 만든 저장 파일을 불러오고, 테스트마다 저장소를 비운다.
import { expect, test, type Page } from '@playwright/test';
import {
  applyOffseason, createCareer, DEFAULT_POLICY, getOffseason, isF1RaceSeason, pendingEventCards, resolveEvent, runSeason, type Career,
} from '../src/engine';

export { expect, test };

export const KEY = 'kart-to-champion-save';

/** 엔진으로 F1 레이스 시트 직전까지 진행한 커리어(라이브 주말 테스트용) */
export function f1Career(ready: (c: Career) => boolean = isF1RaceSeason, wealthTier: 1 | 2 | 3 | 4 | 5 = 3): Career {
  for (let seed = 1; seed < 300; seed++) {
    let c = createCareer({ seed, name: 'E2E', nationality: 'GB', wealthTier, personality: 'calm', candidateIndex: 0, focus: ['pace'] });
    for (let i = 0; i < 30 && !c.retired; i++) {
      if (ready(c)) return c;
      c = runSeason(c, DEFAULT_POLICY.training(c)).career;
      for (const card of pendingEventCards(c)) c = resolveEvent(c, card.id, card.options[0]!.id).career;
      c = applyOffseason(c, DEFAULT_POLICY.offseason(c, getOffseason(c)));
    }
  }
  throw new Error('F1 커리어를 만들지 못함');
}

export async function loadSave(page: Page, career: Career, screen = 'dashboard') {
  await page.goto('/');
  await page.evaluate(([k, v]) => { localStorage.setItem(k!, v!); }, [KEY, JSON.stringify({ state: { screen, career: { ...career, flags: { ...(career.flags ?? {}), namesV2: 1 } }, signature: null, firstF1Signature: null, contracts: [], lastRecord: null, showKrw: true, live: null, interviewAuto: null }, version: 1 })]);
  await page.reload();
}

/** 오프시즌의 전환점 이벤트를 모두 첫 번째 선택지로 처리한다 */
export async function resolveAllEvents(page: Page) {
  for (let i = 0; i < 5; i++) {
    const gate = page.getByText('전환점을 먼저 결정하면');
    if (!(await gate.isVisible().catch(() => false))) return;
    const card = page.locator('div.rounded-xl').filter({ has: page.locator('button') }).filter({ hasText: /기자 질문|훈련|패독 밖|커리어|생활/ }).first();
    await card.locator('button').first().click();
  }
}

/** 테스트마다 저장소를 비운다(각 spec 파일 맨 위에서 부른다) */
export function useCleanStorage() {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });
}

/** 주말 시작에서 첫 레이스 트랙 뷰까지: 세션을 넘기고, 전략 회의가 나오면 팀 추천으로 확정한다 */
export async function goToFirstRace(page: Page) {
  const track = page.locator('svg[aria-label^="트랙 뷰"]');
  for (let i = 0; i < 8 && !(await track.isVisible().catch(() => false)); i++) {
    const confirm = page.getByRole('button', { name: '전략 확정하고 출발' });
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    else await page.getByRole('button', { name: '다음 세션' }).click();
  }
  return track;
}
