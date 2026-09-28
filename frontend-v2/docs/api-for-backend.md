# COKOYO API 契約

アプリは同一オリジンの `/api/v1/*` に JSON でアクセスする。型の正本は `shared/app-types.ts` と `frontend-v2/src/api/types.ts`。認証済み API は HttpOnly セッション Cookie を使い、変更要求は `Origin` が `APP_ORIGIN` と一致する必要がある。エラーは `{ "error": { "code": "...", "message": "..." } }`。

## 認証と初回登録

| メソッド・パス | 内容 |
|---|---|
| `GET /auth/google` | Google OIDC にリダイレクト。任意の `?add=<shareKey>` を callback 後まで保存 |
| `GET /auth/google/callback` | code/state/nonce/PKCE を検証し、`keio.jp` の ID に限ってセッション発行 |
| `GET /auth/session` | `{email, displayName, status: "onboarding"\|"ready"}`。未ログインは 401。初回登録前の `displayName` は Google 名（取得できなければ空文字） |
| `POST /auth/logout` | 現在のセッションを失効。204 |
| `POST /auth/logout-all` | 当該アカウントの全セッションを失効。204 |
| `POST /onboarding` | `{displayName, mac, label}`。初回のみ。最初の MAC を必須として `Me` を 201 で返す |

`google_sub` がアカウントの永続キー。メールだけでは所有を判断しない。OAuth トークンは保存しない。`keio.jp` 以外、未検証メール、ホストドメイン不一致は拒否する。

## 自分と MAC

| メソッド・パス | 内容 |
|---|---|
| `GET /me` | `{userId, displayName, email, shareKey, hidden, macs}` |
| `PATCH /me` | `{displayName?, hidden?}`。更新した `Me` を返す |
| `PUT /me/avatar` | `{image}`。縮小済み JPEG・PNG・WebP の data URL を登録し、更新した `Me` を返す |
| `DELETE /me/avatar` | 画像を削除し、更新した `Me` を返す |
| `GET /me/macs` | `{macs, limit: 5}` |
| `POST /me/macs` | `{mac, label}`。201 と登録端末 |
| `PATCH /me/macs/:id` | `{mac?, label?}`。MAC を省略すると名前だけ変更 |
| `DELETE /me/macs/:id` | 204。最後の 1 台は削除不可 |

MAC は 12 桁の 16 進数または `:` / `-` 区切り。アカウント間で一意。返すのは `id`、`label`、`macMasked`、`registeredAt` で原文は返さない。上限は 5 台。MAC の所有は本人申告。
`Me` とフレンドなどの `UserRef` には、登録済みの場合 `avatar` が付く。Google の写真を取得できたときは初期値にする。利用者が画像を変更・削除した後は、再ログインしても Google の写真で上書きしない。画像の data URL は 120KB 以下。公開 DB 表には画像の原文を出さず、大きさだけを表示する。

## 在校・交友

| メソッド・パス | 内容 |
|---|---|
| `POST /checks` | 登録 MAC を確認し、在校・天気・フレンド・今回のポイント・リアクションを返す |
| `GET /points` | 今日と累計のポイント |
| `GET /friends` | フレンド、申請、ブロックの一覧 |
| `POST /friends` | `{shareKey, via: "qr"\|"link"}`。QR は即時成立、リンクは申請。MAC 検索は不可 |
| `POST /friend-requests/:requestId/accept` / `decline` | 申請の承認・拒否 |
| `POST` / `DELETE /friends/:userId/best` | ベストフレンド申請・解除 |
| `POST` / `DELETE /friends/:userId/block` | ブロック・解除 |
| `POST /friends/:userId/reactions` | `{count}`。スライムへのリアクション |
| `GET /debug/db` | `/explain/` 用の公開全行表示。秘密列は除外またはマスク |

`checks.me.presence` は `present` / `absent` / `unknown`。1 台でも在校なら `present`。建物が食い違う、または別の MAC が判定不能なら建物は返さない。在校が確定しない `unknown` では本人にポイントを付けない。フレンドの不明、かくれんぼ、ブロックは理由を示さず `present:false`。建物は相互ベストフレンドにだけ返す。

## ご意見・問い合わせ

| メソッド・パス | 内容 |
|---|---|
| `POST /feedback` | `{message}`（2〜1000文字）。201 と `{remaining}`（その日あと何件送れるか） |

1日5件まで（超えると `429 too_many`）。`feedback` テーブルに貯めるだけで、自動では誰にも届きません。
本文が誰にでも読めてしまうため、公開の `GET /debug/db` には出しません。読み方は `backend/README.md`。

