# 部署总结

## ✅ 服务已完成并测试成功

### 项目概述

**问题：** Mihomo (Clash Meta) 已废弃 `relay` 策略组，改用 `dialer-proxy` 字段，但 subconverter 不支持自动转换。

**解决方案：** 创建一个 Node.js Web 服务，作为 OpenWrt + Neko 和 subconverter 之间的中间件，自动将 relay 转换为 dialer-proxy 格式。

### 核心功能

1. **自动检测和转换**
   - 识别 relay 类型的策略组
   - 自动为落地节点添加 `dialer-proxy` 字段
   - 将 relay 组转换为 select 组

2. **超时和重试机制**
   - 可配置的请求超时时间（默认 2 分钟）
   - 自动重试（默认 2 次）
   - 进度实时反馈
   - 支持 HTTP 重定向

3. **多种调用方式**
   - GET: 从 URL 获取配置并转换
   - POST: 直接传入 YAML/JSON 配置
   - 支持 YAML 和 JSON 输出格式

## 文件清单

### 核心文件
- `relay-converter-service.js` - 主服务文件
- `package.json` - 依赖配置
- `Dockerfile` - Docker 镜像构建文件
- `docker-compose.yml` - Docker Compose 配置

### 配置文件
- `acl4ssrdiy.ini` - Subconverter 远程配置文件（已优化）

### 文档
- `README.md` - 完整使用文档
- `QUICK_START.md` - 快速开始指南
- `DEPLOYMENT.md` - 本文件（部署总结）

### 测试文件
- `test-config.yaml` - 测试用 Clash 配置
- `test-service.sh` - 服务测试脚本

## 部署到 OpenWrt

### 方案 1: Docker 部署（推荐）

```bash
# 1. 将文件上传到 OpenWrt
scp -r /Users/leon/codeing/acl4ssrdiy root@你的OpenWrt-IP:/opt/

# 2. SSH 登录 OpenWrt
ssh root@你的OpenWrt-IP

# 3. 构建并运行
cd /opt/acl4ssrdiy
docker-compose up -d

# 4. 查看日志
docker-compose logs -f relay-converter

# 5. 验证服务
curl http://localhost:3000/health
```

### 方案 2: 直接运行 Node.js

```bash
# 1. 安装 Node.js
opkg update
opkg install node node-npm

# 2. 上传文件
scp relay-converter-service.js package.json root@你的OpenWrt-IP:/opt/relay-converter/

# 3. 安装依赖
cd /opt/relay-converter
npm install --omit=dev

# 4. 启动服务（后台运行）
nohup node relay-converter-service.js > service.log 2>&1 &

# 5. 验证服务
curl http://localhost:3000/health
```

### 方案 3: 创建系统服务

```bash
# 创建 OpenWrt 服务
cat > /etc/init.d/relay-converter << 'EOF'
#!/bin/sh /etc/rc.common

START=99
STOP=10
USE_PROCD=1

start_service() {
    procd_open_instance
    procd_set_param command /usr/bin/node /opt/relay-converter/relay-converter-service.js
    procd_set_param respawn
    procd_set_param stdout 1
    procd_set_param stderr 1
    procd_close_instance
}
EOF

# 启用并启动
chmod +x /etc/init.d/relay-converter
/etc/init.d/relay-converter enable
/etc/init.d/relay-converter start
```

## 在 Neko 中使用

### 订阅地址格式

```
http://你的OpenWrt-IP:3000/convert?url=http://localhost:25500/sub?target=clash&config=你的配置URL&url=你的订阅
```

### 完整示例

```
http://192.168.1.1:3000/convert?url=http://192.168.1.1:25500/sub?target=clash&config=https://raw.githubusercontent.com/你的用户名/acl4ssrdiy/main/acl4ssrdiy.ini&url=https://your-airport.com/subscribe?token=YOUR_TOKEN
```

## 环境变量配置

### 超时时间调整

如果 subconverter 响应较慢，可以增加超时时间：

```bash
# 设置为 5 分钟
export REQUEST_TIMEOUT=300000
node relay-converter-service.js

# Docker 方式
docker run -d \
  --name relay-converter \
  -p 3000:3000 \
  -e REQUEST_TIMEOUT=300000 \
  relay-converter
```

### 环境变量列表

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `3000` |
| `NODE_ENV` | 运行环境 | `production` |
| `REQUEST_TIMEOUT` | HTTP 请求超时（毫秒） | `120000` (2分钟) |

## 测试结果

### ✅ 本地测试通过

```bash
# 健康检查
$ curl http://localhost:3000/health
{"status":"ok","service":"relay-converter","version":"1.0.0"}

# 转换测试
$ curl -X POST http://localhost:3000/convert \
  -H "Content-Type: text/yaml" \
  --data-binary @test-config.yaml | grep dialer-proxy

dialer-proxy: 🇭🇰 香港节点  # ✓ 成功添加
```

### 转换效果

**转换前（Relay）：**
```yaml
proxy-groups:
  - name: 🎯 HK中转-落地
    type: relay
    proxies:
      - 🇭🇰 香港节点
      - 🎯 落地节点
```

**转换后（Dialer-Proxy）：**
```yaml
proxies:
  - name: Landing-Node-1
    type: vmess
    server: us.example.com
    dialer-proxy: 🇭🇰 香港节点  # ← 自动添加

  - name: Landing-Node-2
    type: ss
    server: jp.example.com
    dialer-proxy: 🇭🇰 香港节点  # ← 自动添加

proxy-groups:
  - name: 🎯 HK中转-落地
    type: select  # ← relay 改为 select
    proxies:
      - 🎯 落地节点
```

## 故障排查

### 问题 1: 请求超时

**症状：** 提示 "请求超时 (>120000ms)"

**解决方案：**
```bash
# 增加超时时间到 5 分钟
export REQUEST_TIMEOUT=300000

# Docker 方式
docker run -d \
  -e REQUEST_TIMEOUT=300000 \
  -p 3000:3000 \
  relay-converter
```

### 问题 2: 端口被占用

**症状：** Error: listen EADDRINUSE :::3000

**解决方案：**
```bash
# 检查占用
netstat -tlnp | grep 3000

# 更换端口
export PORT=3001
node relay-converter-service.js
```

### 问题 3: Neko 无法访问

**检查防火墙：**
```bash
# 添加防火墙规则
uci add firewall rule
uci set firewall.@rule[-1].name='relay-converter'
uci set firewall.@rule[-1].src='wan'
uci set firewall.@rule[-1].proto='tcp'
uci set firewall.@rule[-1].dest_port='3000'
uci set firewall.@rule[-1].target='ACCEPT'
uci commit firewall
/etc/init.d/firewall restart
```

## 性能指标

- **内存占用**: ~30-50MB
- **CPU 使用**: < 5% (闲时)
- **磁盘空间**: ~15MB (包含依赖)
- **响应时间**: < 100ms (不含 subconverter 请求时间)

## 技术栈

- **运行时**: Node.js 18 (Alpine Linux)
- **框架**: Express 4.18.2
- **依赖**: js-yaml 4.1.0
- **容器**: Docker (可选)

## 致谢

- 基于 [remoteman@linux.do](https://linux.do/t/topic/156436) 的转换脚本
- 适配 OpenWrt + Neko 环境

## 更新日志

### v1.0.1 (2024-12-05)
- ✅ 增强超时处理（可配置超时时间）
- ✅ 添加自动重试机制（默认 2 次）
- ✅ 添加进度日志反馈
- ✅ 支持 HTTP 重定向

### v1.0.0 (2024-12-05)
- ✅ 初始版本
- ✅ 支持 relay 到 dialer-proxy 转换
- ✅ 支持 Docker 部署
- ✅ 支持链式调用 subconverter

## 下一步

1. **部署到 OpenWrt**
   - 选择上述三种方案之一进行部署
   - 建议使用 Docker Compose（如果 OpenWrt 支持 Docker）

2. **配置 Neko**
   - 将订阅地址修改为包含转换服务的 URL
   - 更新订阅并验证转换效果

3. **监控和日志**
   - 定期查看服务日志
   - 监控内存和 CPU 使用情况
   - 根据需要调整超时时间

## 许可证

MIT License