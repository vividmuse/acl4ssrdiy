// Clash Verge Rev 预处理脚本
// 功能：将 relay 策略组转换为 dialer-proxy 配置
// 使用方法：在 Clash Verge Rev 的「配置」->「脚本」中添加此脚本

function main(config) {
  // 检查是否有 proxy-groups
  if (!config['proxy-groups']) {
    return config;
  }

  // 存储需要转换的 relay 组
  const relayGroups = [];
  const relayGroupNames = new Set();

  // 找出所有 relay 类型的策略组
  config['proxy-groups'].forEach(group => {
    if (group.type === 'relay') {
      relayGroups.push(group);
      relayGroupNames.add(group.name);
    }
  });

  // 如果没有 relay 组，直接返回
  if (relayGroups.length === 0) {
    return config;
  }

  console.log(`[Relay2Dialer] 发现 ${relayGroups.length} 个 relay 策略组，开始转换...`);

  // 处理每个 relay 组
  relayGroups.forEach(relayGroup => {
    const { name, proxies } = relayGroup;

    if (!proxies || proxies.length < 2) {
      console.log(`[Relay2Dialer] 跳过 ${name}：代理数量不足`);
      return;
    }

    console.log(`[Relay2Dialer] 转换 ${name}：${proxies.join(' -> ')}`);

    // Relay 链: proxies[0] -> proxies[1] -> ... -> proxies[n]
    // 转换为: proxies[n] 的 dialer-proxy 是 proxies[n-1]，以此类推

    // 创建新的代理节点
    const newProxies = [];

    for (let i = 0; i < proxies.length; i++) {
      const proxyName = proxies[i];
      const newProxyName = `${name}-${i}`;

      // 查找原始代理配置
      let originalProxy = null;

      // 先在 proxy-groups 中查找
      const groupProxy = config['proxy-groups'].find(g => g.name === proxyName);
      if (groupProxy) {
        originalProxy = { ...groupProxy, name: newProxyName };
      } else {
        // 在 proxies 中查找
        const proxy = config.proxies?.find(p => p.name === proxyName);
        if (proxy) {
          originalProxy = { ...proxy, name: newProxyName };
        }
      }

      if (!originalProxy) {
        console.log(`[Relay2Dialer] 警告：找不到代理 ${proxyName}`);
        continue;
      }

      // 为非第一个节点添加 dialer-proxy
      if (i > 0) {
        originalProxy['dialer-proxy'] = `${name}-${i - 1}`;
      }

      newProxies.push(originalProxy);
    }

    // 将 relay 组转换为 select 组，指向最后一个节点
    relayGroup.type = 'select';
    relayGroup.proxies = [newProxies[newProxies.length - 1].name];

    // 将新代理添加到配置中
    if (!config.proxies) {
      config.proxies = [];
    }

    newProxies.forEach(proxy => {
      // 如果是策略组，添加到 proxy-groups
      if (proxy.type === 'select' || proxy.type === 'url-test' ||
          proxy.type === 'load-balance' || proxy.type === 'fallback') {
        // 检查是否已存在
        const existingIndex = config['proxy-groups'].findIndex(g => g.name === proxy.name);
        if (existingIndex >= 0) {
          config['proxy-groups'][existingIndex] = proxy;
        } else {
          config['proxy-groups'].push(proxy);
        }
      } else {
        // 检查是否已存在
        const existingIndex = config.proxies.findIndex(p => p.name === proxy.name);
        if (existingIndex >= 0) {
          config.proxies[existingIndex] = proxy;
        } else {
          config.proxies.push(proxy);
        }
      }
    });

    console.log(`[Relay2Dialer] ✓ 已转换 ${name}，创建了 ${newProxies.length} 个代理节点`);
  });

  console.log(`[Relay2Dialer] 转换完成！`);

  return config;
}


// 简化版本：仅处理简单的双节点 relay（中转+落地）
function simpleRelayToDial erProxy(config) {
  if (!config['proxy-groups']) {
    return config;
  }

  const relayGroups = config['proxy-groups'].filter(g => g.type === 'relay');

  relayGroups.forEach(relayGroup => {
    const { name, proxies } = relayGroup;

    if (proxies && proxies.length === 2) {
      // 双节点模式：中转 -> 落地
      const [transitProxy, landingProxy] = proxies;

      console.log(`[SimpleRelay2Dialer] 转换 ${name}: ${transitProxy} -> ${landingProxy}`);

      // 查找落地节点
      const landingGroup = config['proxy-groups'].find(g => g.name === landingProxy);

      if (landingGroup && landingGroup.proxies) {
        // 为落地组中的每个节点添加 dialer-proxy
        landingGroup.proxies.forEach(proxyName => {
          const proxy = config.proxies?.find(p => p.name === proxyName);
          if (proxy) {
            // 设置 dialer-proxy 为中转节点
            proxy['dialer-proxy'] = transitProxy;
            console.log(`[SimpleRelay2Dialer]   设置 ${proxyName} 的 dialer-proxy = ${transitProxy}`);
          }
        });

        // 将 relay 组转换为 select 组
        relayGroup.type = 'select';
        relayGroup.proxies = [landingProxy];
      }
    }
  });

  return config;
}