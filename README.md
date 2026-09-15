# COKOYO

フレンドが今キャンパスにいるかを知れるアプリ。フレンドと同じ日にキャンパスにいるとポイントが貯まり、
将来は学食やキッチンカーの割引に使う想定。

現在は **フロント・バックエンド・DTC API の3層** で動く（v1 PoC）。当初の「アプリ側のサーバーは持たず、
スマホアプリと大学側のAPIだけで動く」という前提は、相手ごとの scope / block を成立させるために取り下げた。
経緯は `docs/v1-poc.html` の 00 を参照。

仮名なので変更可。

## 設計の中心（v2 で目指す形）

大学側にAPIを用意してもらえた場合の最終形。**v1 PoC では未実装**で、代わりにバックエンドが
key を人に解決してから MAC に変換している。

MACアドレスは誰にも渡さず、API側がフレンド1人ごとに別々の「通行証」を発行する。
通行証はMACの別名ではなく**ただの番号**で、意味を持つのは大学APIの台帳の中だけ。

| | 内容 |
|---|---|
| 1人だけ解除 | その人の通行証だけ無効にする |
| 見せる範囲 | フレンドは「キャンパスにいるか」、ベストフレンドは「どの建物にいるか」 |
| かくれんぼ | 本人がAPIに設定すると、全員に「いない」と返る（アプリを経由しない直接アクセスにも効く） |
| 漏洩時 | 通行証1枚分。無効化すれば止まる |
| 大学が知らないこと | 誰と誰がフレンドか |

確認はフレンドがアプリを開いたときに行うので、本人のスマホでアプリが動いている必要はない。

## ドキュメント

| ファイル | 中身 |
|---|---|
| `docs/index.html` | 入口ページ（GitHub Pages のトップ） |
| `docs/architecture.html` | 層構成、MACの到達範囲、通行証とMACの関係、シーケンス図5本 |
| `docs/api-draft.html` | 大学側にお願いするAPIのたたき台（8エンドポイント・通行証方式） |
| `docs/mac-v1.html` | **v1仕様。CNS限定・MAC方式・通行証なし（4エンドポイント）** |
| `docs/v1-poc.html` | **v1 PoC仕様。3層構成・MAC手入力・key方式（5エンドポイント）** |

公開版: https://lazyturtle0852.github.io/cokoyo/

ローカルではブラウザで直接開く。

```sh
open docs/architecture.html
```

## 共有用PNGの書き出し

Slack などに貼る用。全体版と、カードの途中で切れない位置で分割した版を `share/` に作る。

```sh
tools/render.sh
```

`share/` は再生成できるので git には入れていない。

## 構成

| ディレクトリ | 中身 |
|---|---|
| `docs/` | 設計・仕様（HTML） |
| `shared/api-types.ts` | フロント／バックが共有する API の型 |
| `backend/` | Hono + SQLite。scope と block を判定して DTC API を叩く（詳細は `backend/README.md`） |
| `frontend/` | **仮**。動作確認用。同僚のビルド成果物に差し替える |
| `deploy/` | Caddyfile と docker-compose |
| `tools/` | 共有用PNGの書き出し |

本番は `cokoyo.lazyta-toru.net` の1オリジンで、Caddy が振り分ける。

| パス | 行き先 |
|---|---|
| `/api/*` | バックエンド |
| `/documents/*` | `docs/`（GitHub Pages からの引っ越し先） |
| `/*` | フロント |

フロントとAPIが同一オリジンなので **CORS は不要**。開発時は Vite の dev proxy が同じ役割を果たす。

```ts
// vite.config.ts
server: { proxy: { "/api": { target: "https://cokoyo.lazyta-toru.net", changeOrigin: true } } }
```

## 状態

- **v1 PoC のバックエンドは実装済み**（5エンドポイント・テスト19件）。**実データで往復確認済み**
- DTC API (`api.dtc.wide.ad.jp`) の `/wifi/*` は有効。既知のMACは建物まで返る
- ただし**観測が無いMACは 404 ではなく恒久的に 503** を返す。`present:false` + `degraded` で吸収しているが、
  sfc-icar に報告したほうがよい挙動（詳細は `backend/README.md`）
- フロントは同僚が React + Vite で製作中。`frontend/` は差し替え前提の仮実装
- 通行証方式（1人1本のkey）は v2。バックエンドを置いたことで、v1 でも scope と block は相手ごとに効く

## 大学と決めたい点

1. **`WIFI_RANDOM_ID_SECRET` の有効化。** これが無いと実データに繋がらない
2. **アカウント方式の可否。** DTC のデータ源は SNMP ポーリングなのでアカウントは取れない。
   RADIUS を繋いでもらう話になるため重い。取れれば MAC の登録・検証・ローテーション対応が丸ごと不要になる
3. **鮮度とレート制限。** `as_of` の粒度と、問い合わせ上限
