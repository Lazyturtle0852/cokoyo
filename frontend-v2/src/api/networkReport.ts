// 返事まで届かなかった呼び出しを、あとでバックエンドに知らせる
//
// fetch が投げた失敗は、サーバーには何も届いていないのでサーバーのログに残らない。
// その場では送れないので端末に溜めておき、次に通信できたときにまとめて送る。
// 届いたものは管理画面（/admin）の「ログ」に出る。

import type { ClientNetworkError } from './types';

const KEY = 'cokoyo-net-errors:v1';
/** 端末に溜める件数。バックエンドも1回にこれだけしか受け取らない */
const MAX = 20;

const read = (): ClientNetworkError[] => {
  try { const s = localStorage.getItem(KEY); return s ? (JSON.parse(s) as ClientNetworkError[]) : []; } catch { return []; }
};
const write = (list: ClientNetworkError[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* 溜められなければ諦める */ }
};

export function rememberNetworkError(e: Omit<ClientNetworkError, 'at' | 'online' | 'visible' | 'sinceLoad'>) {
  write([...read(), {
    ...e,
    at: new Date().toISOString(),
    online: navigator.onLine,
    visible: document.visibilityState === 'visible',
    sinceLoad: Math.round(performance.now()),
    message: e.message.slice(0, 120),
  }].slice(-MAX));
}

let sending = false;

/** 溜まっていれば送る。通信できた直後に呼ぶ。失敗しても次の機会に送り直す */
export function flushNetworkErrors(baseUrl: string) {
  if (sending) return;
  const errors = read();
  if (!errors.length) return;
  sending = true;
  fetch(`${baseUrl}/v1/client-errors`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
    body: JSON.stringify({ errors }), keepalive: true,
  })
    .then((res) => {
      // 受け取られた（4xx で突き返されたものも、送り直しても同じなので捨てる）。
      // 送っているあいだに増えたぶんは残す
      if (res.status < 500) write(read().slice(errors.length));
    })
    .catch(() => undefined)
    .finally(() => { sending = false; });
}
