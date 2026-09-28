// SNSでアプリを知らせる
//
//   X          … 文字数の上限に収まる短い文と、アプリのページのURL
//   ストーリーズ … 1080×1920（9:16）の画像を作って、共有シートに渡す
//
// どちらにも**招待リンク（?add=<共有キー>）は入れない**。
// ストーリーズやXは不特定多数が見るので、そこに招待リンクを出すと知らない人にも
// フレンド申請の入り口を配ることになる。インスタの中のブラウザで開かれると、
// すでに登録している人でも登録し直しになってしまう、という問題もある。
//
// 出すのは「アプリのページ」だけにして、フレンドになるのは今までどおり、
// DMで声をかけあってから QR・招待リンク・共有キーでつなぐ（2026-09-28 グループで決定）。

import { COLORS, SELF_COLOR, shade, SLIME } from '../field/campusField';

/** ストーリーズの大きさ。インスタグラムは 9:16 */
const W = 1080;
const H = 1920;
const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';

/**
 * 招待リンクからキーを外した、ただのアプリのページ。SNSに出すのはこちら。
 * 手元で動かしているときは localhost のままになるが、それで構わない。
 */
export function appUrl(link: string): string {
  try {
    const url = new URL(link);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch { return link; }
}

/**
 * Xに出す文。
 *
 * Xの上限は280「重み」で、日本語は1文字＝2。URLは何文字でも23として数えられる。
 * 下の文は日本語62文字（重み124）＋URL（23）で、上限280の半分ほど。
 */
export const tweetText = 'キャンパスにいるフレンドが分かるアプリ、COKOYOを使っています。'
  + '気になる人はここから登録してみてください。登録したらDMをもらえれば、フレンドになれます。';

export const tweetUrl = (link: string) =>
  `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(appUrl(link))}`;

// ---------------------------------------------------------------
// ストーリーズ用の画像
// ---------------------------------------------------------------
const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

/** アプリの中と同じドット絵のスライムを描く */
function drawSlime(ctx: CanvasRenderingContext2D, cx: number, bottom: number, px: number, color: string) {
  const fill: Record<string, string> = {
    o: '#2E2A45', b: color, s: shade(color, -0.22), h: shade(color, 0.6), e: '#2E2A45', p: '#FF8FA8',
  };
  const x0 = cx - (SLIME[0].length * px) / 2;
  const y0 = bottom - SLIME.length * px;
  SLIME.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    ctx.globalAlpha = ch === 'p' ? 0.75 : 1;
    ctx.fillStyle = fill[ch];
    ctx.fillRect(x0 + x * px, y0 + y * px, px, px);
  }));
  ctx.globalAlpha = 1;
}

/** COK「O」YO。まんなかの O だけブランド色 */
function drawWordmark(ctx: CanvasRenderingContext2D, cx: number, y: number, size: number) {
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const parts: [string, string][] = [['COK', '#1C1917'], ['O', '#EA580C'], ['YO', '#1C1917']];
  const gap = size * 0.08; // 字間
  const total = parts.reduce((n, [t]) => n + ctx.measureText(t).width + gap * t.length, 0);
  let x = cx - total / 2;
  for (const [text, color] of parts) {
    ctx.fillStyle = color;
    for (const ch of text) {
      ctx.fillText(ch, x, y);
      x += ctx.measureText(ch).width + gap;
    }
  }
}

const centered = (ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, font: string, color: string) => {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, cx, y);
};

/**
 * 見出しの行。1行に収まればそのまま、収まらなければ「〇〇と」で改行する。
 * 名前が長いときは、はみ出さないところまで字を小さくする。
 */
function headlineLines(ctx: CanvasRenderingContext2D, displayName: string, maxWidth: number) {
  const whole = `${displayName}とキャンパスでつながろう`;
  for (let size = 62; size >= 40; size -= 4) {
    ctx.font = `800 ${size}px ${FONT}`;
    if (ctx.measureText(whole).width <= maxWidth) return { size, lines: [whole] };
    const split = [`${displayName}と`, 'キャンパスでつながろう'];
    if (split.every((line) => ctx.measureText(line).width <= maxWidth)) return { size, lines: split };
  }
  return { size: 40, lines: [`${displayName}と`, 'キャンパスでつながろう'] };
}

/**
 * ストーリーズ用の画像を作る。
 *
 * 出すのは「アプリの紹介」と「アプリのページのQRコード」まで。
 * 招待リンクは入れない（見た人が勝手にフレンドになれてしまうため）。
 * フレンドになるのは、見た人からDMをもらってから。
 *
 * qr は画面のどこかに描いてある QRコードの canvas（qrcode.react の QRCodeCanvas）で、
 * 中身はアプリのページのURL。
 */
export function drawStory(qr: HTMLCanvasElement, displayName: string, host: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  // 背景（ブランド色のグラデーション）
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, '#FF9A4D');
  bg.addColorStop(1, '#D9480F');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 上下はインスタの操作ボタンに隠れるので、中身は中央に寄せる
  const cardY = 250;
  const cardH = 1420;
  ctx.save();
  ctx.shadowColor = 'rgba(60,20,0,.28)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 20;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, 80, cardY, W - 160, cardH, 64);
  ctx.fill();
  ctx.restore();

  drawWordmark(ctx, W / 2, cardY + 140, 84);

  // 「〇〇とキャンパスでつながろう」
  const headline = headlineLines(ctx, displayName, W - 260);
  let y = cardY + 262;
  for (const line of headline.lines) {
    centered(ctx, line, W / 2, y, `800 ${headline.size}px ${FONT}`, '#1C1917');
    y += headline.size + 14;
  }
  centered(ctx, 'フレンドが今キャンパスにいるか、', W / 2, y + 22, `500 34px ${FONT}`, '#57534E');
  centered(ctx, 'ボタンひとつで分かるアプリ', W / 2, y + 72, `500 34px ${FONT}`, '#57534E');

  // 芝生とスライム（アプリのホームと同じ絵）
  const fieldY = y + 250;
  ctx.fillStyle = '#7EBF5D';
  ctx.beginPath();
  ctx.ellipse(W / 2, fieldY + 16, 380, 92, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#99D476';
  ctx.beginPath();
  ctx.ellipse(W / 2, fieldY, 376, 86, 0, 0, Math.PI * 2);
  ctx.fill();
  drawSlime(ctx, W / 2 - 210, fieldY + 22, 7, COLORS[0]);
  drawSlime(ctx, W / 2, fieldY + 52, 9, SELF_COLOR);
  drawSlime(ctx, W / 2 + 205, fieldY + 18, 7, COLORS[3]);

  // アプリのページのQRコード（白い下じきの上に置く）
  const qrSize = 330;
  const qrX = (W - qrSize) / 2;
  const qrY = fieldY + 150;
  ctx.fillStyle = '#F2EFEB';
  roundRect(ctx, qrX - 26, qrY - 26, qrSize + 52, qrSize + 52, 34);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, qrX - 14, qrY - 14, qrSize + 28, qrSize + 28, 24);
  ctx.fill();
  ctx.imageSmoothingEnabled = false; // QRはぼかさない
  ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);
  ctx.imageSmoothingEnabled = true;
  centered(ctx, 'カメラで読み取ると、登録の画面がひらきます', W / 2, qrY + qrSize + 64, `500 30px ${FONT}`, '#8B8580');

  // いちばん言いたいこと：登録したらDMをください
  const pillY = cardY + cardH - 150;
  ctx.fillStyle = '#FFF4ED';
  roundRect(ctx, 150, pillY, W - 300, 108, 54);
  ctx.fill();
  centered(ctx, '登録したら、DMで', W / 2, pillY + 46, `700 38px ${FONT}`, '#C2410C');
  centered(ctx, 'フレンド追加をお願いします', W / 2, pillY + 90, `700 38px ${FONT}`, '#C2410C');

  centered(ctx, host, W / 2, cardY + cardH + 82, `600 34px ${FONT}`, 'rgba(255,255,255,.92)');
  return canvas;
}

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));

/**
 * 作った画像を共有シートに渡す。渡せないブラウザでは、画像として保存させる。
 * 返り値は画面に出す知らせ。
 */
export async function shareStory(canvas: HTMLCanvasElement, link: string): Promise<string> {
  const blob = await toBlob(canvas);
  if (!blob) return '画像を作れませんでした';
  const file = new File([blob], 'cokoyo.png', { type: 'image/png' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      // 渡すのはアプリのページ。招待リンクは載せない
      await navigator.share({ files: [file], text: appUrl(link) });
      return 'ストーリーズに貼ってください。フレンド追加はDMで';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return '';
      // 共有できなければ保存に切り替える
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cokoyo.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return '画像を保存しました。ストーリーズに貼ってください';
}
