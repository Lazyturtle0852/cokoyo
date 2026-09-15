#!/usr/bin/env bash
# 本番(VPS)を最新にする。/opt/cokoyo/deploy/update.sh で実行する。
#
# フロントのビルドはコンテナの中でやるので、ホストに Node を入れる必要はない。
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$PWD"

echo "==> git pull"
git pull

echo "==> frontend-v2 をビルド"
docker run --rm \
  -v "$REPO/frontend-v2:/app" -w /app \
  -e VITE_SHARE_LINK_BASE="https://cokoyo.lazyta-toru.net/add/" \
  node:24-alpine sh -c 'npm ci --no-audit --no-fund && npm run build'

echo "==> バックエンド"
docker compose -f deploy/docker-compose.yml up -d --build

echo "==> Apache"
# vhost は sites-available に置いたものが使われ、その中身は
# deploy/apache/cokoyo-common.conf を Include している。
# 共通部分は git pull で更新されるので、reload だけで反映される。
cp deploy/apache/cokoyo.lazyta-toru.net.conf deploy/apache/cokoyo.lazyta-toru.net-le-ssl.conf /etc/apache2/sites-available/
apache2ctl configtest
systemctl reload apache2

echo
echo "==> 確認"
curl -s -o /dev/null -w "/            %{http_code}\n" https://cokoyo.lazyta-toru.net/
curl -s -o /dev/null -w "/legacy/     %{http_code}\n" https://cokoyo.lazyta-toru.net/legacy/
curl -s -o /dev/null -w "/documents/  %{http_code}\n" https://cokoyo.lazyta-toru.net/documents/
curl -s https://cokoyo.lazyta-toru.net/api/v1/health; echo
