// 紹介ページ（public/about/）に載せる端末の画面を撮り直す。
//
//   端末A: npm run dev            （http://localhost:5173）
//   端末B: node tools/capture-about.mjs [URL]
//
// 出るもの（public/about/img/）
//   home / points / yo / map / friends / add .webp … スマホの枠ごと、背景は透明
//
// 模擬バックエンドのアプリ（?shell=explain）を操作して撮る。実データは写らない。
// WebP への変換に cwebp を使う（brew install webp）。

import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] ?? 'http://localhost:5173';
const dir = fileURLToPath(new URL('../public/about/img/', import.meta.url));
await mkdir(dir, { recursive: true });
const tmp = await mkdtemp(join(tmpdir(), 'cokoyo-about-'));

// Playwright のブラウザを入れていなければ、手元の Chrome を使う
const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
const context = await browser.newContext({ viewport: { width: 1300, height: 1000 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const screen = page.locator('.screen');
const wait = (ms) => page.waitForTimeout(ms);
const tab = (label) => page.locator('.tabs').getByRole('button', { name: label });

/** スマホの枠だけを切り出して、幅600pxの WebP にする */
const shot = async (name) => {
  await wait(500);
  const png = join(tmp, `${name}.png`);
  await page.locator('.device').screenshot({ path: png, animations: 'disabled', omitBackground: true });
  execFileSync('cwebp', ['-quiet', '-q', '82', '-alpha_q', '90', '-resize', '600', '0', png, '-o', `${dir}${name}.webp`]);
  console.log(`public/about/img/${name}.webp`);
};

/** その見出しが画面のいちばん上に来るまで送る */
const scrollToSection = (title) => screen.locator('.content').evaluate((el, t) => {
  const h = [...el.querySelectorAll('.sec h3')].find((x) => x.textContent === t);
  if (h) el.scrollTop += h.closest('.sec').getBoundingClientRect().top - el.getBoundingClientRect().top - 6;
}, title);
const scrollToTop = () => screen.locator('.content').evaluate((el) => { el.scrollTop = 0; });

try {
  await page.goto(`${base}/?shell=explain`);
  await screen.getByRole('button', { name: /ポイント獲得/ }).waitFor({ timeout: 15000 });

  // 「ホーム画面に追加」と「新しくできるようになったこと」のカードは写さない
  for (const name of ['あとで（もう出さない）', 'OK']) {
    const b = screen.getByRole('button', { name, exact: true });
    if (await b.count()) { await b.first().click(); await wait(200); }
  }
  // 模擬データの最初の状態では自分はキャンパス外。ポイントが入るところを撮るので、在校にする
  await page.locator('.demo-mac select').first().selectOption('present');
  await wait(300);
  // 影と背景は紹介ページの側で付ける
  await page.addStyleTag({ content: `
    .device { box-shadow: none !important; }
    html, body { background: transparent !important; }
    .toast { display: none !important; }
  ` });

  await screen.getByRole('button', { name: /ポイント獲得/ }).click();
  await wait(3500); // スライムが降りて、ポイントが足されるまで
  await shot('home');

  await scrollToSection('今日の獲得');
  await shot('points');
  await scrollToTop();

  await page.getByRole('button', { name: /あなたにYO！/ }).click();
  await wait(800);
  await shot('yo');
  await screen.getByRole('button', { name: 'あとで', exact: true }).click();
  await wait(400);

  await page.locator('.field-map-btn').click();
  await wait(1200);
  await shot('map');
  await page.locator('.map-back').click();

  await tab('フレンド').click();
  await wait(600);
  await scrollToSection('あなたの見え方');
  await shot('friends');
  await scrollToTop();

  await screen.getByRole('button', { name: 'フレンドを追加' }).click();
  await wait(800);
  await shot('add');
} finally {
  await browser.close();
  await rm(tmp, { recursive: true, force: true });
}
