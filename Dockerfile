FROM node:18-alpine

WORKDIR /app

# 复制依赖文件
COPY package.json ./

# 安装依赖（使用 npm install 而不是 npm ci）
RUN npm install --omit=dev && \
    npm cache clean --force

# 复制服务文件和前端页面
COPY relay-converter-service.js ./
COPY public ./public

# 暴露端口
EXPOSE 3000

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动服务
CMD ["node", "relay-converter-service.js"]