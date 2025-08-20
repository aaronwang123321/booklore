#!/bin/bash

# BookLore Node.js 后端快速启动脚本

echo "🚀 启动 BookLore Node.js 后端..."

# 检查依赖
if [ ! -d "node_modules" ]; then
  echo "📦 安装依赖..."
  npm install
fi

# 生成 Prisma 客户端
echo "🔧 生成 Prisma 客户端..."
npx prisma generate

# 跳过类型检查启动开发服务器
echo "🏃 启动开发服务器（跳过类型检查）..."
export NODE_ENV=development
export SKIP_TYPE_CHECK=true
npm run start:dev -- --type-check=false
