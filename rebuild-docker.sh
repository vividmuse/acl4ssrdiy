#!/bin/bash

# 强制重新构建 relay-converter 容器
# 确保包含最新的 public 目录

echo "🛑 停止并删除旧容器..."
docker stop relay-converter 2>/dev/null || true
docker rm relay-converter 2>/dev/null || true

echo ""
echo "🗑️  删除旧镜像..."
docker rmi acl4ssrdiy-relay-converter 2>/dev/null || true

echo ""
echo "🔨 强制重新构建镜像（不使用缓存）..."
docker build --no-cache -t relay-converter .

echo ""
echo "🚀 启动新容器..."
docker run -d \
  --name relay-converter \
  --restart unless-stopped \
  --network acl4ssrdiy_proxy-network \
  -p 3000:3000 \
  relay-converter

echo ""
echo "⏳ 等待服务启动..."
sleep 3

echo ""
echo "🔍 验证容器内文件..."
docker exec relay-converter ls -la /app/public/

echo ""
echo "✅ 测试服务..."
curl -s http://localhost:3000/health | jq . 2>/dev/null || curl -s http://localhost:3000/health

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 重建完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📱 访问 Web 界面："
echo "   http://localhost:3000/"
echo ""
echo "📋 查看日志："
echo "   docker logs -f relay-converter"
echo ""