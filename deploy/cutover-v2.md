# v2 本番切替手順

v2 は Google ログインを必須とし、旧アカウント・交友・ポイントは引き継がない。初回アクセスでは各利用者が `keio.jp` でログインし、MAC を 1 個登録する。MAC の所有は本人申告で、最大 5 個まで。

## 事前準備

1. Google Cloud の自分たちのプロジェクトで OAuth 同意画面と Web クライアントを作る。承認済みリダイレクト URI は `https://cokoyo.lazyta-toru.net/api/v1/auth/google/callback`。同意画面の対象利用者と公開状態を `keio.jp` の利用者が使える状態にする。`hd` はアカウント選択のヒントであり、サーバーは ID トークンの `hd` と検証済みメールを別途検証する。
2. VPS の `/opt/cokoyo/backend/.env.production` を管理者だけが読める権限で配置する。`backend/.env.example` を参考に `APP_ORIGIN=https://cokoyo.lazyta-toru.net`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`DB_PATH=/data/cokoyo.db`、`MOCK_DTC=0` を設定する。秘密は Git に登録しない。
3. 旧 DB を退避する。旧 compose のボリューム名を `docker volume ls` で確認し、サービス停止後、ボリュームを読み取り専用でマウントして tar 保存する。旧ボリュームは削除しない。
4. PR マージ後も自動 deploy は `COKOYO_V2_CUTOVER_DONE` が `true` になるまで停止する。VPS で `git pull --ff-only` して新しい `deploy/update.sh` を取得し、`bash deploy/update.sh` を実行する。v2 は新しい `cokoyo_api-data-v2` ボリュームを使う。

## 切替確認

- `/`、`/explain/`、`/test/`、`/api/health` が 200、未ログインの `/api/v1/auth/session` が 401。
- 実際の `keio.jp` Google アカウントで通常のブラウザからログインし、初回登録、2 台目の追加、在校確認、ログアウト、再ログインで同じデータを確認する。Google の写真があるアカウントでは初期アイコンと手動変更・削除後の保持を確認する。LINE などのアプリ内ブラウザでは通常のブラウザへの案内を確認する。`@gmail.com` は登録できないことを確認する。
- `/explain/` の DB 表にメール、Google ID、セッション、OAuth state、MAC 原文、共有キーが出ないことを確認する。
- 確認後 GitHub Actions 変数 `COKOYO_V2_CUTOVER_DONE=true` を設定し、以後の main push 自動 deploy を再開する。

## ロールバック

切替前のコミットを VPS で checkout し、旧 compose 定義の API サービスを起動して、旧ボリュームに戻す。旧 DB とそのバックアップは v2 切替で変更されない。v2 で登録されたアカウント・ポイントは旧版には現れないので、復旧告知と再切替の判断が必要。`docker compose down --volumes` は実行しない。
