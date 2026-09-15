# frontend-v2

COKOYO のアプリ画面（React + Vite + TypeScript）。

2026-09-15 にグループで決めた画面の仕様をもとにした**モック**で、バックエンドが未接続のときはブラウザの中の模擬バックエンドで一通り動く。
既存の `frontend/`（仮実装）とは別に置いてある。

## 動かす

```sh
cd frontend-v2
npm install
npm run dev          # http://localhost:5173
npm run build        # 型チェック → dist/
npm run typecheck
```

画面の右側に「デモ操作」（キャンパスの様子・天気・相手の操作を変える）と「バックエンドとの通信」（送った内容と返ってきた内容）が出る。

## 画面

| 画面 | 内容 |
|---|---|
| ホーム | キャンパスのフィールド（在校している自分とフレンドがスライムで出る。かくれんぼ中の自分はおばけ）、「ポイント獲得（在校確認）」ボタン、フレンドの在校、今日の獲得、かくれんぼ |
| フレンド | 追加（QRを見せる／読み取る・招待リンク）、届いた申請の承認、ベストフレンドの申請・承認・解除、ブロックと解除、かくれんぼ |
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

## 既存バックエンド（`backend/`・v1 PoC）との違い

**このままでは既存バックエンドに繋がらない。** 画面は `docs/api-for-backend.md` の形で呼んでいて、
`shared/api-types.ts` とはパスもデータの形も違う。繋ぐときは `src/api/client.ts` と `src/api/types.ts` を
`shared/api-types.ts` に合わせるか、足りない機能をバックエンドに足すかを決める。

| 画面がしていること | frontend-v2 が呼ぶもの | 既存バックエンド |
|---|---|---|
| 登録 | `POST /v1/users` `{ displayName, mac }` → `deviceToken`, `shareKey` | `POST /register` `{ mac, name }` → `secret`, `share_key` |
| 自分の情報・表示名・かくれんぼ | `GET /v1/me` / `PATCH /v1/me` | `GET /me`（share_key と connections のみ。かくれんぼは無い） |
| MACの登録し直し | `PUT /v1/me/mac` | 無い |
| フレンド追加 | `POST /v1/friends` `{ shareKey, via: "qr" \| "link" }`（リンクは相手の承認が必要） | `POST /connections` `{ share_key }`（承認なし） |
| フレンド一覧・申請・ブロック中 | `GET /v1/friends` | `GET /me` の connections |
| ベストフレンド | 申請→承認（`POST` / `DELETE /v1/friends/:userId/best`） | `PATCH /connections/:share_key` `{ scope }`（無向・承認なし） |
| ブロック | `POST` / `DELETE /v1/friends/:userId/block` | `PATCH /connections/:share_key` `{ blocked }` |
| 在校確認 | `POST /v1/checks`（自分とフレンドの在校＋ポイント計算） | `POST /presence` `{ share_keys }`（ポイントなし。`as_of`・`degraded` あり） |
| ポイント | `GET /v1/points` | 無い |
| 建物 | 表示名（`"κ館"`） | キー（`"kappa"`）。ラベルは `BUILDING_LABELS` |

既存バックエンドにあって画面が使っていないもの：`degraded`（「確認できませんでした」の表示）、`as_of`、共有文字列 `cokoyo1:<key>:<name>`。

本番はフロントとAPIが同一オリジンなので、繋ぐときは `VITE_API_BASE_URL` ではなく Vite の dev proxy（`/api`）に寄せるほうがリポジトリの方針に合う。
