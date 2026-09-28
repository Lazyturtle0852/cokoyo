# Google ログインと複数 MAC 化

## Goal and completion criteria

1 アカウントを Keio Google Workspace の 1 ID に結び付け、最大 5 個の MAC を管理する。初回登録には 1 個必要。本人のいずれかの MAC が在校なら在校とし、DTC 判定不能は本人に不明と示し、ポイントを付けない。既存の交友・ポイントは移さず、新規 DB で開始する。ブランチで実装し、全画面差分のスクリーンショットを添えて PR を作る。

## Progress

- 2026-09-28: `feat/google-login-multi-mac` 作成。スキーマ、OIDC、Cookie セッション、API、画面、模擬バックエンド、主要テストを実装。
- 2026-09-28: main の追加 UI（写真アイコン、SNS 共有）を統合し、古い MAC 引き継ぎ仕様のみ置き換えた。API 46 件、フロント・バックエンドのビルド、Docker ビルド、実コンテナの health/401/公開 DB、Compose 構文を確認。
- 2026-09-28: Playwright でログイン・初回登録・MAC 管理・在校・フレンド追加・説明画面の 22 状態を撮影し目視確認。
- 残り: PR 作成と画像添付。Google Cloud の実クライアントでのログインと本番切替は、資格情報を用意した後に運用者が実施する。

## Surprises & discoveries

- `gh` 認証済みユーザー `inaridiy` の upstream `Lazyturtle0852/cokoyo` 権限は READ。ユーザーは upstream ブランチを希望。ローカル作業を完成させ、push が拒否された場合は権限付与が必要。
- 既存 `/explain/` は公開で全行表示。仕様上維持するが、メール・Google ID・認証情報・MAC 原文・共有キーは返さない。

## Decision log

- `google_sub` を永続キーにし、`hd=keio.jp` と検証済みの厳密な `@keio.jp` メールを要求。MAC は本人申告。
- 旧 v1 DB は自動変換せず、`api-data-v2` ボリュームへ新規作成。旧ボリュームを保持し、ロールバック可能にする。
- セッションは 14 日の HttpOnly/SameSite=Lax/Secure Cookie。変更要求の Origin を検証する。

## Work sequence and validation

- `cd backend && npm test && npm run build`
- `cd frontend-v2 && npm run build`
- ローカル `/test/` 模擬バックエンドの画面を Playwright で巡回し、差分の各状態を撮影・確認。
- 本番切替は PR の外。`deploy/cutover-v2.md` に事前条件、実施、確認、復旧を記載。

## Recovery

旧コンテナと旧 DB ボリュームは切替で削除しない。旧リビジョンと compose 定義に戻して旧ボリュームを再接続する。v2 で作成した新規データは v1 へ移せないため、復旧時の利用者への案内が必要。

## Outcomes & retrospective

実装とローカル検証は完了。旧データを別ボリュームに保持する切替手順は `deploy/cutover-v2.md`。実 Google ログインはクライアント ID・シークレットがこの作業環境にないため未実施。
