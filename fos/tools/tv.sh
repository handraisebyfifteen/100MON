#!/usr/bin/env bash
# Fire TV（Fire OS）にアプリを入れて開く（ビルド → adb でつなぐ → 入れる → 開く を1回で）。
#   TV=192.168.1.23 npm run tv          ふだんはこれ（TV は Fire TV の IP アドレス。一度つながれば次からは省ける）
#   npm run tv -- --no-build            ビルド済みのものをそのまま入れ直す
#   npm run tv -- --clean               android/ の生成物を消してから作り直す（音や画像を変えたのに反映されないとき）
# Fire TV 側は「設定 → My Fire TV → 開発者オプション → ADB デバッグ」をオンにしておく。
# Metro（開発サーバー）は使わず、JS を中に入れた release ビルドを入れる（Vega 版の npm run sim と同じ考え方）。
set -eo pipefail
cd "$(dirname "$0")/.."

# Android のビルドに使う JDK と SDK。React Native は JDK 17 でコンパイルする決まり（無いと Gradle が自動取得を試みて失敗する）。
# brew install openjdk@17 で入る。別の場所に入れてあれば JAVA_HOME で指定する
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
if [ ! -x "$JAVA_HOME/bin/java" ]; then
  echo "JDK 17 が見つかりません（$JAVA_HOME）。brew install openjdk@17 を実行してください" >&2
  exit 1
fi
ADB="$ANDROID_HOME/platform-tools/adb"
if [ ! -x "$ADB" ]; then
  echo "adb が見つかりません（$ADB）。Android Studio で SDK を入れてください" >&2
  exit 1
fi

APP_ID="com.byfifteen.hyakumon"
ACTIVITY="com.hyakumon.MainActivity"
APK="android/app/build/outputs/apk/release/app-release.apk"

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

echo "[1/4] Fire TV につなぐ"
if [ -n "$TV" ]; then
  "$ADB" connect "$TV:5555" >/dev/null || true
fi
SERIAL="$("$ADB" devices | awk 'NR>1 && $2=="device" && $1 !~ /^emulator-/ {print $1; exit}')"
if [ -z "$SERIAL" ]; then
  echo "Fire TV が見つかりません。TV=<IPアドレス> を付けて実行するか、Fire TV の ADB デバッグをオンにしてください" >&2
  "$ADB" devices >&2
  exit 1
fi
echo "      $SERIAL"

echo "[2/4] ビルド"
if [ "$build" -eq 1 ]; then
  node tools/sync-assets.mjs
  if [ "$clean" -eq 1 ]; then rm -rf android/app/build android/build android/.gradle; fi
  (cd android && ./gradlew --quiet assembleRelease)
else
  echo "      省きます（--no-build）"
fi
if [ ! -f "$APK" ]; then
  echo "$APK がありません。--no-build を付けずにもう一度実行してください" >&2
  exit 1
fi

echo "[3/4] 入れる"
"$ADB" -s "$SERIAL" install -r "$APK"

echo "[4/4] 開く"
"$ADB" -s "$SERIAL" shell am start -n "$APP_ID/$ACTIVITY" >/dev/null
echo "Fire TV にアプリが出ます。ログを見るときは： $ADB -s $SERIAL logcat -s ReactNativeJS"
