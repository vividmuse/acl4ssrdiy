# 快速开始指南

## ✅ 测试成功！

服务已经在本地测试成功，转换功能正常工作。

### 转换效果验证

**转换前（Relay）：**
```yaml
proxy-groups:
  - name: 🎯 HK中转-落地
    type: relay  # ← relay 类型
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
    port: 443
    dialer-proxy: 🇭🇰 香港节点  # ← 自动添加！

  - name: Landing-Node-2
    type: ss
    server: jp.example.com
    port: 8388
    dialer-proxy: 🇭🇰 香港节点  # ← 自动添加！

proxy-groups:
  - name: 🎯 HK中转-落地
    type: select  # ← relay 改为 select
    proxies:
      - 🎯 落地节点
```

## 部署到 OpenWrt

### 方法 1：使用 Docker（推荐）

```bash
# 1. 上传文件到 OpenWrt
scp relay-converter-service.js package.json Dockerfile root@192.168.1.1:/opt/relay-converter/

# 2. SSH 登录
ssh root@192.168.1.1

# 3. 构建镜像
cd /opt/relay-converter
docker build -t relay-converter .

# 4. 启动容器
docker run -d \
  --name relay-converter \
  --restart unless-stopped \
  -p 3000:3000 \
  relay-converter

# 5. 验证服务
curl http://localhost:3000/health
```

### 方法 2：直接运行 Node.js

```bash
# 1. 安装 Node.js
opkg update
opkg install node node-npm

# 2. 上传文件
scp relay-converter-service.js package.json root@192.168.1.1:/opt/relay-converter/

# 3. SSH 登录并安装依赖
ssh root@192.168.1.1
cd /opt/relay-converter
npm install --omit=dev

# 4. 启动服务（后台运行）
nohup node relay-converter-service.js > service.log 2>&1 &

# 5. 验证服务
curl http://localhost:3000/health
```

### 方法 3：创建系统服务（推荐用于生产）

```bash
# 创建 systemd 服务文件（如果 OpenWrt 支持 systemd）
cat > /etc/init.d/relay-converter << 'EOF'
#!/bin/sh /etc/rc.common

START=99
STOP=10

USE_PROCD=1
PROG=/usr/bin/node
PROG_ARGS="/opt/relay-converter/relay-converter-service.js"

start_service() {
    procd_open_instance
    procd_set_param command $PROG $PROG_ARGS
    procd_set_param respawn
    procd_set_param stdout 1
    procd_set_param stderr 1
    procd_set_param pidfile /var/run/relay-converter.pid
    procd_close_instance
}
EOF

chmod +x /etc/init.d/relay-converter
/etc/init.d/relay-converter enable
/etc/init.d/relay-converter start
```

## 在 Neko 中配置

### 订阅 URL 格式

```
http://192.168.1.1:3000/convert?url=http://192.168.1.1:25500/sub?target=clash&config=你的配置URL&url=你的机场订阅
```

### 完整示例

假设：
- OpenWrt IP: `192.168.1.1`
- Subconverter 端口: `25500`
- 配置文件: `https://raw.githubusercontent.com/你的用户名/acl4ssrdiy/main/acl4ssrdiy.ini`
- 机场订阅: `https://your-airport.com/api/v1/client/subscribe?token=YOUR_TOKEN`

**最终订阅地址：**
```
http://192.168.1.1:3000/convert?url=http://192.168.1.1:25500/sub?target=clash&config=https://raw.githubusercontent.com/你的用户名/acl4ssrdiy/main/acl4ssrdiy.ini&url=https://your-airport.com/api/v1/client/subscribe?token=YOUR_TOKEN
```

### URL 编码（如果需要）

如果订阅 URL 包含特殊字符，需要进行 URL 编码：

```bash
# 在线工具
https://www.urlencoder.org/

# 或使用命令
echo "你的订阅URL" | jq -sRr @uri
```

## 验证转换效果

### 1. 测试服务健康状态

```bash
curl http://192.168.1.1:3000/health
```

**预期响应：**
```json
{
  "status": "ok",
  "service": "relay-converter",
  "version": "1.0.0"
}
```

### 2. 测试转换功能

```bash
# 下载转换后的配置
curl "http://192.168.1.1:3000/convert?url=..." -o test-output.yaml

# 检查是否包含 dialer-proxy
grep "dialer-proxy" test-output.yaml

# 检查 relay 是否已转换为 select
grep -A 2 "HK中转-落地" test-output.yaml
```

### 3. 在 Neko 中测试

1. 将订阅地址填入 Neko
2. 更新订阅
3. 查看日志，确认无错误
4. 检查生成的配置文件中是否包含 `dialer-proxy`

## 故障排查

### 问题 1：服务无法启动

**检查端口占用：**
```bash
netstat -tlnp | grep 3000
```

**更换端口：**
```bash
export PORT=3001
node relay-converter-service.js
```

### 问题 2：转换失败

**查看日志：**
```bash
# Docker
docker logs relay-converter

# 直接运行
tail -f /opt/relay-converter/service.log
```

**测试 subconverter：**
```bash
curl "http://192.168.1.1:25500/sub?target=clash&url=你的订阅"
```

### 问题 3：Neko 无法访问

**检查防火墙：**
```bash
# 添加防火墙规则
iptables -I INPUT -p tcp --dport 3000 -j ACCEPT

# 或使用 uci（OpenWrt）
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

### 1. 启用 PM2 进程管理（可选）

```bash
npm install -g pm2
pm2 start relay-converter-service.js --name relay-converter
pm2 save
pm2 startup
```

### 2. 使用 Nginx 反向代理（可选）

```nginx
location /convert {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

## 资源占用

- **内存**: ~30-50MB
- **CPU**: < 5% (闲时)
- **磁盘**: ~15MB (包含依赖)

## 更新服务

```bash
# 停止服务
docker stop relay-converter
# 或
killall node

# 更新文件
scp relay-converter-service.js root@192.168.1.1:/opt/relay-converter/

# 重启服务
docker start relay-converter
# 或
node /opt/relay-converter/relay-converter-service.js &
```

## 卸载

```bash
# Docker
docker stop relay-converter
docker rm relay-converter
docker rmi relay-converter

# 直接运行
killall node
rm -rf /opt/relay-converter
```

## 支持

如有问题，请检查：
1. 服务日志
2. Subconverter 是否正常工作
3. 网络连接是否正常
4. 订阅 URL 是否正确编码

---

**致谢：** 基于 remoteman@linux.do 的脚本改编