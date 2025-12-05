# Relay to Dialer-Proxy 转换服务

将 subconverter 生成的包含 relay 的 Clash 配置自动转换为 dialer-proxy 格式，适用于 OpenWrt + Neko 等不支持预处理脚本的环境。

## 功能特点

- ✅ 自动检测并转换 relay 策略组为 dialer-proxy
- ✅ 支持链式调用 subconverter
- ✅ 支持 Docker 部署
- ✅ 轻量级，基于 Node.js + Express
- ✅ 兼容 mihomo/Clash Meta

## 快速开始

### 方法 1: Docker Compose（推荐）

```bash
# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f relay-converter
```

服务启动后：
- Subconverter: http://localhost:25500
- Relay Converter: http://localhost:3000

### 方法 2: Docker 单独部署

```bash
# 构建镜像
docker build -t relay-converter .

# 运行容器
docker run -d \
  --name relay-converter \
  -p 3000:3000 \
  relay-converter
```

### 方法 3: Node.js 直接运行

```bash
# 安装依赖
npm install

# 启动服务
npm start

# 或开发模式（自动重启）
npm run dev
```

## 使用方式

### 在 OpenWrt Neko 中使用

在 Neko 的订阅设置中，将订阅地址修改为：

```
http://你的服务器IP:3000/convert?url=http://localhost:25500/sub?target=clash&config=acl4ssrdiy.ini&url=你的原始订阅
```

**完整示例：**

```
http://192.168.1.1:3000/convert?url=http://192.168.1.1:25500/sub?target=clash&config=https://raw.githubusercontent.com/你的用户名/你的仓库/main/acl4ssrdiy.ini&url=https://your-airport-subscription-url
```

### API 使用方式

#### 1. 从 URL 获取配置并转换（GET）

```bash
curl "http://localhost:3000/convert?url=http://subconverter:25500/sub?target=clash&url=YOUR_SUBSCRIPTION"
```

#### 2. 直接传入配置文本（POST JSON）

```bash
curl -X POST http://localhost:3000/convert \
  -H "Content-Type: application/json" \
  -d '{
    "config": "proxies:\n  - name: test\n    type: vmess\n..."
  }'
```

#### 3. 直接传入 YAML 文本（POST）

```bash
curl -X POST http://localhost:3000/convert \
  -H "Content-Type: text/yaml" \
  --data-binary @config.yaml
```

#### 4. 获取 JSON 格式输出

```bash
curl "http://localhost:3000/convert?url=...&format=json"
```

### 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `url` | subconverter 的完整 URL（**必须是第一个参数**） | - |
| `format` | 输出格式：`yaml` 或 `json` | `yaml` |

**重要说明：**
- `url` 参数必须是查询字符串中的第一个参数
- `url` 参数的值会自动提取直到 `&format=` 或字符串结束
- 支持嵌套的 URL 参数（如 subconverter 的 `?target=clash&url=...&config=...`）
- 订阅地址中的特殊字符需要进行 URL 编码

**正确示例：**
```
✓ http://10.0.0.16:3000/convert?url=http://10.0.1.16:25500/sub?target=clash&url=...&config=...
✓ http://10.0.0.16:3000/convert?url=http://10.0.1.16:25500/sub?target=clash&url=...&format=yaml
```

**错误示例：**
```
✗ http://10.0.0.16:3000/convert?format=yaml&url=...  (url 不是第一个参数)
```

## 部署到 OpenWrt

### 方案 A: Docker 部署（推荐）

如果你的 OpenWrt 安装了 Docker：

```bash
# 在 OpenWrt 上创建目录
mkdir -p /opt/relay-converter
cd /opt/relay-converter

# 上传文件
# - relay-converter-service.js
# - package.json
# - Dockerfile

# 构建并运行
docker build -t relay-converter .
docker run -d \
  --name relay-converter \
  --restart unless-stopped \
  -p 3000:3000 \
  relay-converter
```

### 方案 B: Node.js 直接运行

```bash
# 安装 Node.js（如果未安装）
opkg update
opkg install node node-npm

# 创建服务目录
mkdir -p /opt/relay-converter
cd /opt/relay-converter

# 上传文件并安装依赖
npm install

# 使用 procd 创建服务
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

# 启用并启动服务
chmod +x /etc/init.d/relay-converter
/etc/init.d/relay-converter enable
/etc/init.d/relay-converter start
```

## 转换逻辑说明

### 输入（Relay 格式）

```yaml
proxy-groups:
  - name: 🎯 落地节点
    type: select
    proxies:
      - landing-node-1
      - landing-node-2

  - name: 🎯 HK中转-落地
    type: relay
    proxies:
      - 🇭🇰 香港节点
      - 🎯 落地节点
```

### 输出（Dialer-Proxy 格式）

```yaml
proxies:
  - name: landing-node-1
    type: vmess
    server: example.com
    dialer-proxy: 🇭🇰 香港节点  # ← 自动添加

  - name: landing-node-2
    type: vmess
    server: example.com
    dialer-proxy: 🇭🇰 香港节点  # ← 自动添加

proxy-groups:
  - name: 🎯 落地节点
    type: select
    proxies:
      - landing-node-1
      - landing-node-2

  - name: 🎯 HK中转-落地
    type: select  # ← relay 改为 select
    proxies:
      - 🎯 落地节点
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `3000` |
| `NODE_ENV` | 运行环境 | `production` |
| `REQUEST_TIMEOUT` | HTTP 请求超时时间（毫秒） | `120000` (2分钟) |

### 配置超时时间

如果 subconverter 响应较慢，可以增加超时时间：

```bash
# 设置为 5 分钟
export REQUEST_TIMEOUT=300000
node relay-converter-service.js

# 或者在 Docker 中
docker run -d \
  --name relay-converter \
  -p 3000:3000 \
  -e REQUEST_TIMEOUT=300000 \
  relay-converter
```

## 测试

访问服务首页查看使用说明：

```bash
curl http://localhost:3000/
```

健康检查：

```bash
curl http://localhost:3000/health
```

## 故障排查

### 1. 服务无法启动

检查端口是否被占用：
```bash
netstat -tlnp | grep 3000
```

### 2. 转换失败

查看日志：
```bash
docker-compose logs -f relay-converter
# 或
journalctl -u relay-converter -f
```

### 3. OpenWrt 无法访问

检查防火墙规则：
```bash
# 允许 3000 端口
uci add firewall rule
uci set firewall.@rule[-1].name='relay-converter'
uci set firewall.@rule[-1].src='wan'
uci set firewall.@rule[-1].proto='tcp'
uci set firewall.@rule[-1].dest_port='3000'
uci set firewall.@rule[-1].target='ACCEPT'
uci commit firewall
/etc/init.d/firewall restart
```

## 性能优化

### 1. 启用缓存（可选）

在生产环境中，可以添加缓存层来提高性能。

### 2. 使用 PM2 管理进程

```bash
npm install -g pm2
pm2 start relay-converter-service.js --name relay-converter
pm2 save
pm2 startup
```

## 致谢

- 基于 [remoteman@linux.do](https://linux.do/t/topic/156436) 的转换脚本
- 适配 OpenWrt + Neko 环境

## 许可证

MIT License

## 更新日志

### v1.0.2 (2024-12-05)
- ✅ **修复 URL 参数解析问题**
  - 正确处理嵌套的 URL 参数（如 `?target=clash&url=...&config=...`）
  - 支持完整的 subconverter URL 传递
  - 添加详细的使用说明和示例

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
