#!/usr/bin/env bash
# docs/*.html を共有用 PNG に書き出す。
# 全体版と、カードの途中で切れないよう余白位置で分割した版を share/ に作る。
set -euo pipefail

cd "$(dirname "$0")/.."

CHROME="${CHROME_PATH:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
WIDTH=1180
SCALE=2

mkdir -p share

render() {
  local html="$1" name="$2"
  # 1回目は余白込みの高い窓で撮り、実際の content 高さを測ってから撮り直す
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --window-size="${WIDTH},9000" --force-device-scale-factor=1 \
    --screenshot="share/.probe.png" "file://$PWD/$html" 2>/dev/null

  local h
  h=$(python3 - <<'PY'
from PIL import Image
import numpy as np
im = Image.open('share/.probe.png').convert('RGB')
a = np.asarray(im); bg = a[5, 5]
blank = np.all(np.all(np.abs(a.astype(int) - bg.astype(int)) < 6, axis=2), axis=1)
print(int(np.max(np.where(~blank)[0])) + 40)
PY
)
  rm -f share/.probe.png

  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --window-size="${WIDTH},${h}" --force-device-scale-factor="$SCALE" \
    --screenshot="share/cokoyo-${name}.png" "file://$PWD/$html" 2>/dev/null

  python3 tools/split.py "share/cokoyo-${name}.png" "$3"
}

rm -f share/*.png
render docs/architecture.html architecture arch
render docs/api-draft.html api-draft api
render docs/mac-v1.html mac-v1 macv1
render docs/v1-poc.html v1-poc v1poc

ls -la share/
