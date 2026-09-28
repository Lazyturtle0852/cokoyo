# COKOYO フロントエンド

React + Vite + TypeScript のアプリです。`keio.jp` Google ログイン後、表示名と最初の MAC を登録し、設定から最大 5 台の端末とプロフィール画像を管理します。Google の写真が取得できれば初期アイコンになり、利用者による変更・削除は保持されます。フレンドの在校、ポイント、地図、かくれんぼを表示します。フレンド追加は QR・招待リンク・共有キーを使います。SNS 投稿には招待リンクを含めません。

## 起動

Node.js 24 以上。

```sh
npm ci
npm run dev       # http://localhost:5173/
npm run build     # 型検査と dist/ ビルド
npm run typecheck
```

環境変数がなければ模擬バックエンドです。説明用画面の「新規登録画面から始める」を使うとログインと登録を試せます。実 API を使うときは `http://localhost:5173/?api=/api` にアクセスし、先に `backend/` を起動してください。Vite は `/api` を `127.0.0.1:8080` に転送します。Google OAuth の callback URL と API の `APP_ORIGIN` は `http://localhost:5173` に合わせます。

## 画面と通信

- `src/phone/`: ログイン、初回登録、ホーム、フレンド、地図、設定、プロフィール画像と SNS 共有
- `src/api/client.ts`: 同一オリジン Cookie を送る API 呼び出し
- `src/api/mockBackend.ts`: `/test/` 用の模擬バックエンド。端末ごとの在校状態を切り替え可能
- `src/demo/`: 説明用の操作パネル、通信ログ、公開 DB 表
- `src/app/AppContext.tsx`: 画面状態と在校確認後の演出
- `src/field/`: キャンパスの描画
- `docs/api-for-backend.md`: API の現行契約

`VITE_SHELL=app` はアプリのみ、既定の `explain` はスマホ枠とデモ・通信ログを表示します。本番は `/` が実データのアプリ、`/explain/` が実データの説明画面、`/test/` が模擬データです。公開 DB 表は全行を表示しますが、メール・Google ID・認証情報・MAC 原文・共有キーを除外します。

PWA はネットワーク優先で、`/api/` をキャッシュしません。カメラとサービスワーカーは HTTPS または localhost が必要です。

招待リンクには `openExternalBrowser=1` を付け、LINE から通常のブラウザで開きます。アプリ内ブラウザでは Google ログイン前に通常のブラウザで開く案内を表示します。画面復帰時と QR 表示中にはフレンド状態を裏で更新します。
