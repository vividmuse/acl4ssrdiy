# Docker 容器更新指南

## 方法 1: 使用 Docker Compose 更新（推荐）

如果你使用的是 `docker-compose.yml` 部署：

```bash
# 1. 停止并删除旧容器
docker-compose down

# 2. 重新构建镜像（使用最新代码）
docker-compose build --no-cache

# 3. 启动新容器
docker-compose up -d

# 4. 查看日志确认运行正常
docker-compose logs -f relay-converter
```

**一行命令快速更新：**
```bash
docker-compose down && docker-compose build --no-cache && docker-compose up -d
```

## 方法 2: 直接使用 Docker 命令更新

如果你使用的是单独的 `docker run` 命令：

```bash
# 1. 停止并删除旧容器
docker stop relay-converter
docker rm relay-converter

# 2. 删除旧镜像（可选，节省空间）
docker rmi relay-converter

# 3. 重新构建镜像
docker build -t relay-converter .

# 4. 启动新容器
docker run -d \
  --name relay-converter \
  --restart unless-stopped \
  -p 3000:3000 \
  relay-converter

# 5. 查看日志
docker logs -f relay-converter
```

## 方法 3: 在 OpenWrt 上更新

### 如果使用 Docker Compose：

```bash
# SSH 登录到 OpenWrt
ssh root@你的OpenWrt-IP

# 进入项目目录
cd /opt/relay-converter

# 更新代码文件（从本地上传新版本）
# 在本地执行：
scp relay-converter-service.js root@你的OpenWrt-IP:/opt/relay-converter/

# 然后在 OpenWrt 上执行更新
docker-compose down && docker-compose build --no-cache && docker-compose up -d
```

### 如果使用 Docker 命令：

```bash
# SSH 登录到 OpenWrt
ssh root@你的OpenWrt-IP

# 进入项目目录
cd /opt/relay-converter

# 停止旧容器
docker stop relay-converter
docker rm relay-converter

# 上传新代码（在本地执行）
scp relay-converter-service.js root@你的OpenWrt-IP:/opt/relay-converter/

# 重新构建镜像
docker build -t relay-converter .

# 启动新容器
docker run -d \
  --name relay-converter \
  --restart unless-stopped \
  -p 3000:3000 \
  relay-converter
```

## 方法 4: 不停机热更新（高级）

如果你不想中断服务：

```bash
# 1. 构建新镜像（使用新标签）
docker build -t relay-converter:v1.0.2 .

# 2. 启动新容器（使用不同端口）
docker run -d \
  --name relay-converter-new \
  -p 3001:3000 \
  relay-converter:v1.0.2

# 3. 测试新容器
curl http://localhost:3001/health

# 4. 如果测试通过，切换端口
docker stop relay-converter
docker rm relay-converter

docker run -d \
  --name relay-converter \
  --restart unless-stopped \
  -p 3000:3000 \
  relay-converter:v1.0.2

# 5. 删除临时容器
docker stop relay-converter-new
docker rm relay-converter-new
```

## 验证更新

更新完成后，验证服务是否正常：

```bash
# 1. 检查容器状态
docker ps | grep relay-converter

# 2. 健康检查
curl http://localhost:3000/health

# 3. 测试 URL 解析（使用新的解析逻辑）
curl "http://localhost:3000/convert?url=http://example.com/sub?target=clash&url=test&config=test&format=json"

# 4. 查看日志
docker logs relay-converter
```

**期望输出：**
```json
{
  "status": "ok",
  "service": "relay-converter",
  "version": "1.0.0"
}
```

## 清理旧镜像（可选）

更新后清理不再使用的镜像，节省磁盘空间：

```bash
# 查看所有镜像
docker images

# 删除悬空镜像（dangling images）
docker image prune -f

# 或删除所有未使用的镜像
docker image prune -a
```

## 如果出现问题

### 问题 1: 构建失败

```bash
# 清理 Docker 缓存后重试
docker builder prune -a
docker build --no-cache -t relay-converter .
```

### 问题 2: 端口被占用

```bash
# 检查端口占用
netstat -tlnp | grep 3000

# 或使用其他端口
docker run -d \
  --name relay-converter \
  -p 3001:3000 \
  relay-converter
```

### 问题 3: 容器无法删除

```bash
# 强制删除
docker rm -f relay-converter

# 或先停止再删除
docker stop relay-converter && docker rm relay-converter
```

## 回滚到旧版本

如果新版本有问题，可以回滚：

```bash
# 1. 停止并删除新容器
docker stop relay-converter
docker rm relay-converter

# 2. 如果保留了旧镜像
docker run -d \
  --name relay-converter \
  --restart unless-stopped \
  -p 3000:3000 \
  relay-converter:old

# 3. 如果没有保留，使用旧代码重新构建
# 先恢复旧代码文件，然后
docker build -t relay-converter .
docker run -d --name relay-converter -p 3000:3000 relay-converter
```

## 版本管理建议

为了更好地管理版本，建议：

```bash
# 构建时打标签
docker build -t relay-converter:v1.0.2 .
docker tag relay-converter:v1.0.2 relay-converter:latest

# 运行时指定版本
docker run -d \
  --name relay-converter \
  -p 3000:3000 \
  relay-converter:v1.0.2

# 保留多个版本
docker images relay-converter
```

## 自动化更新脚本

创建一个自动化更新脚本 `update.sh`：

```bash
#!/bin/bash

echo "开始更新 relay-converter..."

# 停止旧容器
docker stop relay-converter 2>/dev/null
docker rm relay-converter 2>/dev/null

# 构建新镜像
docker build -t relay-converter:latest .

# 启动新容器
docker run -d \
  --name relay-converter \
  --restart unless-stopped \
  -p 3000:3000 \
  relay-converter:latest

# 验证
sleep 3
if curl -s http://localhost:3000/health | grep -q "ok"; then
    echo "✅ 更新成功！服务运行正常"
    docker logs --tail 10 relay-converter
else
    echo "❌ 更新失败！请检查日志"
    docker logs relay-converter
    exit 1
fi

# 清理旧镜像
docker image prune -f

echo "更新完成！"
```

使用方法：
```bash
chmod +x update.sh
./update.sh
```

## 注意事项

1. **备份重要数据**：虽然这个服务是无状态的，但更新前建议备份配置
2. **测试环境**：如果可能，先在测试环境验证
3. **查看日志**：更新后务必查看日志确认无错误
4. **版本标记**：建议为每个版本打标签，方便回滚

## 快速参考

| 操作 | 命令 |
|------|------|
| 停止容器 | `docker stop relay-converter` |
| 删除容器 | `docker rm relay-converter` |
| 重新构建 | `docker build -t relay-converter .` |
| 启动容器 | `docker run -d --name relay-converter -p 3000:3000 relay-converter` |
| 查看日志 | `docker logs -f relay-converter` |
| 健康检查 | `curl http://localhost:3000/health` |
| 清理镜像 | `docker image prune -f` |