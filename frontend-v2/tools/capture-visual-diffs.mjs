import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const out = new URL('../../artifacts/pr-screenshots/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
const page = await context.newPage();
const url = 'http://127.0.0.1:5173/';
const shot = async (name) => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: new URL(`${name}.png`, out).pathname, animations: 'disabled' });
  console.log(name);
};
const ready = async (text) => page.getByText(text, { exact: true }).first().waitFor({ timeout: 5000 });

try {
  await page.goto(`${url}?shell=app`);
  await page.getByRole('button', { name: /ポイント獲得/ }).waitFor();
  await shot('01-home-before-check');
  await page.getByRole('button', { name: /ポイント獲得/ }).click();
  await page.waitForTimeout(700);
  await shot('02-home-absent');
  await page.locator('.tabs').getByRole('button', { name: '設定' }).click();
  await ready('キャンパスの検知');
  await shot('03-settings-one-mac-top');
  await page.getByRole('button', { name: '写真を削除' }).click();
  await shot('03b-settings-avatar-removed');
  await page.locator('.content').evaluate((e) => { e.scrollTop = e.scrollHeight; });
  await shot('04-settings-account-logout');
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click();
  await ready('Googleでログイン');
  await shot('05-login');
  const embeddedContext = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Line/14.0.0',
  });
  const embedded = await embeddedContext.newPage();
  await embedded.goto(`${url}?shell=app`);
  await embedded.locator('.tabs').getByRole('button', { name: '設定' }).click();
  await embedded.getByRole('button', { name: 'ログアウト', exact: true }).click();
  await embedded.getByText('LINEの中のブラウザで開いています').waitFor();
  await embedded.screenshot({ path: new URL('05b-login-in-app-browser.png', out).pathname, animations: 'disabled' });
  console.log('05b-login-in-app-browser');
  await embeddedContext.close();
  await page.getByRole('button', { name: 'Googleでログイン' }).click();
  await page.getByRole('button', { name: /ポイント獲得/ }).waitFor();

  // デモ画面で新規アカウントを開始する。切り替えは同じブラウザの保存を共有する。
  await page.goto(url);
  await page.getByRole('button', { name: '新規登録画面から始める' }).click();
  await ready('フレンドに表示される名前');
  await page.goto(`${url}?shell=app`);
  await ready('フレンドに表示される名前');
  await shot('06-onboarding-name');
  await page.getByRole('textbox', { name: '表示名' }).fill('新しい学生');
  await page.getByRole('button', { name: '次へ' }).click();
  await ready('最初の端末を登録');
  await shot('07-onboarding-first-mac');
  await page.locator('.content').evaluate((e) => { e.scrollTop = e.scrollHeight; });
  await shot('07b-onboarding-first-mac-form');
  await page.getByRole('textbox', { name: 'MACアドレス' }).fill('02:00:00:00:00:00');
  await page.getByRole('button', { name: '登録する' }).click();
  await shot('08-onboarding-invalid-mac');
  await page.getByRole('textbox', { name: 'MACアドレス' }).fill('5e:12:34:56:78:90');
  await page.getByRole('button', { name: '登録する' }).click();
  await ready('登録しました');
  await shot('09-onboarding-done');
  await page.getByRole('button', { name: 'あとで' }).click();
  await page.locator('.tabs').getByRole('button', { name: '設定' }).click();
  await page.getByRole('button', { name: '端末を追加' }).click();
  await shot('10-settings-add-mac');
  await page.getByRole('textbox', { name: '端末の名前' }).fill('MacBook');
  await page.getByRole('textbox', { name: 'MACアドレス' }).fill('aa:00:00:00:00:02');
  await page.getByRole('button', { name: '保存' }).click();
  await ready('MacBook');
  await shot('11-settings-two-macs');
  await page.getByRole('button', { name: '編集' }).nth(1).click();
  await shot('12-settings-edit-mac');
  await page.getByRole('button', { name: 'やめる' }).click();
  await page.getByRole('button', { name: '削除', exact: true }).last().click();
  await shot('13-settings-delete-confirm');
  await page.getByRole('button', { name: 'やめる' }).click();

  for (let n = 3; n <= 5; n++) {
    await page.getByRole('button', { name: '端末を追加' }).click();
    await page.getByRole('textbox', { name: '端末の名前' }).fill(`端末${n}`);
    await page.getByRole('textbox', { name: 'MACアドレス' }).fill(`aa:00:00:00:00:0${n}`);
    await page.getByRole('button', { name: '保存' }).click();
    await ready(`端末${n}`);
  }
  await shot('14-settings-five-mac-limit');

  await page.locator('.tabs').getByRole('button', { name: 'フレンド' }).click();
  await page.getByRole('button', { name: /追加/ }).first().click();
  await shot('15-friend-add-qr');
  await page.getByRole('tab', { name: 'リンクで共有' }).click();
  await shot('16-friend-add-link-no-mac-search');
  await page.goto(url);
  await ready('あなたの端末ごとのWiFi状態');
  await page.getByRole('combobox', { name: 'iPhoneの状態' }).selectOption('unknown');
  await page.goto(`${url}?shell=app`);
  await page.getByRole('button', { name: /ポイント獲得/ }).click();
  await page.waitForTimeout(700);
  await shot('17-home-presence-unknown');
  await page.goto(url);
  await page.getByRole('combobox', { name: 'iPhoneの状態' }).selectOption('present');
  await page.goto(`${url}?shell=app`);
  await page.getByRole('button', { name: /ポイント獲得/ }).click();
  await page.waitForTimeout(700);
  await shot('18-home-one-of-many-present');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url);
  await page.locator('.call').first().waitFor();
  await shot('19-explain-cookie-and-mac-demo');
  await page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'バックエンドとの通信' }) }).screenshot({
    path: new URL('20-explain-cookie-api-log.png', out).pathname, animations: 'disabled',
  });
  if (process.env.CAPTURE_REAL_DB === '1') {
    const real = await context.newPage();
    await real.goto(`${url}?api=/api`);
    const panel = real.locator('.panel').filter({ has: real.getByRole('heading', { name: 'バックエンドのDBの中身' }) });
    await panel.getByText('mac_addresses', { exact: true }).waitFor();
    await panel.screenshot({ path: new URL('21-explain-public-db-redacted.png', out).pathname, animations: 'disabled' });
    console.log('21-explain-public-db-redacted');
  }
} finally {
  await browser.close();
}
