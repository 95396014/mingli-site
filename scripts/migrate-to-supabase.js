#!/bin/bash
# ================================================================
# 数据库迁移脚本：从 Railway PostgreSQL 导出到 Supabase PostgreSQL
#
# 用法：
#   1. 先安装 pg_dump 工具（本地有 PostgreSQL 客户端即可）
#   2. 在 Railway 后台找到 PostgreSQL 连接串（Variables → DATABASE_URL）
#   3. 在 Supabase 后台创建项目，找到 Connection String
#   4. 运行本脚本：
#      bash scripts/migrate-to-supabase.sh
#
# 或者手动一行命令（推荐）：
#   pg_dump "RAILWAY连接串" --data-only | psql "SUPABASE连接串"
# ================================================================

set -e

echo "=== 数据库迁移：Railway → Supabase ==="
echo ""

# 提示输入连接串（不回显到历史记录）
read -p "Railway DATABASE_URL: " RAILWAY_URL
read -p "Supabase DATABASE_URL: " SUPABASE_URL

if [ -z "$RAILWAY_URL" ] || [ -z "$SUPABASE_URL" ]; then
  echo "错误：两个连接串都必须填写"
  exit 1
fi

echo ""
echo "1/3 导出 Railway 数据..."
pg_dump "$RAILWAY_URL" \
  --data-only \
  --no-owner \
  --no-privileges \
  --inserts \
  > /tmp/mingli_dump.sql

echo "   导出完成: $(wc -l < /tmp/mingli_dump.sql) 行 SQL"

echo ""
echo "2/3 导入到 Supabase..."
psql "$SUPABASE_URL" -f /tmp/mingli_dump.sql

echo ""
echo "3/3 清理临时文件..."
rm -f /tmp/mingli_dump.sql

echo ""
echo "=== 迁移完成！ ==="
echo "现在可以在 Supabase Dashboard → Table Editor 查看数据"
