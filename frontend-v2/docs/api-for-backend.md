# COKOYO（仮称）アプリ ⇄ バックエンド API

アプリの画面モック（`frontend-v2/`）が呼んでいるAPIの一覧です。
バックエンドをこの形で作れば、画面はそのまま繋がります。
形を変えたい場合は `src/api/client.ts` と `src/api/types.ts` だけ直せば済むようにしてあるので、相談してください。

2026-09-15 にグループで決めた仕様がもとになっています。

## 全体の形

```
アプリ ──→ アプリのバックエンド ──→ 大学側API「このMACアドレスは今いる？（いれば建物も）」
```

- MACアドレスを大学側APIに問い合わせるのは**バックエンドだけ**。アプリもフレンドも大学側APIを直接呼ばない
- ブロック・ベストフレンド・かくれんぼの振り分けは**バックエンドで行う**
- ポイントの計算と記録も**バックエンドで行う**
- ログインはなし。はじめての登録で**端末トークン**を発行し、以後はそれで本人を判断する

## 画面モックとの繋ぎ方

画面はReact（Vite + TypeScript）で、`frontend-v2/` にあります。

```bash
cd frontend-v2
npm install
npm run dev          # http://localhost:5173
```

1. 接続先を指定する（どちらか）
   - URLに付ける：`http://localhost:5173/?api=http://localhost:8080`
   - `.env.local` に `VITE_API_BASE_URL=http://localhost:8080` と書いて起動し直す
2. 画面右の「バックエンドとの通信」に、実際に送った内容と返ってきた内容が出る

ブラウザから呼ぶので、バックエンドは **CORS** を許可してください（`Authorization` と `Content-Type` ヘッダーを含む。開発中は `http://localhost:5173` から）。
接続先を指定しないときは、ブラウザの中の模擬バックエンド（`src/api/mockBackend.ts`）が動きます。模擬の中身は下の決まりどおりに実装してあるので、動きの参考になります。
リクエストとレスポンスの型は `src/api/types.ts` にあります。

## 共通

| 項目 | 内容 |
|---|---|
| パスの先頭 | `/v1` |
| 形式 | JSON（UTF-8） |
| 本人の判断 | `Authorization: Bearer <deviceToken>`。`POST /v1/users` 以外はすべて必要 |
| 日時 | ISO 8601（例：`2026-09-15T05:32:10.000Z`） |
| エラー | `{ "error": { "code": "mac_taken", "message": "このMACアドレスはすでに登録されています" } }` |

`message` はそのまま画面に表示します。ユーザーが読んで分かる日本語にしてください。

| ステータス | 使いどころ |
|---|---|
| 200 / 201 / 202 / 204 | 成功。202はフレンド申請を受け付けたとき、204は本文なし |
| 400 | 入力の形が正しくない |
| 401 | 端末トークンがない・無効。アプリは登録画面に戻る |
| 404 | 相手・申請などが見つからない |
| 409 | すでに登録済み・すでにフレンド・ブロック中など |

## 用語

| 用語 | 意味 |
|---|---|
| `deviceToken` | 端末トークン。登録時に1回だけ返す。**秘密**。アプリだけが持つ |
| `shareKey` | 共有キー。QRコードと招待リンクに入れる。フレンドに渡してよい値 |
| `userId` | ユーザーのID。フレンド一覧などで相手を指すのに使う |

`shareKey` は、MACアドレスから計算するのではなく**ランダムに作ってDBに保存する**ことをおすすめします。
MACアドレスのハッシュにすると、総当たりで元のMACアドレスに戻せてしまうためです。

---

## 登録・自分

### POST /v1/users — はじめての登録

トークン不要。

```json
// 送るもの
{ "displayName": "ゆうき", "mac": "a2:3f:9c:1b:7e:44" }
```

```json
// 201
{
  "userId": "u_k3m9x2pa",
  "displayName": "ゆうき",
  "shareKey": "sk_m8qe4tz2",
  "hidden": false,
  "macMasked": "a2:3f:••:••:••:44",
  "macRegisteredAt": "2026-09-15T05:32:10.000Z",
  "deviceToken": "dt_…"
}
```

- `mac` は小文字・`:` 区切りに直してから保存する（アプリ側でも直して送っている）
- MACアドレスそのものは返さない。表示用に `macMasked` を返す
- エラー：`400 invalid_name`（1〜20文字）、`400 invalid_mac`、`409 mac_taken`

### POST /v1/sessions — 登録済みのMACをこの端末に引き継ぐ

トークン不要。アプリを入れ直して端末トークンが消えたとき、同じMACでは `409 mac_taken` に
なって入れなくなるため、その退路。

```json
// 送るもの
{ "mac": "a2:3f:9c:1b:7e:44" }
```

200 で `POST /v1/users` と同じ形（`deviceToken` を含む）を返す。

- `userId` `shareKey` は変わらない。**フレンドに配り直す必要はない**
- 前の端末の `deviceToken` は無効になる
- MACの持ち主であることは確かめられないが、登録そのものも同じ（手入力なので他人のMACでも
  登録できる）。ここだけ厳しくしても意味がないので揃えてある
- エラー：`400 invalid_mac`、`404 mac_not_registered`

### GET /v1/me — 自分の情報

```json
// 200（POST /v1/users から deviceToken を除いた形）
{ "userId": "u_me", "displayName": "ゆうき", "shareKey": "sk_m8qe4tz2", "hidden": false,
  "macMasked": "a2:3f:••:••:••:44", "macRegisteredAt": "2026-09-03T00:00:00.000Z" }
```

### PATCH /v1/me — 表示名の変更・かくれんぼ

```json
// 送るもの（どちらか、または両方）
{ "displayName": "ゆうき" }
{ "hidden": true }
```

200で `GET /v1/me` と同じ形を返す。

### PUT /v1/me/mac — MACアドレスの登録し直し

機種変更などでMACアドレスが変わったとき。

```json
{ "mac": "5e:92:1a:0c:77:e5" }
```

200で `GET /v1/me` と同じ形を返す。エラーは `POST /v1/users` と同じ。

---

## 在校確認とポイント

### POST /v1/checks — 「ポイント獲得（在校確認）」ボタン

在校確認は**このボタンを押したときだけ**。本文なしで送る。

```json
// 200
{
  "checkedAt": "2026-09-15T05:32:10.000Z",
  "me": { "present": true, "building": "κ館", "hidden": false },
  "weather": { "condition": "rain", "rainy": true },
  "friends": [
    { "userId": "u_sato",   "present": true, "building": "κ館" },
    { "userId": "u_tanaka", "present": true },
    { "userId": "u_suzuki", "present": false }
  ],
  "points": {
    "awarded": [
      { "kind": "base",    "label": "来校ベース",              "pts": 20 },
      { "kind": "streak",  "label": "5日連続で来校",           "pts": 5,   "days": 5 },
      { "kind": "rain",    "label": "雨の日ボーナス",          "pts": 10 },
      { "kind": "match",   "label": "佐藤さんとマッチ",        "pts": 6,   "userId": "u_sato" },
      { "kind": "reunion", "label": "田中さんと45日ぶりにマッチ", "pts": 50,  "userId": "u_tanaka", "days": 45 }
    ],
    "notice": null,
    "date": "2026-09-15",
    "today": { "items": [ /* 今日これまでに入った分すべて（awardedと同じ形） */ ], "total": 91 },
    "total": 731
  }
}
```

**自分の在校（`me`）**
- 大学側APIに自分のMACアドレスを問い合わせる。`building` はキャンパスにいるときだけ
- かくれんぼ中でも、本人には本当のことを返す

**フレンドの在校（`friends`）**
- 自分がブロックした相手は含めない（ブロック中の一覧に出るため）
- 次のどれかに当てはまる相手は、`{ "present": false }` だけを返す。**理由は区別しない**
  - キャンパスのWiFiに繋がっていない
  - 相手がかくれんぼ中
  - 相手が自分をブロックしている
- `building` を付けるのは、**ベストフレンド同士**のときだけ
- 自分がキャンパス外でも、フレンドの在校は返す

**ポイント（`points`）**
- 自分がキャンパス外なら何も入れず、`notice` に「キャンパス外なので、ポイントは入りません」
- `awarded` はこの確認で入った分。0件でもよい（「今の分は獲得済み」）
- `label` はそのまま画面に出す

### GET /v1/points — 今日の獲得と累計

アプリを開いたときに使う。`POST /v1/checks` の `points` から `awarded` と `notice` を除いた形。

```json
{ "date": "2026-09-15", "today": { "items": [], "total": 0 }, "total": 640 }
```

### ポイントの決まり（10pt ＝ 1円）

| kind | 条件 | pt | 円 |
|---|---|---|---|
| `base` | その日はじめて、キャンパスにいる状態で押した | 20 | 2円 |
| `streak` | 平日の連続来校が 3日 / 7日 / 14日以上（土日では途切れない） | +5 / +10 / +20（一番高いもの1つ） | 0.5〜2円 |
| `rain` | その日はじめて押したとき、DTCの天気が雨（drizzle, rain, shower, thunderstorm, sleet, snow） | +10 | 1円 |
| `match` | キャンパスにいるフレンド（1人あたり） | 6 | 0.6円 |
| `reunion` | 最後にマッチしてから30日以上たったフレンド | 50 | 5円 |
| `first` | はじめてマッチしたフレンド | 70 | 7円 |

**目安**：普通の日（フレンド5人・雨でもはじめてでもない日）で 55〜70pt（5.5〜7円）。月16日通うと 880〜1,120pt ＝ **88〜112円**。

- `base` `streak` `rain` は1日1回。何度押しても、その日の2回目以降は入らない
- マッチ（`match` `reunion` `first`）は、**押した時点で在校が見えている**フレンドのうち、今日まだマッチしていない人だけ。1人につき3つのうち1つ
- マッチは1日10人まで。超えたら `notice` に「フレンドとのマッチポイントは1日10人までです」
- マッチポイントは**押した本人にだけ**入る。相手には、相手が押したときに自分が居れば入る
- **押した本人がかくれんぼ中**なら、`base` `streak` `rain` は入るが、マッチは入らない。`notice` に「かくれんぼ中は、フレンドとのマッチポイントは入りません」

---

## フレンド

### GET /v1/friends — フレンド・申請・ブロック中

```json
{
  "friends": [
    { "userId": "u_sato",   "displayName": "佐藤", "friendsSince": "2026-06-17T00:00:00.000Z", "best": "best" },
    { "userId": "u_tanaka", "displayName": "田中", "friendsSince": "2026-05-18T00:00:00.000Z", "best": "incoming" }
  ],
  "requests": {
    "incoming": [ { "requestId": "fr_1", "userId": "u_takahashi", "displayName": "高橋", "createdAt": "…" } ],
    "outgoing": []
  },
  "blocked": [ { "userId": "u_ito", "displayName": "伊藤", "blockedAt": "…" } ]
}
```

`best` は自分から見た状態：

| 値 | 意味 |
|---|---|
| `none` | ふつうのフレンド |
| `outgoing` | 自分がベストフレンドを申請中 |
| `incoming` | 相手からベストフレンドの申請が届いている |
| `best` | ベストフレンド同士 |

### POST /v1/friends — フレンドを追加

```json
{ "shareKey": "sk_y6hp3bnq", "via": "qr" }
```

| via | 送るもの | 動き | 返すもの |
|---|---|---|---|
| `qr` | `shareKey` | 直接会って読み取ったので、**すぐにフレンド** | `201 { "status": "friends", "user": { "userId", "displayName" } }` |
| `link` | `shareKey` | リンク・キー入力。**相手の承認が必要** | `202 { "status": "requested", "requestId", "user": {…} }` |
| `mac` | `mac` | 相手のMACアドレスを直接入力。**相手の承認が必要**（`link` と同じ扱い） | 同上 |

`via: "mac"` は、QRも共有キーも渡せないとき用の抜け道。デモに向けてMACアドレスだけを集めてしまった、
というような場合に使う。画面では「高度な設定」の中に畳んである。MACを渡した相手は、その端末が
キャンパスに居るかどうかを（アプリを通さずとも）調べられるようになるので、画面にもその注意を出している。

```json
{ "mac": "a2:3f:9c:1b:7e:44", "via": "mac" }
```

- `link` / `mac` で、相手からもこちらに申請が来ていた場合は、その場でフレンドにして201
- エラー：`404 share_key_not_found`、`404 mac_not_registered`、`400 self`（自分のキー・自分のMAC）、`400 invalid_mac`、`409 already_friends`、`409 blocked_by_you`（自分がブロック中）
- **相手に自分がブロックされている場合**は、ブロックされていることが分からないよう、ふつうの申請と同じ202を返す（申請は相手に届けない）

招待リンクの形は、今は `https://cokoyo.example/add/<shareKey>`（仮）。

### POST /v1/friend-requests/:requestId/accept — 申請を承認

200で `{ "status": "friends", "user": {…} }`。

### POST /v1/friend-requests/:requestId/decline — 申請を断る

204。相手には知らせない（相手の「承認待ち」に残り続けても、消してもよい。要相談）。

### POST /v1/friends/:userId/best — ベストフレンドを申請・承認

- 相手から申請が来ていれば、**承認**としてベストフレンドにする → `{ "userId", "best": "best" }`
- 来ていなければ**申請** → `{ "userId", "best": "outgoing" }`
- ブロックしている・されているときは `409 blocked`

### DELETE /v1/friends/:userId/best — ベストフレンドをやめる

次のどれでもこれを使う。**片方だけでできる**。返すのは `{ "userId", "best": "none" }`。
- 自分の申請を取り消す
- 届いた申請を断る
- ベストフレンドをやめる

### POST /v1/friends/:userId/block — ブロック

- フレンドからは**消さない**。自分の `friends` から外れ、`blocked` に入る
- ベストフレンドとその申請は解除する
- 相手には知らせない。相手からは、自分がずっと `present: false` に見える
- 返すもの：`{ "userId", "blocked": true }`

### DELETE /v1/friends/:userId/block — ブロック解除

元のフレンドに戻る（ベストフレンドは戻らない）。`{ "userId", "blocked": false }`。

---

## GET /v1/debug/db — DBの中身（説明用）

アプリ本体は使わない。`/explain` のページだけが叩く。PoC なので**端末トークンは要らず、
テーブルを丸ごと・全員ぶん**返す（説明のためのページで、登録していない人にも見せたいため）。

```json
{ "tables": [ { "name": "users", "note": "…", "columns": ["id", "…"], "rows": [[1, "u_…"]] } ] }
```

伏せるのは `mac` だけ（`a2:3f:••:••:••:44`）。この仕組みでは MAC が事実上のパスワードで、
`POST /v1/sessions` は MAC を知っていれば端末を乗り換えられる。誰でも読めるページに平文で並べると、
全員のアカウントを渡すのと同じになる。`device_token_hash` は sha256 の頭12文字だけ（平文は保存していない）。

`point_events` と `visits` は直近100件。

---

## 決まっていないこと（相談したい）

1. **他人になりすまして引き継げる**：`POST /v1/sessions` はMACを知っていれば通るので、他人のMACを入れればその人になれる。登録そのものが同じ弱さなので当面は揃えているが、本人確認の仕組みを入れるならここも一緒に直す
2. **他人のMACアドレスで登録される**：手入力なので防げない（暫定）。当面は仲間内の試用に限る
3. **大学側APIの利用キー**：誰でも大学側APIに問い合わせられると、MACアドレスを知っている人がブロックやかくれんぼを迂回できる。バックエンドだけが使える形にしたい
4. **問い合わせ回数**：同じ人がボタンを連打したときの制限（`429`）を入れるか
5. **大学側APIのデータの鮮度**：何分前の接続まで「いる」とみなすか
