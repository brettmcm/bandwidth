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
ICON_SOURCE="$PACKAGE_ROOT/Resources/kairos-icon.icon"
ICON_NAME="${ICON_SOURCE:t:r}"

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

/bin/rm -rf "$APP_DIR"
/bin/mkdir -p "$CONTENTS/MacOS" "$RESOURCES"
/usr/bin/ditto "$BIN_PATH/Bandwidth" "$CONTENTS/MacOS/Bandwidth"
/usr/bin/ditto "$PACKAGE_ROOT/Info.plist" "$CONTENTS/Info.plist"
/usr/bin/plutil -replace BandwidthDefaultProjectDir -string "$PROJECT_ROOT" "$CONTENTS/Info.plist"

/usr/bin/xcrun actool "$ICON_SOURCE" \
  --compile "$RESOURCES" \
  --platform macosx \
  --minimum-deployment-target 13.0 \
  --target-device mac \
  --app-icon "$ICON_NAME" \
  --output-format human-readable-text \
  --notices \
  --warnings
/usr/bin/codesign --force --deep --sign - "$APP_DIR"

echo "$APP_DIR"
