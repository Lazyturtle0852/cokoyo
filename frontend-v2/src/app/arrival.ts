// 「キャンパスに着きましたね」の通知から開かれたとき
//
// 通知の行き先は「./?arrived=<日本時間の日付>」（バックエンドの src/arrival.ts）。
// 押されたのが次の日なら、もう今日のことではないので何も出さない。
// アプリがすでに開いていれば、サービスワーカーが同じ URL を postMessage で渡してくる（public/sw.js）。

const PARAM = 'arrived';

const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

/** URL が今日の到着の知らせなら true */
export function isArrivalUrl(href: string): boolean {
  try { return new URL(href).searchParams.get(PARAM) === jstToday(); } catch { return false; }
}

/** 起動時に一度だけ呼ぶ。URL から印を外し、今日の知らせだったかを返す */
export function takeArrivalFromUrl(): boolean {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(PARAM)) return false;
    const arrived = isArrivalUrl(url.href);
    url.searchParams.delete(PARAM);
    // 履歴に残すと、戻ったり開き直したりするたびに出てしまう
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    return arrived;
  } catch { return false; }
}
