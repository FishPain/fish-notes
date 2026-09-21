#!/usr/bin/env bash
# Render build/icon.svg → macOS .icns (+ a 1024 png) using native tools only
# (rsvg-convert + iconutil). Re-run after editing icon.svg: npm run icon
set -euo pipefail
cd "$(dirname "$0")/.."

SVG=build/icon.svg
SET=build/icon.iconset
rm -rf "$SET"; mkdir -p "$SET"

render() { rsvg-convert -w "$1" -h "$1" "$SVG" -o "$SET/$2"; }
render 16   icon_16x16.png
render 32   icon_16x16@2x.png
render 32   icon_32x32.png
render 64   icon_32x32@2x.png
render 128  icon_128x128.png
render 256  icon_128x128@2x.png
render 256  icon_256x256.png
render 512  icon_256x256@2x.png
render 512  icon_512x512.png
render 1024 icon_512x512@2x.png

iconutil -c icns "$SET" -o build/icon.icns
rsvg-convert -w 1024 -h 1024 "$SVG" -o build/icon.png
rm -rf "$SET"
echo "wrote build/icon.icns and build/icon.png"
