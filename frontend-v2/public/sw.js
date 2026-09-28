// ホーム画面に追加したときのための、いちばん小さいサービスワーカー。
//
// ねらいは2つだけ。
//   1. Android の Chrome に「アプリとして追加できる」と認めてもらう（fetch を見ている必要がある）
//   2. 電波が切れているときに、前に開けた画面だけでも出す
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
