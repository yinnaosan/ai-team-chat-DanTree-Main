#!/bin/sh
# setup-tencent-news.sh
# 在新沙箱/新环境中安装腾讯新闻 CLI 到 server/bin/
# 用法: sh server/bin/setup-tencent-news.sh
#
# 说明:
#   tencent-news-cli 是 8MB 静态二进制，不进 git。
#   此脚本负责从腾讯官方安装源下载并放置到正确路径。
#   安装完成后，dataLayerFetchers.ts 使用 server/bin/tencent-news-cli 调用。

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLI_PATH="$SCRIPT_DIR/tencent-news-cli"

echo "[setup-tencent-news] 目标路径: $CLI_PATH"

if [ -f "$CLI_PATH" ] && "$CLI_PATH" help >/dev/null 2>&1; then
  echo "[setup-tencent-news] ✅ CLI 已存在且可用，跳过安装"
  exit 0
fi

echo "[setup-tencent-news] 正在安装腾讯新闻 CLI..."

# 通过官方安装脚本安装到临时目录，然后复制到 server/bin/
TEMP_DIR="$(mktemp -d)"
cd "$TEMP_DIR"

# 下载安装脚本并执行（官方安装路径）
curl -fsSL https://mat1.gtimg.com/qqcdn/qqnews/cli/hub/tencent-news/setup.sh | sh

# 找到安装后的 CLI 路径
INSTALLED_CLI="$(command -v tencent-news-cli 2>/dev/null || find "$TEMP_DIR" -name "tencent-news-cli" -type f 2>/dev/null | head -1)"

if [ -z "$INSTALLED_CLI" ]; then
  # 尝试从 skill 目录复制（如果存在）
  SKILL_CLI="/home/ubuntu/upload/tencent-news/tencent-news/tencent-news-cli"
  if [ -f "$SKILL_CLI" ]; then
    echo "[setup-tencent-news] 从 skill 目录复制..."
    cp "$SKILL_CLI" "$CLI_PATH"
  else
    echo "[setup-tencent-news] ❌ 安装失败：无法找到 CLI 二进制"
    exit 1
  fi
else
  cp "$INSTALLED_CLI" "$CLI_PATH"
fi

chmod +x "$CLI_PATH"
rm -rf "$TEMP_DIR"

# 配置 API Key（从环境变量读取）
if [ -n "$TENCENT_NEWS_API_KEY" ]; then
  "$CLI_PATH" apikey-set "$TENCENT_NEWS_API_KEY"
  echo "[setup-tencent-news] ✅ API Key 已配置（来自 TENCENT_NEWS_API_KEY）"
elif [ -n "$TENCENT_NEWS_APIKEY" ]; then
  "$CLI_PATH" apikey-set "$TENCENT_NEWS_APIKEY"
  echo "[setup-tencent-news] ✅ API Key 已配置（来自 TENCENT_NEWS_APIKEY）"
else
  echo "[setup-tencent-news] ⚠️  未找到 TENCENT_NEWS_API_KEY 环境变量，请手动运行："
  echo "    $CLI_PATH apikey-set <YOUR_KEY>"
fi

echo "[setup-tencent-news] ✅ 安装完成: $CLI_PATH"
"$CLI_PATH" version 2>&1 || true
