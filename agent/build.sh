#!/bin/sh
# Build pkgscan cho các nền tảng. Kết quả nằm trong agent/dist/
set -eu
cd "$(dirname "$0")"
VERSION="${VERSION:-0.1.0}"
mkdir -p dist
for t in windows/amd64 darwin/arm64 darwin/amd64 linux/amd64; do
  os="${t%/*}"; arch="${t#*/}"; ext=""
  [ "$os" = windows ] && ext=".exe"
  out="dist/pkgscan-$os-$arch$ext"
  CGO_ENABLED=0 GOOS="$os" GOARCH="$arch" go build -trimpath -ldflags "-s -w -X main.version=$VERSION" -o "$out" .
  echo "built $out"
done
[ -f dist/config.json ] || cp config.example.json dist/config.json
