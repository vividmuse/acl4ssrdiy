#!/bin/bash

# Relay Converter Docker 更新脚本
# 用途：快速更新 Docker 容器到最新版本

set -e  # 遇到错误立即退出

echo "╔════════════════════════════════════════════════════════════╗"
echo "║       Relay Converter Docker 更新脚本 v1.0.2              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# 检查是否有 Docker
if ! command -v docker &> /dev/null; then
    echo "❌ 错误: Docker 未安装"
    exit 1
fi

# 容器名称
CONTAINER_NAME="relay-converter"
IMAGE_NAME="relay-converter"
VERSION_TAG="v1.0.2"

echo "📦 步骤 1/5: 停止旧容器..."
if docker ps -a | grep -q $CONTAINER_NAME; then
    docker stop $CONTAINER_NAME 2>/dev/null || true
    docker rm $CONTAINER_NAME 2>/dev/null || true
    echo "✅ 旧容器已停止并删除"
else
    echo "ℹ️  没有发现旧容器"
fi

echo ""
echo "🔨 步骤 2/5: 构建新镜像..."
docker build --no-cache -t $IMAGE_NAME:$VERSION_TAG .
docker tag $IMAGE_NAME:$VERSION_TAG $IMAGE_NAME:latest
echo "✅ 镜像构建完成"

echo ""
echo "🚀 步骤 3/5: 启动新容器..."
docker run -d \
  --name $CONTAINER_NAME \
  --restart unless-stopped \
  -p 3000:3000 \
  -e REQUEST_TIMEOUT=120000 \
  $IMAGE_NAME:latest

echo "✅ 容器已启动"

echo ""
echo "⏳ 步骤 4/5: 等待服务启动..."
sleep 5

echo ""
echo "🔍 步骤 5/5: 验证服务..."
if curl -s http://localhost:3000/health | grep -q "ok"; then
    echo "✅ 服务运行正常！"
    echo ""
    echo "📊 服务信息："
    curl -s http://localhost:3000/health | jq . 2>/dev/null || curl -s http://localhost:3000/health
else
    echo "❌ 服务健康检查失败！"
    echo ""
    echo "📋 容器日志："
    docker logs --tail 20 $CONTAINER_NAME
    exit 1
fi

echo ""
echo "🧹 清理旧镜像..."
docker image prune -f > /dev/null 2>&1
echo "✅ 清理完成"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  ✅ 更新成功！                                             ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  服务地址: http://localhost:3000                          ║"
echo "║  健康检查: http://localhost:3000/health                   ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  查看日志: docker logs -f $CONTAINER_NAME"
echo "║  停止服务: docker stop $CONTAINER_NAME"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 最近日志："
docker logs --tail 10 $CONTAINER_NAME