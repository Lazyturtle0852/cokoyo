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

API 契約は [api-for-backend.md](../frontend-v2/docs/api-for-backend.md) と `shared/app-types.ts` を参照してください。MAC はアプリにはマスク表示のみ、フレンドには返しません。`/explain/` の DB 表（`/v1/debug/db`）は全行ですがメール・Google ID・認証情報・MAC 原文・共有キーを出しません。管理用パスワードで入った人にだけ返します。
プロフィール画像は縮小済みの JPEG・PNG・WebP の data URL を登録でき、フレンドにも返します。DB 表には画像の大きさだけを表示します。

## DTC とポイント

DTC の最新接続情報と天気だけを問い合わせます。履歴は取得しません。個々の MAC への問い合わせは最大 4 秒、同時問い合わせは最大 8 件です。503 や通信障害は「不明」とし、本人には不明、フレンドには欠席として見せます。建物が複数 MAC 間で食い違う場合は建物を伏せます。

ポイント計算は `src/points.ts`。来校ベース 20pt、連続来校・雨・フレンドとのマッチに加点します。

本番の設定、確認、復旧は [切替手順](../deploy/cutover-v2.md) を参照してください。

## ご意見・問い合わせ

問い合わせは Google フォームで受け付けるようにしたので、アプリからはもう呼んでいません。以前に届いたものを見るために残しています。

`POST /api/v1/feedback` を `feedback` テーブルに貯めます（1日5件、2〜1000文字）。自動通知はないので、ときどき見にいきます。管理画面（`/admin/`）に一覧が出ます。説明画面の DB 表には出しません。

```sh
docker compose exec api node -e "const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.env.DB_PATH);for(const r of db.prepare('SELECT created_at, message FROM feedback ORDER BY id DESC LIMIT 20').all())console.log(r.created_at, r.message)"
```

DB の形を変えるときは `src/db.ts` の `MIGRATIONS` に足します（`user_version` 管理、現在 5）。古い DB は起動時に足りない表と列を足して上げます。

## 管理画面と管理用パスワード

`ADMIN_PASSWORD` を設定すると、`/admin/`（管理画面）と `/explain/`（説明画面）にそのパスワードで入れます。空なら両方とも入れません。

- `POST /api/v1/admin/login` `{password}` で 12 時間有効の Cookie（HttpOnly、SameSite=Strict）を発行します。署名の鍵は起動ごとに作るので、再起動すると入り直しです。同じ IP から 15 分に 5 回間違えると、しばらく受け付けません。
- `GET /api/v1/admin/stats` は利用者数、使った人数（今日・7日・30日）、日ごとの推移、よく呼ばれる API、利用者一覧（メール付き）、ご意見を返します。`GET /api/v1/admin/db` は DB 表にメール・ご意見・アクセス数を足したものです。
- アクセス数は API の呼び出しを `access_daily`（日・利用者ごと）と `access_routes`（日・ルートごと）に足していきます。URL の中の値や IP は残しません。`/api/health`、`/v1/admin/*`、`/v1/debug/*`、`/v1/client-errors` と 404 は数えません。ページを開いただけ（静的ファイル）は数えません。
- `GET /api/v1/admin/logs` は運用ログ（`ops_events`）の新しい 500 件を返します。管理画面の「ログ」に出ます。残すのは全部で 5000 件までで、超えたら古いものから消えます。入るのは次の4種類だけです。
  - `start`：バックエンドの起動（デプロイ・再起動）
  - `error`：5xx を返した呼び出し。例外は MAC を含みうるので、名前（`ApiFailure` ならコード）だけを残します
  - `slow`：3 秒以上かかった呼び出し
  - `network`：ブラウザが返事を受け取れなかった呼び出し（画面に「バックエンドに接続できません」と出るもの）。サーバーには届いていないので、ブラウザが端末に溜めておき、次に通信できたときに `POST /api/v1/client-errors` `{errors: [...]}` で送ってきます。ログイン前の失敗も知りたいので、ログインは求めません（Origin の確認はあります）。パスは実在するルートの形に直して残し、ID などの値は残しません。1 回 20 件まで

## 招待の確認

`GET /api/v1/invites/:shareKey` は、招待リンク・QR の相手の名前と、いまの関係（`none` / `friends` / `requested` / `incoming`）を返します。申請はしません。アプリは招待リンクを開いた人に、これで相手の名前を出して「申請しますか？」と確かめてから `POST /api/v1/friends` で申請します（ストーリーズの QR などは知らない人の手にも渡るため）。

## 知り合いかも

`GET /api/v1/friends/suggestions` は、フレンドのフレンドから「ベストフレンド（相互）のフレンド」「共通のフレンドが2人以上」を最大10人返します（`src/repo.ts` の `suggestions`）。フレンドがまだ1人のあいだは、そのフレンドのフレンド全員を返します（はじめたばかりの人は共通が2人以上になりようがないため）。すでにフレンド・申請中・ブロック関係・登録途中・`users.discoverable = 0` は除きます。どちらの理由で出したかは返さず、共通のフレンドの一覧（名前）を返します。どちらもこちらのフレンドなので名前を出しています。申請は `POST /api/v1/friends` の `{userId, via: "suggestion"}` で、常に承認待ちになります。

