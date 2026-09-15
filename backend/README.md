# cokoyo-backend

`frontend-v2/docs/api-for-backend.md` の契約（2026-09-15 にグループで決めた仕様）の実装。

アプリと大学側API（DTC）の間に立つ層。**MACを大学側APIに問い合わせるのはここだけ**で、
アプリにもフレンドにもMACは渡さない。ブロック・かくれんぼ・ベストフレンドの振り分けと、
ポイントの計算もここで行う。

## 動かす

```sh
npm install
npm run dev          # http://localhost:8080
npm test             # 23件 + 契約の型一致
npm run typecheck
```

DBは `DB_PATH` の SQLite ファイル1つ。起動時にテーブルを作るのでマイグレーションの手順はない。
`node:sqlite`（Node 24 標準）を使うのでネイティブビルドは発生しない。**Node 24 以上が必須。**

## 形

| | |
|---|---|
| パス | `/api` + `/v1/...`（フロントの `apiBaseUrl` が `/api`） |
| 本人の判断 | `Authorization: Bearer <deviceToken>`。`POST /v1/users` 以外は必須 |
| エラー | `{ "error": { "code", "message" } }`。`message` はそのまま画面に出る |

契約の型は `shared/app-types.ts`。`frontend-v2/src/api/types.ts` と食い違うと
`tsconfig.contract.json` の型チェックが落ちるので、どちらかを直したらもう片方も直すこと。

## 秘密の扱い

- `deviceToken` は平文で保存せず sha256 で持つ。128bit乱数なのでストレッチングは不要
- `shareKey` `userId` はMACから導出しない。導出するとMACの空間が狭いぶん総当たりで逆算できる
- MACはアプリにも返さない。表示用の `macMasked`（`a2:b4:••:••:••:03`）だけ返す
- ログにMACを出さない

## 見せない情報の設計

「WiFiに繋がっていない」「かくれんぼ中」「相手が自分をブロックしている」は、
**すべて同じ `present: false`** で返し、理由を区別しない。
隠れている相手・ブロックしている相手のMACは、そもそもDTCに問い合わせない。

打ち切った相手が速く返ることで理由を悟られないよう、`TIMING_FLOOR_MS` で
`POST /v1/checks` の応答時間に下限を敷いている。

## DTC API について

`https://api.dtc.wide.ad.jp` の `GET /wifi/clients/{mac}/connection` と `GET /weather`。認証は無い。

- **書式** — コロン区切りしか受け付けない。DBには区切りなし12桁で持ち、送信直前だけ整形する
- **404** — 観測が無いMAC。`present: false` に潰す
- **503** — SNMP の取り込み中。400ms・800ms と二度粘る

**履歴は絶対に取りに行かない。** 時間範囲を渡すと最大7日分が返るうえ認証が無いので、
中継すると移動の軌跡がそのまま漏れる。常に最新1件だけを取る。

### 観測が無いMACは 404 ではなく 503 が返る

実測したところ、観測が一度も無いMACは**恒久的に 503** を返す。DTC 側は
「未パースのスナップショットが存在するか」で 503 を判定しており、観測が無いMACでは
その比較対象が無いため、古い未パースが1件でも残っている限り 503 のままになる。

そのため 404 だけを当てにできない。リトライしても 503 のままなら「いない」として扱う。
**sfc-icar に報告する価値がある挙動。**

## ポイント

`frontend-v2/docs/api-for-backend.md` の表のとおり。実装は `src/points.ts`。

| kind | 条件 | pt |
|---|---|---|
| `base` | その日はじめて、キャンパスにいる状態で押した | 250 |
| `streak` | 平日の連続来校が 3 / 7 / 14日以上（土日では途切れない） | +50 / +125 / +250 |
| `rain` | その日はじめて押したとき、DTCの天気が雨 | +125 |
| `match` / `reunion` / `first` | 在校が見えているフレンド1人につき1つ。1日10人まで | 100 / 500 / 750 |

かくれんぼ中の本人には `base` `streak` `rain` は入るが、マッチは入らない。

## デプロイ

`api` は `127.0.0.1:8090` にだけ開く。外から届く経路は手前の Apache だけ。

```sh
/opt/cokoyo/deploy/update.sh
```

`git pull` → フロントを2種類ビルド → API 再ビルド → Apache 反映 → 疎通確認まで通しで行う。

| ホストの状態 | 手前 |
|---|---|
| **既に Apache / nginx が居る**（本番はこちら） | `deploy/apache/` |
| 80/443 が空いている | `docker compose --profile caddy up -d` |
