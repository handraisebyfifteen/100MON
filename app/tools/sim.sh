#!/usr/bin/env bash
# シミュレータでアプリを動かす（起動 → ビルド → 入れる → 開く を1回で）。
#   npm run sim                  ふだんはこれだけ
#   npm run sim -- --no-build    ビルド済みのものをそのまま入れ直す（コードを変えていないとき）
#   npm run sim -- --clean       build/ を消してから作り直す（音や画像を変えたのに反映されないとき）
# 別のシミュレータに入れるときは DEVICE=emulator-5556 npm run sim のように指定する。
set -eo pipefail
cd "$(dirname "$0")/.."

# vega コマンドが通っていない端末のために、SDK の環境設定を読む
if ! command -v vega >/dev/null 2>&1 && [ -f "$HOME/vega/env" ]; then
  # shellcheck disable=SC1091
  source "$HOME/vega/env"
fi
if ! command -v vega >/dev/null 2>&1; then
  echo "vega コマンドが見つかりません。Vega SDK を入れてください（vega-port.md の付録）" >&2
  exit 1
fi

DEVICE="${DEVICE:-emulator-5554}"
APP_ID="com.byfifteen.qthehundred.main"
VPKG="build/x86_64-release/qthehundred_x86_64.vpkg"

build=1
clean=0
for arg in "$@"; do
  case "$arg" in
    --no-build) build=0 ;;
    --clean) clean=1 ;;
    *)
      echo "知らない指定です：${arg}（使えるのは --no-build と --clean）" >&2
      exit 1
      ;;
  esac
done

echo "[1/4] シミュレータを確かめる"
if vega virtual-device status 2>/dev/null | grep -q '"running":true'; then
  echo "      起動済み"
else
  echo "      起動します（1〜3分かかります。ウィンドウが開きます）"
  vega virtual-device start --timeout 180
fi

echo "[2/4] ビルド"
if [ "$build" -eq 1 ]; then
  if [ "$clean" -eq 1 ]; then rm -rf build; fi
  npm run build:release
else
  echo "      省きます（--no-build）"
fi
if [ ! -f "$VPKG" ]; then
  echo "$VPKG がありません。--no-build を付けずにもう一度実行してください" >&2
  exit 1
fi

# vda install は、起動し直した直後に "abb_exec ... closed" で入らないことがある。vega device install-app は入る
echo "[3/4] 入れる"
vega device install-app -d "$DEVICE" -p "$VPKG"

echo "[4/4] 開く"
vega device launch-app -d "$DEVICE" -a "$APP_ID"
echo "シミュレータにアプリが出ます。リモコンのボタンをクリックして操作してください"
