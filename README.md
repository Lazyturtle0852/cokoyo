# COKOYO

慶應義塾大学の学生が、フレンドの在校を確認し、同じ日にキャンパスにいるとポイントを集める試作アプリです。Google Workspace の `keio.jp` アカウントでログインし、在校確認に使う Wi-Fi 端末の MAC アドレスを最大 5 個登録します。Google アカウントの写真が取得できた場合は初期アイコンに使い、利用者が選んだ写真や削除の選択は次回ログイン後も維持します。
プロフィール画像を設定でき、フレンドは QR・招待リンク・共有キーで追加します。SNS への投稿にはアプリの紹介だけを載せ、招待リンクは含めません。

## 構成

- `frontend-v2/`: React、Vite のアプリと説明用・模擬デモ画面
- `backend/`: Hono、Node 24 組み込み SQLite、Google OIDC、DTC API 接続
- `shared/`: フロントと API の型契約
- `deploy/`: Docker Compose、Apache/Caddy、[v2 切替手順](deploy/cutover-v2.md)
- `docs/`: 設計資料。v1 の資料は旧仕様として残しています

ブラウザは同一オリジンの `/api` にアクセスします。MAC はバックエンドから DTC API にのみ送ります。フレンドには在校状態と、相互ベストフレンドなら建物を返します。いずれかの登録 MAC が在校なら在校と判定します。

## 必要なもの

Node.js 24 以上、npm、ローカル開発で実ログインを試す場合は Google Cloud の OAuth Web クライアント。デプロイには Docker Compose と既存の Apache または Caddy が必要です。

## 手元で動かす

1. `cd backend && npm ci && cp .env.example .env`。Google Cloud に `http://localhost:5173/api/v1/auth/google/callback` をリダイレクト URI として登録し、`.env` の `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` を設定します。
2. 同じディレクトリで `npm run dev`。API は `http://localhost:8080` で待ち受けます。
3. 別の端末で `cd frontend-v2 && npm ci && npm run dev`。`http://localhost:5173/?api=/api` で実 API に接続します。Google の設定がない場合は `http://localhost:5173/` の模擬バックエンドで画面を確認できます。

初回ログイン時は表示名と最初の MAC を登録します。表示名には Google の名前を初期入力し、登録前に編集できます。名前を取得できない場合は空欄から入力します。テスト画面の「新規登録画面から始める」でログインからの流れを模擬できます。

## 確認手順

1. 模擬バックエンドで「新規登録画面から始める」を押し、Google ログインを模擬します。
2. 表示名と最初の MAC を登録し、ホームを開きます。
3. 設定で 2 台目の MAC を追加し、デモ操作で片方を「接続中」にして在校確認します。
4. 設定で端末を編集・削除し、ログアウト後に再ログインして状態を確認します。

| 場所 | コマンド | 用途 |
|---|---|---|
| `backend/` | `npm test` | API テストと型契約 |
| `backend/` | `npm run build` | API ビルド |
| `frontend-v2/` | `npm run build` | 画面の型検査とビルド |
| `frontend-v2/` | `npm run dev` | 画面のローカル起動 |

## 公開パス

| パス | 内容 |
|---|---|
| `/` | 実データのアプリ |
| `/about/` | アプリの紹介。試作品であることと問い合わせ先 |
| `/terms/` | 利用規約 |
| `/privacy/` | プライバシーポリシー。MAC の扱いと `/explain/` で公開する範囲 |
| `/explain/` | 実データと通信・DB の説明。DB の全行は公開し、メール・Google ID・認証情報・MAC 原文・共有キーを伏せます |
| `/test/` | 模擬データの操作可能なデモ |
| `/api/v1/*` | API |
| `/documents/` | 設計資料 |

本番環境変数と初回切替、旧 DB 保管、復旧は [切替手順](deploy/cutover-v2.md) を参照してください。旧アカウント・交友・ポイントは v2 へ移しません。
