#!/usr/bin/env bash
# 本番(VPS)を最新にする。/opt/cokoyo/deploy/update.sh で実行する。
#
# フロントのビルドはコンテナの中でやるので、ホストに Node を入れる必要はない。
# 同じソースから3つ作る:
#   dist          … 実データ + アプリだけ     → /        で配る（本番）
#   dist-explain  … 実データ + 説明つき       → /explain で配る（中身の解説）
#   dist-test     … 模擬データ + 説明つき     → /test    で配る（触って試す用）
#
# 全体を main() に入れてあるのは、途中の git pull がこのファイル自身を
# 書き換えるため。bash はスクリプトを読みながら実行するので、素で書くと
# pull 後にズレた位置から読み直して、途中の行を飛ばしたまま走る。
# 関数なら呼ぶ前に全体を読み終えているので、その事故が起きない。
set -euo pipefail

main() {
  cd "$(dirname "$0")/.."
  local repo="$PWD"

  echo "==> git pull"
  git pull

  echo "==> frontend-v2 をビルド（本番 / explain / test）"
  docker run --rm \
    -v "$repo/frontend-v2:/app" -w /app \
    node:24-alpine sh -c '
      set -e
      npm ci --no-audit --no-fund
      VITE_API_BASE_URL=/api VITE_SHELL=app npm run build
      VITE_API_BASE_URL=/api npm run build -- --outDir dist-explain
      npm run build -- --outDir dist-test
    '
  # 3つとも出来ているか。片方だけ古いまま気づかない、を防ぐ。
  for d in dist dist-explain dist-test; do
    test -f "frontend-v2/$d/index.html" || { echo "frontend-v2/$d が作られていない"; exit 1; }
  done

  echo "==> バックエンド"
  docker compose -f deploy/docker-compose.yml up -d --build

  echo "==> Apache"
  # vhost は sites-available のものが使われ、その中身は
  # deploy/apache/cokoyo-common.conf を Include している。
  # 共通部分は git pull で更新されるので、reload だけで反映される。
  cp deploy/apache/cokoyo.lazyta-toru.net.conf deploy/apache/cokoyo.lazyta-toru.net-le-ssl.conf /etc/apache2/sites-available/
  apache2ctl configtest
  systemctl reload apache2

  echo
  echo "==> 確認"
  local b=https://cokoyo.lazyta-toru.net
  curl -s -o /dev/null -w "/            %{http_code}\n" $b/
  curl -s -o /dev/null -w "/explain/    %{http_code}\n" $b/explain/
  curl -s -o /dev/null -w "/test/       %{http_code}\n" $b/test/
  curl -s -o /dev/null -w "/documents/  %{http_code}\n" $b/documents/
  curl -s $b/api/health; echo
}

main "$@"
