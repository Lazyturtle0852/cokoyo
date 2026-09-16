# frontend-v2

COKOYO のアプリ画面（React + Vite + TypeScript）。

2026-09-15 にグループで決めた画面の仕様をもとにしたもの。本番（`cokoyo.lazyta-toru.net`）で動いているのはこれ。
バックエンドが未接続のときはブラウザの中の模擬バックエンドで一通り動く。既存の `frontend/`（仮実装）とは別に置いてある。

## 動かす

```sh
cd frontend-v2
npm install
npm run dev          # http://localhost:5173
npm run build        # 型チェック → dist/
npm run typecheck
```

開発中は説明用の外枠で出る。画面の右側に「デモ操作」（キャンパスの様子・天気・相手の操作を変える）、
「バックエンドとの通信」（送った内容と返ってきた内容）、「DBの中身」が並ぶ。本番の見た目は `?shell=app`。

## 画面

| 画面 | 内容 |
|---|---|
| ホーム | キャンパスのフィールド（在校している自分とフレンドがスライムで出る。かくれんぼ中の自分はおばけ）、「ポイント獲得（在校確認）」ボタン、フレンドの在校、今日の獲得、かくれんぼ |
| フレンド | 追加（QRを見せる／読み取る・招待リンク・MACアドレス直接入力）、届いた申請の承認、ベストフレンドの申請・承認・解除、ブロックと解除、かくれんぼ |
| 設定 | 表示名、MACアドレスの登録し直し |
| はじめての登録 | 表示名 → MACアドレス手入力（iPhone / Android の手順つき） |

在校確認はボタンを押したときだけ行う。獲得したポイントは右上の累計に「+100pt」の演出つきで足される。

## 構成

| ファイル | 中身 |
|---|---|
| `src/api/types.ts` | 画面が期待するAPIの型 |
| `src/api/client.ts` | APIの呼び出し（`api.*`）。模擬か本物かの切り替え、端末トークンの保存 |
| `src/api/mockBackend.ts` | 模擬バックエンド。ポイント計算・ブロック・ベストフレンドの振り分けの決まりが入っている |
| `src/app/AppContext.tsx` | アプリ全体の状態と操作（在校確認のあとの演出もここ） |
| `src/phone/` | スマホの各画面 |
| `src/field/campusField.ts` | フィールドとスライム。アニメーションを途切れさせないため React の外で DOM を直接動かしている |
| `src/demo/` | 右側のデモ操作と通信ログ。本番のアプリには要らない |
| `src/config.ts` | 接続先 |
| `docs/api-for-backend.md` | 画面が呼んでいるAPIの一覧と、ポイント・振り分けの決まり |

## 接続先

次の順で決まる。どれも無ければ模擬バックエンド。

1. URLの `?api=<URL>`（例 `http://localhost:5173/?api=http://localhost:8080`）
2. 環境変数 `VITE_API_BASE_URL`（`.env.local`）

## バックエンドとの契約

`src/api/types.ts` と `shared/app-types.ts` は**同じ形**になっている。ずれたら
`backend/test/contract.test-d.ts`（`cd backend && npm run typecheck`）が型エラーで落ちる。
エンドポイントの一覧と、ポイント・振り分けの決まりは `docs/api-for-backend.md`。

本番はフロントとAPIが同一オリジンなので CORS は要らない。開発中は Vite の dev proxy が同じ役割をする。

```sh
cd backend && npm run dev            # http://localhost:8080
cd frontend-v2 && npm run dev        # http://localhost:5173/?api=/api
```

## 外枠（`VITE_SHELL`）

同じソースから2つの見た目を作る。

| `VITE_SHELL` | 見た目 | 使う場所 |
|---|---|---|
| `app` | アプリだけ。スマホ枠・偽のステータスバー・説明は出さない | 本番（`/`） |
| `explain`（既定） | 左にスマホ枠、右に「デモ操作」「バックエンドとの通信」「DBの中身」 | `/explain`、`/test`、開発中 |

`?shell=app` を付ければ、ビルドし直さずに本番の見た目を確認できる。

「DBの中身」は `GET /v1/debug/db` を叩いて、SQLite の行をそのまま並べる。返るのは自分に関係する行だけで、
他人の行は `user_id` と表示名のみ、自分のMACも伏せてある。この通信は「バックエンドとの通信」には記録しない
（直前の操作の記録を汚さないため）。模擬バックエンドにはDBが無いので、`/test` では代わりに案内だけ出る。
