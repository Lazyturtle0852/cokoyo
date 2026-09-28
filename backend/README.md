# COKOYO API

Google Workspace の `keio.jp` ID と、1 アカウントあたり最大 5 個の MAC を管理する Hono API です。登録 MAC のいずれかがキャンパスで観測されれば在校とし、DTC が判定できない場合は本人に「不明」を返してポイントを付けません。フレンドには不明を欠席として返します。

## ローカル

Node.js 24 以上が必要です。

```sh
npm ci
cp .env.example .env
# .env に自分たちの Google OAuth Web クライアント ID / secret を設定
npm run dev
npm test
npm run build
```

`.env` は開発時に読み込みます。本番は Compose の `backend/.env.production` を使用します。Google Cloud のリダイレクト URI はローカルで `http://localhost:5173/api/v1/auth/google/callback`、本番で `https://cokoyo.lazyta-toru.net/api/v1/auth/google/callback` です。`APP_ORIGIN` を同じオリジンに設定します。

## 認証と DB

`GET /api/v1/auth/google` から OIDC Authorization Code + PKCE を開始し、Google の ID トークンの署名・発行者・対象・期限に加えて `hd=keio.jp` と検証済み `@keio.jp` メールを確認します。安定した `sub` をアカウントキーにします。`profile` スコープで写真が取得できれば初期アイコンに使います。写真の取得に失敗した場合は通常どおりログインし、手動で変更・削除したアイコンは再ログイン時に上書きしません。Google のアクセストークンとリフレッシュトークンは保存しません。

セッションは 14 日の HttpOnly Cookie。HTTPS 本番では `Secure` と `__Host-` prefix を使い、変更要求は Origin を確認します。DB にはセッショントークンの SHA-256 ハッシュだけを保存します。`POST /api/v1/auth/logout-all` で全セッションを失効できます。

SQLite は起動時に新規 DB の v2 スキーマを作ります。旧 v1 DB は拒否します。旧データの移行はなく、別ボリュームを使うため、旧 DB を保存したまま切り替えられます。

API 契約は [api-for-backend.md](../frontend-v2/docs/api-for-backend.md) と `shared/app-types.ts` を参照してください。MAC はアプリにはマスク表示のみ、フレンドには返しません。公開 `/explain/` の DB 表は全行ですがメール・Google ID・認証情報・MAC 原文・共有キーを出しません。
プロフィール画像は縮小済みの JPEG・PNG・WebP の data URL を登録でき、フレンドにも返します。公開 DB 表には画像の大きさだけを表示します。

## DTC とポイント

DTC の最新接続情報と天気だけを問い合わせます。履歴は取得しません。個々の MAC への問い合わせは最大 4 秒、同時問い合わせは最大 8 件です。503 や通信障害は「不明」とし、本人には不明、フレンドには欠席として見せます。建物が複数 MAC 間で食い違う場合は建物を伏せます。

ポイント計算は `src/points.ts`。来校ベース 20pt、連続来校・雨・フレンドとのマッチに加点します。

本番の設定、確認、復旧は [切替手順](../deploy/cutover-v2.md) を参照してください。

## ご意見・問い合わせ

`POST /api/v1/feedback` を `feedback` テーブルに貯めます（1日5件、2〜1000文字）。自動通知はないので、ときどき見にいきます。公開 DB 表には出しません。

```sh
docker compose exec api node -e "const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.env.DB_PATH);for(const r of db.prepare('SELECT created_at, message FROM feedback ORDER BY id DESC LIMIT 20').all())console.log(r.created_at, r.message)"
```

DB の形を変えるときは `src/db.ts` の `MIGRATIONS` に足します（`user_version` 管理、現在 3）。v2 の DB は起動時に `feedback` を足して v3 に上げます。

