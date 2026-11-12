// 화면 흐름 E2E: 커리어 만들기·오프시즌·기록·설정·안내
import {
  applyOffseason, createCareer, DEFAULT_POLICY, enduranceOffer, f1WeekendFor, getOffseason, isF1RaceSeason, pendingEventCards, previewEndurance, resolveEvent, runRace, runSeason, type Career,
} from '../src/engine';
import { expect, f1Career, KEY, loadSave, resolveAllEvents, test, useCleanStorage } from './helpers';

useCleanStorage();

test('새 커리어: 헬멧·번호(실제 F1 번호는 경고) → 대시보드', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '새 커리어' }).click();
  await page.getByLabel('성', { exact: true }).fill('김');
  await page.getByLabel('이름', { exact: true }).fill('테스트');
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

test('성·이름·별명: 국적에 맞는 순서로 부르고, 원하면 별명으로 불린다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '새 커리어' }).click();
  const preview = page.getByLabel('이름 미리 보기');
  // 한국: 성 먼저, 한글이면 붙여 쓴다
  await page.getByLabel('성', { exact: true }).fill('김');
  await page.getByLabel('이름', { exact: true }).fill('민준');
  await expect(preview).toContainText('김민준');
  // 영국: 이름 먼저
  await page.getByLabel('국적').selectOption('GB');
  await page.getByLabel('성', { exact: true }).fill('Rossi');
  await page.getByLabel('이름', { exact: true }).fill('Luca');
  await expect(preview).toContainText('Luca Rossi');
  await expect(preview).toContainText('ROS');
  // 별명을 넣고 별명으로 불리기
  await expect(page.getByLabel('별명으로 불리기')).toBeDisabled();
  await page.getByLabel('별명', { exact: true }).fill('The Rocket');
  await page.getByLabel('별명으로 불리기').check();
  await expect(preview).toContainText('The Rocket');
  await expect(preview).toContainText('본명 Luca Rossi');
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: '다음' }).click();
  await page.getByRole('button', { name: '이름으로 서명 만들기' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('The Rocket');
  await expect(page.getByLabel('본명·별명')).toHaveText('본명 Luca Rossi');
});
