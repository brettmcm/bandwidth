#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIR:h}"
PACKAGE_ROOT="$PROJECT_ROOT/native/Bandwidth"
BUILD_ROOT="$PROJECT_ROOT/build/BandwidthMac"
SWIFT_BUILD="$BUILD_ROOT/swift"
APP_DIR="$PROJECT_ROOT/dist/Bandwidth.app"
CONTENTS="$APP_DIR/Contents"
RESOURCES="$CONTENTS/Resources"
ICONSET="$BUILD_ROOT/Bandwidth.iconset"
BASE_ICON="$BUILD_ROOT/Bandwidth-1024.png"

export CLANG_MODULE_CACHE_PATH="$BUILD_ROOT/clang-module-cache"
export SWIFT_MODULECACHE_PATH="$BUILD_ROOT/swift-module-cache"

/usr/bin/swift build \
  --configuration release \
  --package-path "$PACKAGE_ROOT" \
  --scratch-path "$SWIFT_BUILD"

BIN_PATH=$(/usr/bin/swift build \
  --configuration release \
  --package-path "$PACKAGE_ROOT" \
  --scratch-path "$SWIFT_BUILD" \
  --show-bin-path)

/bin/rm -rf "$APP_DIR" "$ICONSET"
/bin/mkdir -p "$CONTENTS/MacOS" "$RESOURCES" "$ICONSET"
/usr/bin/ditto "$BIN_PATH/Bandwidth" "$CONTENTS/MacOS/Bandwidth"
/usr/bin/ditto "$PACKAGE_ROOT/Info.plist" "$CONTENTS/Info.plist"
/usr/bin/plutil -replace BandwidthDefaultProjectDir -string "$PROJECT_ROOT" "$CONTENTS/Info.plist"

/usr/bin/swift "$PROJECT_ROOT/scripts/render-bandwidth-icon.swift" "$BASE_ICON"

for spec in \
  "16 icon_16x16.png" \
  "32 icon_16x16@2x.png" \
  "32 icon_32x32.png" \
  "64 icon_32x32@2x.png" \
  "128 icon_128x128.png" \
  "256 icon_128x128@2x.png" \
  "256 icon_256x256.png" \
  "512 icon_256x256@2x.png" \
  "512 icon_512x512.png" \
  "1024 icon_512x512@2x.png"
do
  pixels="${spec%% *}"
  filename="${spec#* }"
  /usr/bin/sips -z "$pixels" "$pixels" "$BASE_ICON" --out "$ICONSET/$filename" >/dev/null
done

/usr/bin/iconutil -c icns "$ICONSET" -o "$RESOURCES/Bandwidth.icns"
/usr/bin/codesign --force --deep --sign - "$APP_DIR"

echo "$APP_DIR"
