FROM node:20-alpine

# 安装 coturn STUN/TURN 转发服务
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && \
    apk add --no-cache coturn

WORKDIR /app

# 安装 room 信令服务依赖
COPY package.json ./
RUN npm install --omit=dev ws

# 复制信令代码与入口启动脚本
COPY dist/ ./dist/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# 暴露端口：信令服务 (8787)、STUN/TURN (3478 tcp/udp)、中继端口段 (49152-49250 udp)
EXPOSE 8787 3478/tcp 3478/udp 49152-49250/udp
ENV PORT=8787 HOST=0.0.0.0

ENTRYPOINT ["/entrypoint.sh"]
