#!/usr/bin/env bash
# 安裝 KTX-Software（toktx）到 ~/.local/opt/ktx，不需 sudo。自動判斷 arm64 / x86_64，核對官方 SHA1。
set -euo pipefail
V=4.4.2; ARCH=$(uname -m); case "$ARCH" in aarch64|arm64) A=arm64;; x86_64) A=x86_64;; *) echo "不支援的架構 $ARCH"; exit 1;; esac
F=KTX-Software-$V-Linux-$A.tar.bz2; U=https://github.com/KhronosGroup/KTX-Software/releases/download/v$V/$F
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT; cd "$T"
curl -sSfLO "$U"; curl -sSfLO "$U.sha1"; echo "$(awk '{print $1}' "$F.sha1")  $F" | sha1sum -c -
mkdir -p ~/.local/opt/ktx; tar -xjf "$F" -C ~/.local/opt/ktx --strip-components=1
LD_LIBRARY_PATH=~/.local/opt/ktx/lib ~/.local/opt/ktx/bin/toktx --version
