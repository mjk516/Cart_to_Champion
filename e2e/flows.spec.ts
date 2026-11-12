// 핵심 화면 흐름 E2E(SPEC §10). 엔진 테스트로는 못 잡는 화면 버그(눌러도 반응 없는 버튼 등)를 막는다.
import { expect, test, type Page } from '@playwright/test';
import {
  applyOffseason, createCareer, DEFAULT_POLICY, enduranceOffer, getOffseason, isF1RaceSeason, pendingEventCards, previewEndurance, resolveEvent, runSeason, type Career,
} from '../src/engine';

const KEY = 'kart-to-champion-save';

/** 엔진으로 F1 레이스 시트 직전까지 진행한 커리어(라이브 주말 테스트용) */
function f1Career(ready: (c: Career) => boolean = isF1RaceSeason, wealthTier: 1 | 2 | 3 | 4 | 5 = 3): Career {
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

async function loadSave(page: Page, career: Career, screen = 'dashboard') {
  await page.goto('/');
  await page.evaluate(([k, v]) => { localStorage.setItem(k!, v!); }, [KEY, JSON.stringify({ state: { screen, career, signature: null, firstF1Signature: null, contracts: [], lastRecord: null, showKrw: true, live: null, interviewAuto: null }, version: 1 })]);
  await page.reload();
}

/** 오프시즌의 전환점 이벤트를 모두 첫 번째 선택지로 처리한다 */
async function resolveAllEvents(page: Page) {
  for (let i = 0; i < 5; i++) {
    const gate = page.getByText('전환점을 먼저 결정하면');
    if (!(await gate.isVisible().catch(() => false))) return;
    const card = page.locator('div.rounded-xl').filter({ has: page.locator('button') }).filter({ hasText: /기자 질문|훈련|패독 밖|커리어|생활/ }).first();
    await card.locator('button').first().click();
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('새 커리어: 헬멧·번호(실제 F1 번호는 경고) → 대시보드', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '새 커리어' }).click();
  await page.getByLabel('이름').fill('김테스트');
  await page.getByRole('button', { name: '다음' }).click();

  const num = page.getByLabel('차 번호');
  await num.fill('44');
  await expect(page.getByRole('alert')).toContainText('실제 F1 드라이버');
  await expect(page.getByRole('button', { name: '다음' })).toBeDisabled();
  await num.fill('1');
  await expect(page.getByRole('alert')).toContainText('챔피언');
  await num.fill('9');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: '바탕색 #2563eb' }).click();
  await page.getByRole('button', { name: '별' }).click();

  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '다음' }).click();
  await page.getByRole('button', { name: '이름으로 서명 만들기' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('김테스트');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('#9');
});

test('시즌 진행 → 오프시즌 → 은퇴 선언(게임 안 확인 창)', async ({ page }) => {
  await loadSave(page, createCareer({ seed: 5, name: '은퇴테스트', nationality: 'KR', wealthTier: 3, personality: 'fighter', candidateIndex: 0, focus: ['pace'] }));
  await page.getByRole('button', { name: /2026 시즌 진행/ }).click();
  await expect(page.getByText('2026 시즌 결과')).toBeVisible();
  await resolveAllEvents(page);
  await page.getByRole('button', { name: '은퇴 선언' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('되돌릴 수 없습니다');
  await dialog.getByRole('button', { name: '취소' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '은퇴 선언' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '은퇴 선언' }).click();
  await expect(page.getByText('CAREER CARD')).toBeVisible();
});

test('시트 없는 해에는 대시보드에서도 은퇴할 수 있다', async ({ page }) => {
  const c = createCareer({ seed: 6, name: '무소속', nationality: 'KR', wealthTier: 3, personality: 'calm', candidateIndex: 0, focus: ['pace'] });
  await loadSave(page, { ...c, contract: null });
  await page.getByRole('button', { name: '은퇴 선언' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '은퇴 선언' }).click();
  await expect(page.getByText('CAREER CARD')).toBeVisible();
});

test('F1 라이브: 주말 진행 중 남은 시즌 자동 진행 → 오프시즌', async ({ page }) => {
  const c = f1Career();
  await loadSave(page, c);
  await page.getByRole('button', { name: /시즌 라이브로 시작/ }).click();
  await expect(page.getByText('이번 주말 전망')).toBeVisible();
  await page.getByRole('button', { name: '다음 세션' }).click();
  await page.getByRole('button', { name: '남은 시즌 자동 진행' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '남은 시즌 자동 진행' }).click();
  await expect(page.getByText(`${c.year} 시즌 결과`)).toBeVisible();
  const races = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).state.career.history.at(-1).races, KEY);
  expect(races).toBeGreaterThanOrEqual(23);
});

test('F1 라이브 중 대시보드의 "남은 시즌 한 번에 진행"이 진행 상태를 이어받는다', async ({ page }) => {
  const c = f1Career();
  await loadSave(page, c);
  await page.getByRole('button', { name: /시즌 라이브로 시작/ }).click();
  await page.getByRole('button', { name: '다음 세션' }).click();
  await page.getByRole('button', { name: /카트에서 챔피언까지/ }).first().click(); // 홈
  await page.getByRole('button', { name: /이어하기/ }).first().click();
  await page.getByRole('button', { name: '남은 시즌 한 번에 진행' }).click();
  await expect(page.getByText(`${c.year} 시즌 결과`)).toBeVisible();
  // 시즌 결과에 드라이버·컨스트럭터 최종 순위표
  await expect(page.getByRole('region', { name: '드라이버 챔피언십 순위' }).locator('li').nth(9)).toBeVisible();
  await expect(page.getByRole('region', { name: '컨스트럭터 챔피언십 순위' }).locator('li')).not.toHaveCount(0);
});

test('업적·기록과 설정(내보내기 → 가져오기 확인 창)', async ({ page }) => {
  await loadSave(page, createCareer({ seed: 9, name: '기록', nationality: 'KR', wealthTier: 3, personality: 'calm', candidateIndex: 0, focus: ['pace'] }));
  await page.getByRole('button', { name: '업적·기록' }).click();
  await expect(page.getByRole('heading', { name: '업적·기록' })).toBeVisible();
  await expect(page.getByText(/업적 \d+ \/ \d+/)).toBeVisible();

  await page.getByRole('button', { name: '설정' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '내보내기' }).click();
  const file = await (await download).path();
  await page.locator('input[type=file]').setInputFiles(file!);
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('저장 파일로 바꿀까요');
  await dialog.getByRole('button', { name: '불러오기' }).click();
  // 불러오면 바로 그 커리어의 대시보드로 넘어간다
  await expect(page.getByRole('heading', { level: 1 })).toContainText('기록');
});

test('휴대폰 폭(375px)에서 가로로 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await loadSave(page, f1Career());
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: /시즌 라이브로 시작/ }).click();
  expect(await overflow()).toBeLessThanOrEqual(0);
});

test('첫 안내: 한 번 닫으면 다시 안 뜨고, 설정에서 다시 볼 수 있다. 게임 방법 페이지', async ({ page }) => {
  await loadSave(page, createCareer({ seed: 11, name: '안내', nationality: 'KR', wealthTier: 3, personality: 'calm', candidateIndex: 0, focus: ['pace'] }));
  const tip = page.getByRole('note').filter({ hasText: '커리어 본부' });
  await expect(tip).toBeVisible();
  await tip.getByRole('button', { name: '알겠어요' }).click();
  await expect(tip).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('note').filter({ hasText: '커리어 본부' })).toHaveCount(0);
  await page.getByRole('button', { name: '설정' }).click();
  await page.getByRole('button', { name: '처음 안내 다시 보기' }).click();
  await page.getByRole('button', { name: '돌아가기' }).click();
  await expect(page.getByRole('note').filter({ hasText: '커리어 본부' })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: '게임 방법' }).click();
  await expect(page.getByRole('heading', { name: '게임 방법' })).toBeVisible();
  await expect(page.getByText('슈퍼 라이선스 40점')).toBeVisible();
});

test('게임 방법의 실제 화면 그림이 모두 열린다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: '게임 방법' }).click();
  const imgs = page.locator('figure img');
  await expect(imgs).toHaveCount(9);
  await imgs.evaluateAll((els) => els.forEach((e) => ((e as HTMLImageElement).loading = 'eager')));
  await expect.poll(() => imgs.evaluateAll((els) => els.filter((e) => !(e as HTMLImageElement).complete || (e as HTMLImageElement).naturalWidth === 0).length)).toBe(0);
});

test('F1 레이스: 첫 랩부터 트랙 뷰가 계속 보이고, 결과·댓글이 아래에 붙는다. 챔피언십 표는 주말 시작에만', async ({ page }) => {
  const c = f1Career();
  await loadSave(page, c);
  await page.getByRole('button', { name: /시즌 라이브로 시작/ }).click();
  await expect(page.getByRole('heading', { name: '챔피언십 순위' })).toBeVisible();
  const track = page.locator('svg[aria-label^="트랙 뷰"]');
  // 프랙티스·퀄리파잉을 넘기고 첫 레이스(스프린트 또는 결승)까지
  for (let i = 0; i < 4 && !(await track.isVisible().catch(() => false)); i++) await page.getByRole('button', { name: '다음 세션' }).click();
  await expect(track).toBeVisible();
  await expect(page.getByRole('heading', { name: '챔피언십 순위' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: '트랙 뷰 배속' })).toBeVisible();
  await expect(page.getByRole('group', { name: '트랙 뷰 배속' }).getByRole('button')).toHaveText(['×5', '×10', '×30', '×60']);
  // 결과까지 넘기면(무전은 추천) 트랙 뷰는 체커기 장면으로 남는다
  for (let i = 0; i < 12; i++) {
    const radio = page.getByRole('dialog', { name: '엔지니어 무전' });
    if (await radio.isVisible().catch(() => false)) await radio.getByRole('button').filter({ hasText: '추천' }).first().click();
    const skip = page.getByRole('button', { name: '다음 결정·결과까지' });
    if (!(await skip.isVisible().catch(() => false))) break;
    await skip.click();
  }
  await expect(track).toHaveAttribute('aria-label', /체커기/);
  await expect(page.getByText('결과', { exact: true })).toBeVisible();
  await expect(page.getByLabel('실시간 댓글').locator('li')).not.toHaveCount(0);
});

test('훈련 계획: 칸마다 오르는 능력치가 보이고, 프로그램 설명을 펼칠 수 있다', async ({ page }) => {
  await loadSave(page, createCareer({ seed: 7, name: 'E2E', nationality: 'GB', wealthTier: 3, personality: 'calm', candidateIndex: 0, focus: ['pace'] }));
  await page.getByText('훈련 프로그램별로 오르는 능력치').click();
  await expect(page.getByText('가상 주행으로 한계 속도를 다듬는다')).toBeVisible();
  await expect(page.getByText(/순간 속도 ▲/).first()).toBeVisible();
});

test('코치진 조언: 조언대로 짜기를 누르면 조언대로 짠 계획 표시', async ({ page }) => {
  await loadSave(page, createCareer({ seed: 7, name: 'E2E', nationality: 'GB', wealthTier: 3, personality: 'calm', candidateIndex: 0, focus: ['pace'] }));
  const card = page.getByLabel('코치 조언');
  await expect(card).toBeVisible();
  await page.getByLabel('훈련 1칸').selectOption('wet');
  await page.getByLabel('훈련 2칸').selectOption('wet');
  await expect(card.getByText('조언과 다른 계획')).toBeVisible();
  await card.getByRole('button', { name: '코치 조언대로 짜기' }).click();
  await expect(card.getByText('조언대로 짠 계획')).toBeVisible();
});

test('주말 시작에서 퀄리파잉으로 바로 갈 수 있다(프랙티스 건너뛰기)', async ({ page }) => {
  await loadSave(page, f1Career());
  await page.getByRole('button', { name: /시즌 라이브로 시작/ }).click();
  await page.getByRole('button', { name: /퀄리파잉으로 바로 가기/ }).click();
  await expect(page.getByText(/퀄리파잉 결과/)).toBeVisible();
  await expect(page.getByRole('button', { name: /퀄리파잉으로 바로 가기/ })).toHaveCount(0);
});

test('내구레이스: 팀 입지가 단단하면 훈련 계획에서 출전을 고르고, 휴식기 다음 주말에 결과가 나온다', async ({ page }) => {
  const c = f1Career((x) => !!enduranceOffer(x), 5);
  const offer = enduranceOffer(c)!;
  await loadSave(page, c);
  const box = page.getByRole('checkbox', { name: '내구레이스 출전' });
  await expect(box).toBeVisible();
  await expect(page.getByText(offer.name)).toBeVisible();
  await box.check();
  await page.getByRole('button', { name: /시즌 라이브로 시작/ }).click();
  await expect(page.getByLabel('내구레이스')).toHaveCount(0);
  // 휴식기 다음 라운드로 옮겨 결과 카드를 본다
  await page.evaluate(([k, r]) => {
    const s = JSON.parse(localStorage.getItem(k as string)!);
    s.state.live.round = r; localStorage.setItem(k as string, JSON.stringify(s));
  }, [KEY, offer.afterRound + 1] as const);
  await page.reload();
  await expect(page.getByLabel('내구레이스')).toContainText(previewEndurance(c)!);
  await page.getByRole('button', { name: '남은 시즌 자동 진행' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '남은 시즌 자동 진행' }).click();
  await expect(page.getByText(`${c.year} 시즌 결과`)).toBeVisible();
  const log = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).state.career.choiceLog.at(-1), KEY);
  expect(log.endurance).toBe(true);
});
