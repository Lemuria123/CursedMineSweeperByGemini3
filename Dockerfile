# 本地 Docker 镜像。
# server：游戏 API + 管理后台（与 npm run dev:server 相同，同一进程）。
# web：Vite 开发服务器。源码由 compose 挂载宿主机目录，这里的 COPY 只为镜像可独立构建、并给依赖卷提供初始 node_modules。

FROM node:22-bookworm-slim AS server
WORKDIR /app
COPY server/package.json server/package-lock.json server/
COPY docker/server-entrypoint.mjs /usr/local/bin/cms-server-entrypoint.mjs
WORKDIR /app/server
RUN npm ci
WORKDIR /app
COPY server/tsconfig.json server/tsconfig.json
COPY server/src server/src
COPY server/public server/public
COPY shared shared
EXPOSE 38001 38002
ENTRYPOINT ["node", "/usr/local/bin/cms-server-entrypoint.mjs"]

FROM node:22-bookworm-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY docker/web-entrypoint.mjs /usr/local/bin/cms-web-entrypoint.mjs
COPY . .
EXPOSE 38000
ENTRYPOINT ["node", "/usr/local/bin/cms-web-entrypoint.mjs"]
