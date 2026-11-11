// "게임 방법" 페이지용 실제 게임 화면 캡처(SPEC §10 v0.28).
//   npm run guide-shots      → public/guide/*.jpg
// 개발 서버를 직접 띄우고, 엔진으로 만든 커리어를 불러와 화면 일부를 찍는다. 화면이 바뀌면 다시 돌리면 된다.

import { mkdirSync } from 'node:fs';
import { chromium, type Locator, type Page } from '@playwright/test';
import { createServer } from 'vite';
import {
  applyOffseason, createCareer, DEFAULT_POLICY, getOffseason, isF1RaceSeason, pendingEventCards, resolveEvent, runSeason, type Career,
} from '../src/engine';

const OUT = 'public/guide';
const KEY = 'kart-to-champion-save';
const ALL_TIPS = ['dashboard', 'offseason', 'weekend'];
const HELMET = { base: '#fafafa', accent: '#e10600', pattern: 'stripe' as const };

function f1Career(): Career {
  for (let seed = 3; seed < 300; seed++) {
    let c = createCareer({ seed, name: '김민준', nationality: 'KR', wealthTier: 3, personality: 'fighter', candidateIndex: 0, focus: ['pace'], number: 27, helmet: HELMET });
    for (let i = 0; i < 25 && !c.retired; i++) {
      if (isF1RaceSeason(c)) return c;
      c = runSeason(c, DEFAULT_POLICY.training(c)).career;
      for (const card of pendingEventCards(c)) c = resolveEvent(c, card.id, card.options[0]!.id).career;
      c = applyOffseason(c, DEFAULT_POLICY.offseason(c, getOffseason(c)));
    }
  }
  throw new Error('F1 커리어를 만들지 못함');
}

async function load(page: Page, career: Career | null, screen = 'dashboard') {
  await page.goto('/');
  await page.evaluate(([k, v]) => localStorage.setItem(k!, v!), [KEY, JSON.stringify({
    state: { screen, career, signature: null, firstF1Signature: null, contracts: [], lastRecord: null, showKrw: true, live: null, interviewAuto: null, seenTips: ALL_TIPS },
    version: 1,
  })]);
  await page.reload();
  // 상단 메뉴가 캡처에 겹치지 않게 고정을 푼다
  await page.addStyleTag({ content: 'nav{position:static!important}' });
}

async function shot(target: Locator, name: string) {
  await target.scrollIntoViewIfNeeded();
  await target.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 78, animations: 'disabled' });
  console.log('saved', name);
}

const box = (page: Page, text: string | RegExp) => page.locator('section').filter({ hasText: text }).last();

async function main() {
  mkdirSync(OUT, { recursive: true });
  const server = await createServer({ server: { port: 5190, host: '127.0.0.1', strictPort: true } });
  await server.listen();
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL: 'http://127.0.0.1:5190', viewport: { width: 760, height: 1000 }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(8000);

  // 1) 생성: 헬멧과 차 번호(실제 F1 번호 경고)
  await load(page, null, 'home');
  await page.getByRole('button', { name: '새 커리어 시작하기' }).click();
  await page.getByLabel('이름').fill('김민준');
  await page.getByRole('button', { name: '다음' }).click();
  await page.getByLabel('차 번호').fill('44');
  await shot(box(page, '헬멧과 차 번호'), 'create-number');

  // 2) 대시보드: 훈련 계획
  const kart = createCareer({ seed: 7, name: '김민준', nationality: 'KR', wealthTier: 3, personality: 'fighter', candidateIndex: 0, focus: ['pace'], number: 27, helmet: HELMET });
  await load(page, kart);
  await shot(box(page, '훈련 계획'), 'dashboard-training');

  // 3) F1 주말: 전망 → 레이스(트랙 뷰, 무전, 타이밍 타워)
  const f1 = f1Career();
  await load(page, f1);
  await page.getByRole('button', { name: /시즌 라이브로 시작/ }).click();
  await shot(box(page, '이번 주말 전망'), 'weekend-intro');
  let gotRadio = false, gotTrack = false, gotLive = false;
  for (let round = 0; round < 6 && !(gotRadio && gotTrack); round++) {
    console.log('round', round + 1, { gotTrack, gotRadio });
    for (let i = 0; i < 7; i++) {
      if (await page.getByRole('button', { name: '×4' }).isVisible().catch(() => false)) break;
      await page.getByRole('button', { name: /다음 세션|다음 그랑프리/ }).first().click();
    }
    if (!gotTrack && gotRadio) {
      await page.getByRole('button', { name: '×4' }).click().catch(() => {});
      // 차들이 흩어진 8랩 이후의 트랙 뷰를 찍는다(초반은 한곳에 몰려 이름이 겹친다)
      const track = page.locator('svg[aria-label^="트랙 뷰"]');
      for (let tries = 0; tries < 10 && !gotTrack; tries++) {
        if (!(await track.waitFor({ timeout: 12_000 }).then(() => true).catch(() => false))) break;
        const lap = Number(/L(\d+)/.exec((await track.getAttribute('aria-label')) ?? '')?.[1] ?? 0);
        if (lap >= 8) {
          await page.waitForTimeout(1300);
          await shot(track.locator('xpath=..'), 'race-track');
          gotTrack = true;
        } else {
          await track.waitFor({ state: 'detached', timeout: 12_000 }).catch(() => {});
        }
      }
    }
    for (let k = 0; k < 8 && !gotRadio; k++) {
      const radio = page.getByRole('dialog', { name: '엔지니어 무전' });
      if (await radio.isVisible().catch(() => false)) {
        await shot(radio, 'race-radio');
        gotRadio = true;
        // 추천 선택지로 이어 가고, 무전 창이 닫힌 뒤 타이밍 타워를 찍는다
        await radio.getByRole('button').filter({ hasText: '추천' }).first().click();
        // 무전 직후 세이프티카·VSC 장면이 트랙 뷰로 뜬다(차들이 이미 흩어진 뒤라 보기 좋다)
        const scTrack = page.locator('svg[aria-label^="트랙 뷰"]');
        if (!gotTrack && await scTrack.waitFor({ timeout: 6000 }).then(() => true).catch(() => false)) {
          await page.waitForTimeout(1300);
          await shot(scTrack.locator('xpath=..'), 'race-track');
          gotTrack = true;
          await scTrack.waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
        }
        await page.waitForTimeout(800);
        if (!gotLive) {
          const tower = page.getByRole('list', { name: '타이밍 타워' });
          // 내 차(김민준) 줄이 보이도록 타워 안에서 스크롤한다
          await tower.evaluate((el) => {
            const me = [...el.querySelectorAll('li')].find((li) => li.textContent?.includes('김민준'));
            if (me) el.scrollTop = Math.max(0, (me as HTMLElement).offsetTop - el.clientHeight / 2);
          });
          await shot(tower, 'race-live');
          gotLive = true;
        }
        break;
      }
      const skip = page.getByRole('button', { name: '다음 결정·결과까지' });
      if (!(await skip.isVisible().catch(() => false))) break;
      await skip.click();
      await page.waitForTimeout(500);
    }
    // 이 주말을 끝내고 다음 그랑프리로
    if (!(gotRadio && gotTrack)) {
      await page.getByRole('button', { name: '레이스 결과로 바로 가기' }).click().catch(() => {});
      await page.getByRole('button', { name: '다음 그랑프리' }).click().catch(() => {});
    }
  }
  if (!gotRadio) console.warn('무전 장면을 찾지 못함');
  if (!gotTrack) console.warn('트랙 뷰 장면을 찾지 못함');

  // 4) 오프시즌: 기자회견과 제안
  await load(page, f1);
  await page.getByRole('button', { name: '한 번에 진행' }).click();
  await page.getByText(`${f1.year} 시즌 결과`).waitFor();
  const interview = page.locator('div.rounded-xl').filter({ hasText: '기자 질문' }).first();
  if (await interview.isVisible().catch(() => false)) await shot(interview, 'offseason-interview');
  for (let i = 0; i < 6; i++) {
    if (!(await page.getByText('전환점을 먼저 결정하면').isVisible().catch(() => false))) break;
    const pending = page.locator('div.rounded-xl').filter({ has: page.locator('button') }).filter({ hasText: /기자 질문|훈련|패독 밖|커리어|생활/ }).first();
    await pending.locator('button').first().click();
  }
  await shot(box(page, '시즌 제안'), 'offseason-offers');

  // 5) 업적·기록
  await page.getByRole('button', { name: '업적·기록' }).click();
  await shot(box(page, /업적 \d+ \/ \d+/), 'records');

  await browser.close();
  await server.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
