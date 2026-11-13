// 화면 흐름 E2E: F1 라이브 주말·레이스·내구레이스·기사
import {
  applyOffseason, createCareer, DEFAULT_POLICY, enduranceOffer, f1WeekendFor, getOffseason, isF1RaceSeason, pendingEventCards, previewEndurance, resolveEvent, runRace, runSeason, type Career,
} from '../src/engine';
import { expect, f1Career, goToFirstRace, KEY, loadSave, resolveAllEvents, test, useCleanStorage } from './helpers';

useCleanStorage();

test('F1 라이브: 주말 진행 중 남은 시즌 자동 진행 → 오프시즌', async ({ page }) => {
  const c = f1Career();
  await loadSave(page, c);
  await page.getByRole('button', { name: /시즌 라이브로 시작/ }).click();
  await expect(page.getByText('이번 주말 전망')).toBeVisible();
  await page.getByRole('button', { name: '다음 세션' }).click();
  // 시즌 중 훈련 전이면 훈련 세션까지 자동으로 가서 멈춘다
  await page.getByRole('button', { name: '남은 시즌 자동 진행' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '훈련 세션까지 자동 진행' }).click();
  const mid = page.getByLabel('시즌 중 훈련 세션');
  await expect(mid).toContainText('자동 진행을 잠시 멈췄습니다');
  await expect(page.getByRole('button', { name: '다음 세션' })).toBeDisabled();
  await mid.getByRole('button', { name: '훈련하기' }).click();
  await expect(mid).toContainText('훈련 완료');
  await mid.getByRole('button', { name: '남은 시즌 자동 진행' }).click();
  await expect(page.getByText(`${c.year} 시즌 결과`)).toBeVisible();
  const last = await page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)!).state.career; return { races: s.history.at(-1).races, mid: s.choiceLog.at(-1).mid }; }, KEY);
  expect(last.races).toBeGreaterThanOrEqual(23);
  expect(last.mid).toHaveLength(2);
});

test('한 번에 진행해도 F1은 시즌 중 훈련 세션에서 멈추고, 그 그랑프리부터 직접 참여할 수 있다', async ({ page }) => {
  const c = f1Career();
  await loadSave(page, c);
  await page.getByRole('button', { name: '한 번에 진행' }).click();
  const mid = page.getByLabel('시즌 중 훈련 세션');
  await expect(mid).toContainText('자동 진행을 잠시 멈췄습니다');
  await page.getByLabel('시즌 중 훈련 1칸').selectOption({ label: '우천 테스트 · €40k' });
  await mid.getByRole('button', { name: '훈련하기' }).click();
  await mid.getByRole('button', { name: '이 그랑프리부터 직접 참여' }).click();
  await expect(page.getByRole('button', { name: '다음 세션' })).toBeEnabled();
  const live = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).state.live, KEY);
  expect(live.midPlan[0]).toBe('wet');
  expect(live.midDone).toBe(true);
  expect(live.round).toBeGreaterThan(0);
});

test('레이스 도중 넘기기: 먼저 묻고, 허락하면 다음 그랑프리로 넘어간다', async ({ page }) => {
  const c = f1Career();
  await loadSave(page, c);
  await page.getByRole('button', { name: /시즌 라이브로 시작/ }).click();
  await goToFirstRace(page);
  await page.getByRole('button', { name: /넘기기$/ }).click();
  const dlg = page.getByRole('alertdialog');
  await expect(dlg).toContainText('넘겨도 될까요?');
  await dlg.getByRole('button', { name: '계속 보기' }).click();
  await expect(dlg).toHaveCount(0);
  await page.getByRole('button', { name: /넘기기$/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '넘기고 다음 그랑프리로' }).click();
  await expect(page.getByText(/라운드 2\//)).toBeVisible();
  const pts = await page.evaluate((k) => Object.keys(JSON.parse(localStorage.getItem(k)!).state.live.points).length, KEY);
  expect(pts).toBeGreaterThan(0);
});

test('F1 라이브 중 대시보드의 "남은 시즌 한 번에 진행"이 진행 상태를 이어받는다', async ({ page }) => {
  const c = f1Career();
  await loadSave(page, c);
  await page.getByRole('button', { name: /시즌 라이브로 시작/ }).click();
  await page.getByRole('button', { name: '다음 세션' }).click();
  await page.getByRole('button', { name: /카트에서 챔피언까지/ }).first().click(); // 홈
  await page.getByRole('button', { name: /이어하기/ }).first().click();
  await page.getByRole('button', { name: '대시보드', exact: true }).click();
  await page.getByRole('button', { name: '남은 시즌 한 번에 진행' }).click();
  // 시즌 중 훈련 세션에서 멈춘다 → 훈련 → 남은 시즌 자동 진행
  const mid = page.getByLabel('시즌 중 훈련 세션');
  await mid.getByRole('button', { name: '훈련하기' }).click();
  await mid.getByRole('button', { name: '남은 시즌 자동 진행' }).click();
  await expect(page.getByText(`${c.year} 시즌 결과`)).toBeVisible();
  // 시즌 결과에 드라이버·컨스트럭터 최종 순위표
  await expect(page.getByRole('region', { name: '드라이버 챔피언십 순위' }).locator('li').nth(9)).toBeVisible();
  await expect(page.getByRole('region', { name: '컨스트럭터 챔피언십 순위' }).locator('li')).not.toHaveCount(0);
  // 한 번에 진행한 시즌에도 주요 결승 기사
  await expect(page.getByRole('region', { name: '시즌 주요 기사' }).locator('details').first()).toBeVisible();
});

test('F1 레이스: 첫 랩부터 트랙 뷰가 계속 보이고, 결과·댓글이 아래에 붙는다. 챔피언십 표는 주말 시작에만', async ({ page }) => {
  const c = f1Career();
  await loadSave(page, c);
  await page.getByRole('button', { name: /시즌 라이브로 시작/ }).click();
  await expect(page.getByRole('heading', { name: '챔피언십 순위' })).toBeVisible();
  const track = page.locator('svg[aria-label^="트랙 뷰"]');
  // 프랙티스·퀄리파잉을 넘기고 첫 레이스(스프린트 또는 결승)까지
  await goToFirstRace(page);
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
  await expect(page.getByLabel('내구레이스')).toContainText(`${offer.hours}시간 레이스`);
  await page.getByLabel('내구레이스').getByRole('button', { name: '결과로 바로 가기' }).click();
  await expect(page.getByLabel('내구레이스')).toContainText(previewEndurance(c)!);
  await page.getByRole('button', { name: '남은 시즌 자동 진행' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '남은 시즌 자동 진행' }).click();
  await expect(page.getByText(`${c.year} 시즌 결과`)).toBeVisible();
  const log = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).state.career.choiceLog.at(-1), KEY);
  expect(log.endurance).toBe(true);
});

test('내구레이스 하이라이트 중계: 구간마다 고르고 기사를 본다. 고른 것이 시즌 기록에 남는다', async ({ page }) => {
  const c = f1Career((x) => !!enduranceOffer(x), 5);
  const offer = enduranceOffer(c)!;
  await loadSave(page, c);
  await page.getByRole('checkbox', { name: '내구레이스 출전' }).check();
  await page.getByRole('button', { name: /시즌 라이브로 시작/ }).click();
  await page.evaluate(([k, r]) => {
    const s = JSON.parse(localStorage.getItem(k as string)!);
    s.state.live.round = r; localStorage.setItem(k as string, JSON.stringify(s));
  }, [KEY, offer.afterRound + 1] as const);
  await page.reload();
  await page.getByRole('button', { name: '📺 하이라이트 중계 보기' }).click();
  const feed = page.getByRole('list', { name: '중계 기록' });
  await expect(feed).toContainText('출발한다');
  // 구간마다 공격적인 쪽을 고른다(리타이어하면 거기서 끝)
  for (let i = 0; i < 3; i++) {
    const end = page.getByRole('button', { name: '결과와 기사 보기' });
    const pick = page.getByRole('group').getByRole('button').first();
    await expect(end.or(pick)).toBeVisible();
    if (await end.isVisible()) break;
    await pick.click();
    const fast = page.getByRole('button', { name: '빨리 보기' });
    if (await fast.isVisible().catch(() => false)) await fast.click().catch(() => {});
  }
  await page.getByRole('button', { name: '결과와 기사 보기' }).click();
  await expect(page.getByRole('article', { name: '내구레이스 기사' })).toContainText(offer.name);
  const choices = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).state.live.enduranceChoices, KEY);
  expect(Object.keys(choices).length).toBeGreaterThan(0);
  await page.getByRole('button', { name: '남은 시즌 자동 진행' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '남은 시즌 자동 진행' }).click();
  await expect(page.getByText(`${c.year} 시즌 결과`)).toBeVisible();
  const log = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).state.career.choiceLog.at(-1), KEY);
  expect(log.enduranceChoices).toEqual(choices);
});

test('결승 뒤 기사와 SNS 글 고르기, 리타이어한 차는 OUT', async ({ page }) => {
  const c = f1Career();
  await loadSave(page, c);
  await page.getByRole('button', { name: /시즌 라이브로 시작/ }).click();
  await page.getByRole('button', { name: '레이스 결과로 바로 가기' }).click();
  const article = page.getByRole('article', { name: '레이스 기사' });
  await expect(article).toBeVisible();
  await expect(article.getByRole('heading')).toContainText(c.driver.name);
  const sns = page.getByRole('region', { name: 'SNS 게시' });
  await expect(sns.getByText('성격다운 글')).toBeVisible();
  await sns.getByRole('button').first().click();
  await expect(sns.getByText('시즌을 마칠 때 반영')).toBeVisible();
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).state.live.sns, KEY);
  expect(saved).toEqual({ '0': 'signature' });
  // 결과의 리타이어 수만큼 타이밍 타워에 OUT
  const race = f1WeekendFor(c, DEFAULT_POLICY.training(c), 0).sessions.filter((s) => s.type === 'race').at(-1)!;
  const out = race.type === 'race' ? runRace({ ...race.input, autoRadio: true }) : null;
  const dnf = out && out.status === 'finished' ? out.classification.filter((r) => r.status === 'dnf').length : 0;
  await expect(page.getByLabel('타이밍 타워').getByText('OUT', { exact: true })).toHaveCount(dnf);
});

test('팀 전략 회의: 출발 타이어와 피트 전략을 고르고 확정하면 레이스가 시작된다', async ({ page }) => {
  await loadSave(page, f1Career());
  await page.getByRole('button', { name: /시즌 라이브로 시작/ }).click();
  const meeting = page.getByRole('region', { name: '팀 전략 회의' });
  for (let i = 0; i < 6 && !(await meeting.isVisible().catch(() => false)); i++) await page.getByRole('button', { name: '다음 세션' }).click();
  await expect(meeting).toBeVisible();
  await expect(meeting.getByText('★팀')).toBeVisible();
  await expect(meeting.getByRole('radio').first()).toHaveAttribute('aria-checked', 'true');
  await meeting.getByRole('group', { name: '출발 타이어' }).getByRole('button', { name: /하드/ }).click();
  await meeting.getByRole('button', { name: '전략 확정하고 출발' }).click();
  await expect(page.locator('svg[aria-label^="트랙 뷰"]')).toBeVisible();
  const live = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).state.live, KEY);
  const key = Object.keys(live.strategy)[0]!;
  expect(live.strategyDone).toContain(key);
  // 고른 출발 타이어가 팀 추천과 같으면 tyre가 없고, 다르면 H
  expect([undefined, 'H']).toContain(live.strategy[key].tyre);
});
