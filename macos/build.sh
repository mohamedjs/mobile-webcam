#!/usr/bin/env bash
# Builds the macOS app + camera extension.
#
#   ./build.sh          signed build (needs the Apple ID / team set up in Xcode)
#   ./build.sh nosign   compile-only, cannot be installed — for checking code
set -euo pipefail

cd "$(dirname "$0")"
export LANG=en_US.UTF-8

# The xcodeproj gem ships with CocoaPods; no separate gem install needed.
GEMS=$(ls -d /opt/homebrew/Cellar/cocoapods/*/libexec/gems | head -1)
RUBYLIB=$(ls -d "$GEMS"/xcodeproj-*/lib "$GEMS"/claide-*/lib "$GEMS"/colored2-*/lib \
                "$GEMS"/nanaimo-*/lib "$GEMS"/CFPropertyList-*/lib "$GEMS"/atomos-*/lib \
                "$GEMS"/activesupport-*/lib 2>/dev/null | tr '\n' ':')
RUBYLIB="$RUBYLIB" /usr/bin/ruby generate_project.rb

if [ "${1:-}" = "nosign" ]; then
  exec xcodebuild -project Webcamo.xcodeproj -scheme Webcamo -configuration Release \
    -derivedDataPath build \
    CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" build
fi

xcodebuild -project Webcamo.xcodeproj -scheme Webcamo -configuration Release \
  -derivedDataPath build -allowProvisioningUpdates build

echo
echo "Built: $(pwd)/build/Build/Products/Release/Webcamo.app"
echo "Install it, then run it from /Applications — macOS refuses to activate a"
echo "system extension from anywhere else:"
echo "  cp -R build/Build/Products/Release/Webcamo.app /Applications/"
echo "  open /Applications/Webcamo.app"
