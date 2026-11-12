// 화면 흐름 E2E: 훈련 계획·코치·멈춘 곳부터 이어하기
import {
  applyOffseason, createCareer, DEFAULT_POLICY, enduranceOffer, f1WeekendFor, getOffseason, isF1RaceSeason, pendingEventCards, previewEndurance, resolveEvent, runRace, runSeason, type Career,
} from '../src/engine';
import { expect, f1Career, goToFirstRace, KEY, loadSave, resolveAllEvents, test, useCleanStorage } from './helpers';

useCleanStorage();

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

test.describe('중간에 멈춘 곳부터 이어하기', () => {
  test('레이스 도중 새로고침해도 보던 랩부터 이어진다', async ({ page }) => {
    await loadSave(page, f1Career());
    await page.getByRole('button', { name: /시즌 라이브로 시작/ }).click();
    const track = page.locator('svg[aria-label^="트랙 뷰"]');
    await goToFirstRace(page);
    await page.getByRole('group', { name: '트랙 뷰 배속' }).getByRole('button', { name: '×60' }).click();
    const lapNow = async () => Number((await track.getAttribute('aria-label'))?.match(/L(\d+)\//)?.[1] ?? 0);
    // 무전이 뜨면 추천을 고르며 7랩까지 기다린다
    for (let i = 0; i < 60 && (await lapNow()) < 7; i++) {
      const radio = page.getByRole('dialog', { name: '엔지니어 무전' });
      if (await radio.isVisible().catch(() => false)) await radio.getByRole('button').filter({ hasText: '추천' }).first().click();
      await page.waitForTimeout(400);
    }
    expect(await lapNow()).toBeGreaterThanOrEqual(7);
    await page.reload();
    const lap = Number((await page.locator('svg[aria-label^="트랙 뷰"]').getAttribute('aria-label'))?.match(/L(\d+)\//)?.[1] ?? 0);
    expect(lap).toBeGreaterThanOrEqual(5);
    // 배속도 기억한다
    await expect(page.getByRole('group', { name: '트랙 뷰 배속' }).getByRole('button', { name: '×60' })).toHaveAttribute('aria-pressed', 'true');
    // 홈에서 멈춘 곳이 보이고, 이어하기로 주말로 돌아간다
    await page.getByRole('button', { name: /카트에서 챔피언까지/ }).first().click();
    await expect(page.getByLabel('멈춘 곳')).toContainText('레이스');
    await page.getByRole('button', { name: /^이어하기 · / }).click();
    await expect(page.locator('svg[aria-label^="트랙 뷰"]')).toBeVisible();
  });

  test('짜던 훈련 계획이 새로고침 뒤에도 남는다', async ({ page }) => {
    await loadSave(page, createCareer({ seed: 7, name: 'E2E', nationality: 'GB', wealthTier: 3, personality: 'calm', candidateIndex: 0, focus: ['pace'] }));
    await page.getByLabel('훈련 1칸').selectOption('wet');
    await page.getByLabel('훈련 2칸').selectOption('kart');
    await page.reload();
    await expect(page.getByLabel('훈련 1칸')).toHaveValue('wet');
    await expect(page.getByLabel('훈련 2칸')).toHaveValue('kart');
  });

  test('만들던 드라이버를 이어 만들 수 있다', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '새 커리어' }).click();
    await page.getByLabel('성', { exact: true }).fill('홍');
    await page.getByLabel('이름', { exact: true }).fill('이어만들기');
    await page.getByRole('button', { name: '다음' }).click();
    await page.getByLabel('차 번호').fill('27');
    await page.reload();
    await expect(page.getByLabel('차 번호')).toHaveValue('27');
    await page.getByRole('button', { name: /카트에서 챔피언까지/ }).first().click();
    await page.getByRole('button', { name: '만들던 드라이버 이어 만들기' }).click();
    await expect(page.getByLabel('차 번호')).toHaveValue('27');
    await page.getByRole('button', { name: '이전' }).click();
    await expect(page.getByLabel('이름', { exact: true })).toHaveValue('이어만들기');
  });

  test('오프시즌에서 멈추면 이어하기가 오프시즌으로, 새 커리어를 시작해도 자동 백업으로 되살린다', async ({ page }) => {
    await loadSave(page, createCareer({ seed: 7, name: '백업왕', nationality: 'GB', wealthTier: 3, personality: 'calm', candidateIndex: 0, focus: ['pace'] }));
    await page.getByRole('button', { name: /시즌 진행/ }).click();
    await expect(page.getByText(/시즌 결과/).first()).toBeVisible();
    await page.getByRole('button', { name: /카트에서 챔피언까지/ }).first().click();
    await expect(page.getByLabel('멈춘 곳')).toContainText('오프시즌');
    await page.getByRole('button', { name: /^이어하기 · / }).click();
    await expect(page.getByText(/시즌 결과/).first()).toBeVisible();
    // 새 커리어 시작 → 홈에 지난 커리어 백업
    await page.getByRole('button', { name: /카트에서 챔피언까지/ }).first().click();
    await page.getByRole('button', { name: '새 커리어 시작하기' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: '새로 시작' }).click();
    await page.getByRole('button', { name: '취소' }).click();
    const backup = page.getByRole('button', { name: /백업왕.*불러오기/ });
    await expect(backup).toBeVisible();
    await backup.click();
    await expect(page.getByText(/시즌 결과/).first()).toBeVisible();
  });

  test('자동 백업 삭제: 확인하면 목록과 저장소에서 지우고, 취소하면 남긴다', async ({ page }) => {
    const c = createCareer({ seed: 7, name: '지울백업', nationality: 'GB', wealthTier: 3, personality: 'calm', candidateIndex: 0, focus: ['pace'] });
    await page.goto('/');
    await page.evaluate(([k, data]) => {
      localStorage.setItem(k as string, JSON.stringify([{ seed: 7, name: '지울백업', year: 2026, retired: false, savedAt: new Date().toISOString(), data }]));
    }, ['kart-to-champion-backups', JSON.stringify({ app: 'kart-to-champion', saveVersion: 1, career: c })] as const);
    await page.reload();
    const del = page.getByRole('button', { name: '백업 삭제: 지울백업' });
    await del.click();
    await expect(page.getByRole('alertdialog')).toContainText('되돌릴 수 없습니다');
    await page.getByRole('alertdialog').getByRole('button', { name: '취소' }).click();
    await expect(del).toBeVisible();
    await del.click();
    await page.getByRole('alertdialog').getByRole('button', { name: '삭제' }).click();
    await expect(page.getByRole('button', { name: /지울백업/ })).toHaveCount(0);
    const left = await page.evaluate(() => JSON.parse(localStorage.getItem('kart-to-champion-backups') ?? '[]').length);
    expect(left).toBe(0);
  });
});
