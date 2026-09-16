#!/usr/bin/env bash
# 本番(VPS)を最新にする。/opt/cokoyo/deploy/update.sh で実行する。
#
# フロントのビルドはコンテナの中でやるので、ホストに Node を入れる必要はない。
# 同じソースから3つ作る:
#   dist          … 実データ + アプリだけ     → /        で配る（本番）
#   dist-explain  … 実データ + 説明つき       → /explain で配る（中身の解説）
#   dist-test     … 模擬データ + 説明つき     → /test    で配る（触って試す用）
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$PWD"

echo "==> git pull"
git pull

echo "==> frontend-v2 をビルド（本番 / explain / test）"
docker run --rm \
  -v "$REPO/frontend-v2:/app" -w /app \
  -e VITE_SHARE_LINK_BASE="https://cokoyo.lazyta-toru.net/add/" \
  node:24-alpine sh -c '
    set -e
    npm ci --no-audit --no-fund
    VITE_API_BASE_URL=/api VITE_SHELL=app npm run build
    VITE_API_BASE_URL=/api npm run build -- --outDir dist-explain
    npm run build -- --outDir dist-test
  '

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
B=https://cokoyo.lazyta-toru.net
curl -s -o /dev/null -w "/            %{http_code}\n" $B/
curl -s -o /dev/null -w "/explain/    %{http_code}\n" $B/explain/
curl -s -o /dev/null -w "/test/       %{http_code}\n" $B/test/
curl -s -o /dev/null -w "/documents/  %{http_code}\n" $B/documents/
curl -s $B/api/health; echo
