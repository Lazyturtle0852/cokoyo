// ホーム画面に追加したときのための、いちばん小さいサービスワーカー。
//
// ねらいは3つだけ。
//   1. Android の Chrome に「アプリとして追加できる」と認めてもらう（fetch を見ている必要がある）
//   2. 電波が切れているときに、前に開けた画面だけでも出す
//   3. プッシュ通知（YO！された・キャンパスに着いた）を出す
//
// 中身は必ずネットワークを先に見る（network first）。更新をすぐ反映したいので、
// 表示に使うのは通信できなかったときの控えだけ。APIの返事は控えない。

const CACHE = 'cokoyo-shell-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

// プッシュ通知（YO！された・キャンパスに着いた）。中身はバックエンドの src/push.ts の PushMessage
self.addEventListener('push', (e) => {
  let msg = {};
  try { msg = e.data ? e.data.json() : {}; } catch { /* 読めない中身は既定の文で出す */ }
  e.waitUntil(self.registration.showNotification(msg.title || 'COKOYO', {
    body: msg.body || '',
    tag: msg.tag || 'cokoyo',
    icon: new URL('icon-192.png', self.registration.scope).href,
    data: { url: new URL(msg.url || './', self.registration.scope).href },
  }));
});

// 通知を押したら、開いているCOKOYOを前に出す。無ければ開く。
// 開いていたときは読み込み直さず、行き先だけ渡す（src/app/arrival.ts が「着いた」を受け取る）
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = wins.find((w) => w.url.startsWith(self.registration.scope));
    if (open) {
      open.postMessage({ type: 'notification-click', url });
      return open.focus();
    }
    return self.clients.openWindow(url);
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;       // フォントなどは触らない
  if (url.pathname.startsWith('/api/')) return;          // 在校やポイントは必ず本物を取りに行く

  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    } catch (err) {
      const hit = await caches.match(req);
      if (hit) return hit;
      // 画面の移動なら、控えてある入口を出す
      if (req.mode === 'navigate') {
        const index = await caches.match(new URL('./', self.location).toString());
        if (index) return index;
      }
      throw err;
    }
  })());
});
