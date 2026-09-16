// 招待リンクを受け取る側
//
// リンクの形は「今開いているページ + ?add=<共有キー>」。
//   本番    https://cokoyo.lazyta-toru.net/?add=sk_xxxxxxxx
//   説明用  https://cokoyo.lazyta-toru.net/explain/?add=sk_xxxxxxxx
// パス（/add/<キー>）ではなくクエリにしてあるのは、ビルドの base が './' で、
// 深いパスから開くと assets の相対パスがずれて読み込めなくなるため。
//
// リンクを開いた人がまだ登録していないこともある。その場合は登録が終わるまで
// キーを預かっておきたいので、URLから外すと同時に sessionStorage に写す。

const PARAM = 'add';
const STORE = 'cokoyo-invite:v1';

const isShareKey = (s: string) => /^sk_[0-9A-Za-z]{4,64}$/.test(s);

/**
 * URLに招待リンクのキーが載っていれば預かり、URLからは消す。
 * アプリの起動時に一度だけ呼ぶ。
 */
export function takeInviteFromUrl() {
  try {
    const url = new URL(window.location.href);
    const key = url.searchParams.get(PARAM) ?? '';
    if (!key) return;
    url.searchParams.delete(PARAM);
    // 履歴に残すと「戻る」で申請をやり直すことになるので、今の履歴を置き換える
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    if (isShareKey(key)) sessionStorage.setItem(STORE, key);
  } catch { /* URLもsessionStorageも使えない環境。招待リンクだけ効かない */ }
}

/** 預かっている共有キー。無ければ空文字 */
export function pendingInvite(): string {
  try { return sessionStorage.getItem(STORE) ?? ''; } catch { return ''; }
}

/** 使い終わった（または使えなかった）ので捨てる */
export function clearPendingInvite() {
  try { sessionStorage.removeItem(STORE); } catch { /* 何もしない */ }
}
