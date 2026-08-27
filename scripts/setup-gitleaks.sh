#!/usr/bin/env bash
# Tải gitleaks về .tools/ (không commit vào repo, mỗi dev tự chạy 1 lần).
set -euo pipefail

VERSION="8.30.1"
DEST_DIR=".tools"
mkdir -p "$DEST_DIR"

os="$(uname -s)"
case "$os" in
  MINGW*|MSYS*|CYGWIN*)
    url="https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/gitleaks_${VERSION}_windows_x64.zip"
    curl -sL -o "$DEST_DIR/gitleaks.zip" "$url"
    unzip -o "$DEST_DIR/gitleaks.zip" gitleaks.exe -d "$DEST_DIR"
    rm "$DEST_DIR/gitleaks.zip"
    ;;
  Darwin)
    url="https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/gitleaks_${VERSION}_darwin_x64.tar.gz"
    curl -sL "$url" | tar -xz -C "$DEST_DIR" gitleaks
    ;;
  Linux)
    url="https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/gitleaks_${VERSION}_linux_x64.tar.gz"
    curl -sL "$url" | tar -xz -C "$DEST_DIR" gitleaks
    ;;
  *)
    echo "OS không được hỗ trợ tự động: $os. Cài gitleaks thủ công: https://github.com/gitleaks/gitleaks#installing"
    exit 1
    ;;
esac

echo "✅ gitleaks đã cài ở $DEST_DIR/"
