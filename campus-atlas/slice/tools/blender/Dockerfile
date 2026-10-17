# 無頭 Blender（aarch64）：Blender 官方沒有 Linux arm64 版，改用 Ubuntu 24.04 套件庫的 arm64 編譯（4.0.2）。
# 建置：docker build -t campus-blender:4.0 tools/blender
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends blender python3-numpy && rm -rf /var/lib/apt/lists/*
WORKDIR /work
ENTRYPOINT ["blender", "-b", "--factory-startup"]
