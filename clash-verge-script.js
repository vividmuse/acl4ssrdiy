// Clash Verge Rev 预处理脚本
// 基于 remoteman 的脚本定制，适配 acl4ssrdiy.ini 配置
// 来源：https://linux.do/t/topic/156436

function main(config, profileName) {
    // 设置 DNS（可选）
    updateDNS(config, [
        ["proxy-server-nameserver", "223.5.5.5"],
        ["default-nameserver", "223.5.5.5"],
        ["nameserver", "223.5.5.5"]
    ]);

    // 核心功能：将 relay 转换为 dialer-proxy
    // 配置格式：[落地节点组名, 中转代理组名, relay组名]
    updateDialerProxyGroup(config, [
        ["🎯 落地节点", "🇭🇰 香港节点", "🎯 HK中转-落地"],
        ["🎯 落地节点", "🇸🇬 狮城节点", "🎯 SG中转-落地"],
        ["🎯 落地节点", "🇨🇳 台湾节点", "🎯 TW中转-落地"],
        ["🎯 落地节点", "🇯🇵 日本节点", "🎯 JP中转-落地"]
    ]);

    // 可选：修改订阅组选项
    // updateGroupOption(config, "type", ["load-balance", "fallback", "url-test"], "lazy", false);

    // 可选：修改节点 UDP over TCP 选项
    // updateProxyOption(config, "type", ["vmess", "vless", "trojan", "ss", "ssr", "tuic"], "udp-over-tcp", true);

    return config;
}

// ========== 工具函数库 ==========
// Author: remoteman
// Source: https://linux.do/t/topic/156436

// 修改节点组内节点 dialer-proxy 代理并将 relay 节点组替换为新的节点组
// 传入参数：config, groupMappings ([groupName, dialerProxyName, targetGroupName])
// 例如原逻辑为：
//   - 落地节点组（groupName）包含：落地节点1、落地节点2
//   - relay 节点组（targetGroupName）为：[中转节点（dialerProxyName）、落地节点组]
// 脚本会：
//   1. 为落地节点1、落地节点2 添加 dialer-proxy = 中转节点
//   2. 将 relay 组改为 select 组，只保留落地节点组
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

// 增加 DNS
// 传入参数：config, dnsMappings (["proxy-server-nameserver","223.5.5.5"])
function updateDNS(config, dnsMappings) {
    if (config.dns) {
        dnsMappings.forEach(([dnsKey, dnsValue]) => {
            if (config.dns[dnsKey]) {
                const hasDNS = config.dns[dnsKey].includes(dnsValue);
                if (!hasDNS) {
                    config.dns[dnsKey].unshift(dnsValue);
                }
            }
        });
    }
}

// 修改节点组属性
// 传入参数：config, searchBy, targetGroups, optionName, optionValue
function updateGroupOption(config, searchBy, targetGroups, optionName, optionValue) {
    config["proxy-groups"].forEach(group => {
        if (Array.isArray(targetGroups)) {
            for (const targetGroup of targetGroups) {
                if (targetGroup instanceof RegExp && targetGroup.test(group[searchBy])) {
                    group[optionName] = optionValue;
                    break;
                } else if (group[searchBy] === targetGroup) {
                    group[optionName] = optionValue;
                    break;
                }
            }
        } else if (targetGroups instanceof RegExp && targetGroups.test(group[searchBy])) {
            group[optionName] = optionValue;
        } else if (group[searchBy] === targetGroups) {
            group[optionName] = optionValue;
        }
    });
}

// 修改节点属性
// 传入参数：config, searchBy, targetProxies, optionName, optionValue
function updateProxyOption(config, searchBy, targetProxies, optionName, optionValue) {
    config.proxies.forEach(proxy => {
        if (Array.isArray(targetProxies)) {
            for (const targetProxy of targetProxies) {
                if (targetProxy instanceof RegExp && targetProxy.test(proxy[searchBy])) {
                    proxy[optionName] = optionValue;
                    break;
                } else if (proxy[searchBy] === targetProxy) {
                    proxy[optionName] = optionValue;
                    break;
                }
            }
        } else if (targetProxies instanceof RegExp && targetProxies.test(proxy[searchBy])) {
            proxy[optionName] = optionValue;
        } else if (proxy[searchBy] === targetProxies) {
            proxy[optionName] = optionValue;
        }
    });
}

// 修改节点组内节点属性
// 传入参数：config, searchBy, targetGroups, optionName, optionValue
function updateProxyOptionByGroup(config, searchBy, targetGroups, optionName, optionValue) {
    config["proxy-groups"].forEach(group => {
        if (Array.isArray(targetGroups)) {
            for (const targetGroup of targetGroups) {
                if (targetGroup instanceof RegExp && targetGroup.test(group[searchBy])) {
                    group.proxies.forEach(proxyName => {
                        const proxy = (config.proxies || []).find(p => p.name === proxyName);
                        if (proxy) {
                            proxy[optionName] = optionValue;
                        }
                    });
                    break;
                } else if (group[searchBy] === targetGroup) {
                    group.proxies.forEach(proxyName => {
                        const proxy = (config.proxies || []).find(p => p.name === proxyName);
                        if (proxy) {
                            proxy[optionName] = optionValue;
                        }
                    });
                    break;
                }
            }
        } else if (targetGroups instanceof RegExp && targetGroups.test(group[searchBy])) {
            group.proxies.forEach(proxyName => {
                const proxy = (config.proxies || []).find(p => p.name === proxyName);
                if (proxy) {
                    proxy[optionName] = optionValue;
                }
            });
        } else if (group[searchBy] === targetGroups) {
            group.proxies.forEach(proxyName => {
                const proxy = (config.proxies || []).find(p => p.name === proxyName);
                if (proxy) {
                    proxy[optionName] = optionValue;
                }
            });
        }
    });
}

// 指定节点到正则匹配节点组
// 传入参数：config, regex, newProxies
function addProxiesToRegexGroup(config, regex, newProxies) {
    const targetGroups = config["proxy-groups"].filter(group => regex.test(group.name));
    targetGroups.forEach(targetGroup => {
        if (!Array.isArray(newProxies)) {
            newProxies = [newProxies];
        }
        newProxies.forEach(proxy => {
            if (!targetGroup.proxies.includes(proxy)) {
                targetGroup.proxies.push(proxy);
            }
        });
    });
}

// 添加规则
// 传入参数：config, newrule, position (push/unshift，默认为 unshift，即最高优先级)
function addRules(config, newrule, position) {
    if (position === "push") {
        config["rules"].splice(-1, 0, newrule);
    } else {
        config["rules"].unshift(newrule);
    }
}

// 删除指定属性节点
// 传入参数：config, property (属性), value (值)
function removeProxiesByProperty(config, property, value) {
    const removedProxyNames = [];
    config.proxies = config.proxies.filter(proxy => {
        if (proxy[property] === value) {
            removedProxyNames.push(proxy.name);
            return false;
        }
        return true;
    });
    config["proxy-groups"].forEach(group => {
        group.proxies = group.proxies.filter(proxyName => !removedProxyNames.includes(proxyName));
    });
}
