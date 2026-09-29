// 発表やお知らせに使う画像を書き出す。
//
//   端末A: npm run dev            （http://localhost:5173）
//   端末B: node tools/capture-shots.mjs [URL]
//
// 出るもの（docs/shots/）
//   app-icon.png        … ホーム画面に置くアイコン（public/icon-512.png のコピー）
//   phone-01〜07.png    … スマホの枠に収まった画面（ホーム・地図・フレンド・追加・共有・設定）
//   story-invite.png    … インスタのストーリーズ用（1080×1920）
//
// 枠つきの画面は、説明用の外枠（?shell=explain）がスマホの枠を描いてくれるので、
// その枠（.device-col）だけを切り出している。

import { chromium } from '@playwright/test';
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = new URL('../docs/shots/', import.meta.url);
const dir = fileURLToPath(out);
await mkdir(dir, { recursive: true });

const browser = await chromium.launch();
// スライドに貼っても粗くならない密度。上げすぎるとファイルが重くなる
const context = await browser.newContext({ viewport: { width: 520, height: 1000 }, deviceScaleFactor: 2 });
const page = await context.newPage();

/** スマホの枠だけを切り出して保存する */
const shot = async (name) => {
  await page.waitForTimeout(500);
  await page.locator('.device-col').screenshot({ path: `${dir}${name}.png`, animations: 'disabled' });
  console.log(`docs/shots/${name}.png`);
};

const tab = (label) => page.locator('.tabs').getByRole('button', { name: label });

try {
  await page.goto(`${base}/?shell=explain`);
  await page.getByRole('button', { name: /ポイント獲得/ }).waitFor({ timeout: 15000 });

  // まわりの説明や操作パネルは写さない。枠だけを真ん中に置く
  await page.addStyleTag({ content: `
    .masthead, .panel, .device-caption { display: none !important; }
    body { padding: 0 !important; background: #F0EDE8 !important; }
    .stage { display: block !important; max-width: none !important; margin: 0 !important; }
    .device-col { width: 440px; margin: 0 auto; }
  ` });

  await shot('phone-01-home');

  await page.getByRole('button', { name: /ポイント獲得/ }).click();
  await page.waitForTimeout(2600); // スライムが降りて、ポイントが足されるまで
  await shot('phone-02-home-checked');

  await page.locator('.field-map-btn').click();
  await page.waitForTimeout(900);
  await shot('phone-03-map');
  await page.locator('.map-back').click();

  await tab('フレンド').click();
  await page.waitForTimeout(700);
  await shot('phone-04-friends');

  // 知り合いかも（フレンドの一覧より下にあるので、そこまで送る）
  await page.locator('.content').evaluate((el) => {
    const section = [...el.querySelectorAll('.sec h3')].find((h) => h.textContent === '知り合いかも');
    section?.closest('.sec')?.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(500);
  await shot('phone-04b-suggestions');
  await page.locator('.content').evaluate((el) => { el.scrollTop = 0; });

  await page.getByRole('button', { name: 'フレンドを追加' }).click();
  await page.waitForTimeout(700);
  await shot('phone-05-add-friend');

  // リンクで共有のタブ（ここを開くと、ストーリーズ用のQRも作られる）
  await page.locator('.sheet .seg button', { hasText: 'リンクで共有' }).click();
  await page.waitForTimeout(700);
  await shot('phone-06-share');

  // ストーリーズ用の画像（アプリの中で作っているものと同じ）
  const story = await page.evaluate(async () => {
    const share = await import('/src/phone/share.ts');
    const qr = document.querySelector('.qr-hidden canvas');
    if (!qr) return null;
    return share.drawStory(qr, 'ゆうき', 'cokoyo.lazyta-toru.net').toDataURL('image/png');
  }).catch(() => null);
  if (story) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(`${dir}story-invite.png`, Buffer.from(story.split(',')[1], 'base64'));
    console.log('docs/shots/story-invite.png');
  }
  await page.getByRole('button', { name: '閉じる' }).click();

  await tab('設定').click();
  await page.waitForTimeout(700);
  await shot('phone-07-settings');

  // アプリのアイコン
  await copyFile(fileURLToPath(new URL('../public/icon-512.png', import.meta.url)), `${dir}app-icon.png`);
  console.log('docs/shots/app-icon.png');
} finally {
  await browser.close();
}
