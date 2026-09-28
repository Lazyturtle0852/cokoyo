// SNSへの招待
//
//   X          … 文字数の上限に収まる短い文と、招待リンク
//   ストーリーズ … 1080×1920（9:16）の画像を作って、共有シートに渡す
//
// どちらも渡すのは招待リンク（?add=<共有キー>）。まだ登録していない人が開いても、
// 登録が終わった時点でそのまま申請が飛ぶ（src/app/invite.ts）ので、
// 受け取った人は「リンクを開く → 登録する」だけでフレンドになれる。

import { COLORS, SELF_COLOR, shade, SLIME } from '../field/campusField';

/** ストーリーズの大きさ。インスタグラムは 9:16 */
const W = 1080;
const H = 1920;
const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';

/**
 * Xに出す文。
 *
 * Xの上限は280「重み」で、日本語は1文字＝2。URLは何文字でも23として数えられる。
 * 下の文は51文字（COKOYOの6文字は1ずつなので重み 96）＋URL（23）で、上限280の半分ほど。
 */
export const tweetText = 'キャンパスにいるフレンドが分かるアプリ、COKOYOを使っています。よかったらフレンドになりませんか？';

export const tweetUrl = (link: string) =>
  `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(link)}`;

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
 * 招待のストーリーズ画像を作る。
 * qr は画面のどこかに描いてある QRコードの canvas（qrcode.react の QRCodeCanvas）。
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

  // 上下の余白はインスタの操作ボタンに隠れるので、中身は中央に寄せる
  const cardY = 300;
  const cardH = 1320;
  ctx.save();
  ctx.shadowColor = 'rgba(60,20,0,.28)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 20;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, 80, cardY, W - 160, cardH, 64);
  ctx.fill();
  ctx.restore();

  drawWordmark(ctx, W / 2, cardY + 150, 92);
  centered(ctx, 'フレンドが今キャンパスにいるか、', W / 2, cardY + 232, `500 36px ${FONT}`, '#57534E');
  centered(ctx, 'ボタンひとつで分かる', W / 2, cardY + 286, `500 36px ${FONT}`, '#57534E');

  // 芝生とスライム（アプリのホームと同じ絵）
  const fieldY = cardY + 470;
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

  // QRコード（白い下じきの上に置く）
  const qrSize = 400;
  const qrX = (W - qrSize) / 2;
  const qrY = cardY + 640;
  ctx.fillStyle = '#F2EFEB';
  roundRect(ctx, qrX - 28, qrY - 28, qrSize + 56, qrSize + 56, 36);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 26);
  ctx.fill();
  ctx.imageSmoothingEnabled = false; // QRはぼかさない
  ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);
  ctx.imageSmoothingEnabled = true;

  centered(ctx, `${displayName}さんから招待`, W / 2, qrY + qrSize + 110, `700 46px ${FONT}`, '#1C1917');
  centered(ctx, 'カメラで読み取って、登録するだけ。', W / 2, qrY + qrSize + 168, `500 32px ${FONT}`, '#57534E');
  centered(ctx, 'そのままフレンドになれます。', W / 2, qrY + qrSize + 216, `500 32px ${FONT}`, '#57534E');

  centered(ctx, host, W / 2, cardY + cardH + 86, `600 34px ${FONT}`, 'rgba(255,255,255,.92)');
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
  const file = new File([blob], 'cokoyo-invite.png', { type: 'image/png' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: link });
      return 'インスタのストーリーズに貼って、リンクも添えてください';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return '';
      // 共有できなければ保存に切り替える
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cokoyo-invite.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return '画像を保存しました。ストーリーズに貼ってください';
}
