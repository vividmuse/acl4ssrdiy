#!/usr/bin/env node

/**
 * Relay to Dialer-Proxy 转换服务
 * 用途：将 subconverter 生成的包含 relay 的 Clash 配置转换为 dialer-proxy 格式
 * 适用于 OpenWrt + Neko 等不支持预处理脚本的环境
 *
 * 使用方法：
 * 1. 安装依赖: npm install express js-yaml
 * 2. 启动服务: node relay-converter-service.js
 * 3. 发送请求:
 *    curl -X POST http://localhost:3000/convert \
 *      -H "Content-Type: application/json" \
 *      -d '{"config": "你的Clash配置YAML文本"}'
 *
 * 或者直接传递 subconverter URL:
 *    curl "http://localhost:3000/convert?url=http://subconverter/sub?target=clash&url=..."
 *
 * Author: Based on remoteman@linux.do's script
 */

const express = require('express');
const yaml = require('js-yaml');
const http = require('http');
const https = require('https');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ type: 'text/yaml', limit: '10mb' }));

// 静态文件服务（前端页面）
app.use(express.static(path.join(__dirname, 'public')));

// 增加请求超时时间（默认 2 分钟，可通过环境变量配置）
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || '120000'); // 毫秒

/**
 * 从原始查询字符串中提取并解码 subconverter URL
 * 支持 url 参数被整体 encode 后传入，也支持 url 不是第一个参数的情况
 */
function extractTargetUrl(req) {
    const queryString = req.url.split('?')[1] || '';

    if (!queryString) {
        return null;
    }

    const urlIndex = queryString.indexOf('url=');

    if (urlIndex === -1) {
        return null;
    }

    const afterUrl = queryString.substring(urlIndex + 4);
    const formatIndex = afterUrl.indexOf('&format=');
    const rawUrl = formatIndex !== -1 ? afterUrl.substring(0, formatIndex) : afterUrl;

    // 仅在整体被 encode 的情况下才解码，避免把内部的 url/config 再次解码
    const looksFullyEncoded = rawUrl.startsWith('http%3A') || rawUrl.startsWith('https%3A');

    if (!looksFullyEncoded) {
        return rawUrl;
    }

    try {
        return decodeURIComponent(rawUrl);
    } catch (err) {
        console.warn('[Converter] URL 解码失败，使用原始值:', err.message);
        return rawUrl;
    }
}

/**
 * 规范化 subconverter URL，清理订阅参数里的换行，避免后端返回 400
 */
function normalizeSubconverterUrl(targetUrl) {
    try {
        const parsed = new URL(targetUrl);

        const subParam = parsed.searchParams.get('url');
        if (subParam) {
            // 将换行替换为管道符，兼容多机场订阅
            const cleaned = subParam.replace(/[\r\n]+/g, '|');
            if (cleaned !== subParam) {
                parsed.searchParams.set('url', cleaned);
            }
        }

        const configParam = parsed.searchParams.get('config');
        if (configParam) {
            // 去掉意外的首尾空白
            const trimmed = configParam.trim();
            if (trimmed !== configParam) {
                parsed.searchParams.set('config', trimmed);
            }
        }

        return parsed.toString();
    } catch (err) {
        console.warn('[Converter] 规范化 subconverter URL 失败，使用原值:', err.message);
        return targetUrl;
    }
}

function sendYaml(res, content) {
    res.set('Content-Type', 'text/yaml; charset=utf-8');
    return res.send(content);
}

// ========== 核心转换函数 ==========

/**
 * 修改节点组内节点 dialer-proxy 代理并将 relay 节点组替换为新的节点组
 */
function updateDialerProxyGroup(config, groupMappings) {
    if (!config.proxies) {
        config.proxies = [];
    }

    const findProxyByName = (name) => (config.proxies || []).find(p => p.name === name);

    const ensureProxyWithDialer = (proxyName, dialerProxyName) => {
        const existing = findProxyByName(proxyName);

        // 如果不存在原始节点，直接返回
        if (!existing) {
            return { proxyName, proxy: null };
        }

        // 如果还没有设置或与目标一致，直接复用
        if (!existing["dialer-proxy"] || existing["dialer-proxy"] === dialerProxyName) {
            existing["dialer-proxy"] = dialerProxyName;
            return { proxyName, proxy: existing };
        }

        // 已有不同的 dialer-proxy，克隆一个新节点避免冲突
        const baseName = `${proxyName} (${dialerProxyName})`;
        let newName = baseName;
        let counter = 1;
        while (findProxyByName(newName)) {
            newName = `${baseName}-${counter++}`;
        }

        const cloned = { ...existing, name: newName, ["dialer-proxy"]: dialerProxyName };
        config.proxies.push(cloned);
        return { proxyName: newName, proxy: cloned };
    };

    groupMappings.forEach(([groupName, dialerProxyName, targetGroupName]) => {
        const group = config["proxy-groups"].find(group => group.name === groupName);
        if (group) {
            console.log(`[DialerProxy] 处理组: ${groupName}, 设置 dialer-proxy = ${dialerProxyName}`);

            group.proxies = group.proxies.map(proxyName => {
                if (proxyName === "DIRECT") return proxyName;

                const { proxyName: newName, proxy } = ensureProxyWithDialer(proxyName, dialerProxyName);
                if (proxy) {
                    console.log(`[DialerProxy]   ✓ ${proxyName} -> ${newName} dialer-proxy: ${dialerProxyName}`);
                } else {
                    console.log(`[DialerProxy]   ⚠️ 未找到节点 ${proxyName}`);
                }
                return newName;
            });

            if (group.proxies.length > 0) {
                const targetGroupIndex = config["proxy-groups"].findIndex(group => group.name === targetGroupName);
                if (targetGroupIndex !== -1) {
                    console.log(`[DialerProxy] 转换 relay 组: ${targetGroupName} -> select`);
                    config["proxy-groups"][targetGroupIndex] = {
                        name: targetGroupName,
                        type: "select",
                        proxies: [groupName],
                    };
                }
            }
        } else {
            console.log(`[DialerProxy] 警告: 找不到组 ${groupName}`);
        }
    });
}

/**
 * 主转换函数
 */
function convertConfig(config) {
    // 检查配置是否有效
    if (!config || !config["proxy-groups"]) {
        throw new Error("Invalid config: missing proxy-groups");
    }

    // 查找所有 relay 类型的组
    const relayGroups = config["proxy-groups"].filter(g => g.type === 'relay');

    if (relayGroups.length === 0) {
        console.log('[Converter] 未发现 relay 组，无需转换');
        return config;
    }

    console.log(`[Converter] 发现 ${relayGroups.length} 个 relay 组`);

    // 自动检测 relay 组的模式并转换
    const groupMappings = [];

    relayGroups.forEach(relayGroup => {
        const { name, proxies } = relayGroup;

        if (!proxies || proxies.length !== 2) {
            console.log(`[Converter] 跳过 ${name}: 仅支持双节点 relay`);
            return;
        }

        const [transitProxyName, landingProxyName] = proxies;

        // 检查第二个是否是策略组（落地节点组）
        const landingGroup = config["proxy-groups"].find(g => g.name === landingProxyName);

        if (landingGroup) {
            // 标准模式：中转节点 -> 落地节点组
            console.log(`[Converter] 检测到标准 relay: ${name} = ${transitProxyName} -> ${landingProxyName}`);
            groupMappings.push([landingProxyName, transitProxyName, name]);
        } else {
            console.log(`[Converter] 跳过 ${name}: 第二个参数不是策略组`);
        }
    });

    // 执行转换
    if (groupMappings.length > 0) {
        updateDialerProxyGroup(config, groupMappings);
        console.log(`[Converter] 成功转换 ${groupMappings.length} 个 relay 组`);
    }

    return config;
}

// ========== HTTP 工具函数 ==========

/**
 * 从 URL 获取配置（带超时和重试）
 */
function fetchConfig(url, retries = 2) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;

        console.log(`[Fetch] 请求 URL: ${url.substring(0, 100)}...`);
        console.log(`[Fetch] 超时设置: ${REQUEST_TIMEOUT}ms, 剩余重试次数: ${retries}`);

        const request = client.get(url, {
            timeout: REQUEST_TIMEOUT
        }, (res) => {
            res.setEncoding('utf8');
            let data = '';
            let receivedBytes = 0;

            res.on('data', (chunk) => {
                data += chunk;
                receivedBytes += chunk.length;

                // 每接收 100KB 输出一次进度
                if (receivedBytes % 102400 === 0) {
                    console.log(`[Fetch] 已接收: ${(receivedBytes / 1024).toFixed(2)} KB`);
                }
            });

            res.on('end', () => {
                console.log(`[Fetch] 完成: 总共接收 ${(receivedBytes / 1024).toFixed(2)} KB`);
                const bodySnippet = data.substring(0, 200);

                if (res.statusCode === 200) {
                    resolve(data);
                } else if (res.statusCode === 301 || res.statusCode === 302) {
                    // 处理重定向
                    const redirectUrl = res.headers.location;
                    console.log(`[Fetch] 重定向到: ${redirectUrl}`);

                    if (retries > 0) {
                        resolve(fetchConfig(redirectUrl, retries - 1));
                    } else {
                        reject(new Error(`Too many redirects`));
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage || ''} ${bodySnippet}`.trim()));
                }
            });
        });

        // 超时处理
        request.on('timeout', () => {
            request.destroy();
            const error = new Error(`请求超时 (>${REQUEST_TIMEOUT}ms)`);

            if (retries > 0) {
                console.log(`[Fetch] 请求超时，重试中... (剩余 ${retries} 次)`);
                resolve(fetchConfig(url, retries - 1));
            } else {
                console.error('[Fetch] 请求超时且无剩余重试次数');
                reject(error);
            }
        });

        // 错误处理
        request.on('error', (err) => {
            console.error('[Fetch] 请求错误:', err.message);

            if (retries > 0 && (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT')) {
                console.log(`[Fetch] 连接错误，重试中... (剩余 ${retries} 次)`);
                setTimeout(() => {
                    resolve(fetchConfig(url, retries - 1));
                }, 1000); // 等待 1 秒后重试
            } else {
                reject(err);
            }
        });
    });
}

// ========== API 路由 ==========

/**
 * 健康检查
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'relay-converter',
        version: '1.0.0'
    });
});

/**
 * 转换接口 - POST 方式
 * Body: { "config": "YAML配置文本" } 或直接发送 YAML 文本
 */
app.post('/convert', async (req, res) => {
    try {
        let configText;

        // 支持 JSON 和纯文本两种格式
        if (typeof req.body === 'string') {
            configText = req.body;
        } else if (req.body.config) {
            configText = req.body.config;
        } else {
            return res.status(400).json({
                error: 'Missing config parameter',
                usage: 'POST JSON: {"config": "yaml text"} or POST raw YAML text'
            });
        }

        // 解析 YAML
        const config = yaml.load(configText);

        // 转换
        const converted = convertConfig(config);

        // 返回 YAML 格式
        const outputFormat = req.query.format || 'yaml';

        if (outputFormat === 'json') {
            res.json(converted);
        } else {
            sendYaml(res, yaml.dump(converted, {
                lineWidth: -1,
                noRefs: true
            }));
        }

    } catch (error) {
        console.error('[Error]', error.message);
        res.status(500).json({
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

/**
 * 转换接口 - GET 方式（从 URL 获取配置）
 * Query: ?url=http://subconverter/sub?target=clash&url=...
 */
app.get('/convert', async (req, res) => {
    try {
        let url = extractTargetUrl(req);

        if (!url) {
            return res.status(400).json({
                error: 'Missing url parameter',
                usage: 'GET /convert?url=http://subconverter/sub?target=clash&url=...',
                note: '如果包含多个参数，请把整个 subconverter 链接用 encodeURIComponent 包裹后再传入',
            });
        }

        url = normalizeSubconverterUrl(url);

        console.log(`[Converter] 从 URL 获取配置: ${url}`);

        // 获取配置
        const configText = await fetchConfig(url);

        // 解析 YAML
        const config = yaml.load(configText);

        // 转换
        const converted = convertConfig(config);

        // 返回 YAML 格式
        const outputFormat = req.query.format || 'yaml';

        if (outputFormat === 'json') {
            res.json(converted);
        } else {
            sendYaml(res, yaml.dump(converted, {
                lineWidth: -1,
                noRefs: true
            }));
        }

    } catch (error) {
        console.error('[Error]', error.message);
        res.status(500).json({
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// 注意：首页现在由 public/index.html 提供（静态文件服务）

// ========== 启动服务 ==========

app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  Relay to Dialer-Proxy 转换服务已启动                      ║
╠════════════════════════════════════════════════════════════╣
║  监听端口: ${PORT.toString().padEnd(48)} ║
║  访问地址: http://localhost:${PORT.toString().padEnd(37)} ║
╠════════════════════════════════════════════════════════════╣
║  使用示例:                                                 ║
║  curl "http://localhost:${PORT}/convert?url=..."${' '.repeat(18)}║
╚════════════════════════════════════════════════════════════╝
    `);
});
