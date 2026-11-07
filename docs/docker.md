# 本地 Docker

游戏 API 与管理后台在同一个容器里，前端是另一个容器里的 Vite。源码挂载当前仓库，数据库仍在宿主机 `server/data`。

## 服务地址

| 服务 | 地址 | 容器端口 |
|---|---|---|
| 前端 | http://localhost:38000 | 38000 |
| 游戏 API | http://localhost:38001 | 38001 |
| 管理后台 | http://localhost:38002 | 38002 |

管理后台令牌默认 `admin`。前端页面在浏览器里请求 `http://localhost:38001`，与 `utils/api.ts` 中的地址一致。

## 端口

宿主机上 5173、8080、8081 已被占用，所以没有使用 Vite 默认端口。38000、38001、38002 当时空闲，分配如下：

- `38000`：前端
- `38001`：游戏 API，对应环境变量 `GAME_API_PORT`
- `38002`：管理后台，对应环境变量 `ADMIN_PORT`

## 启动与停止

在仓库根目录执行：

```powershell
docker compose up -d
docker compose stop
docker compose down
```

依赖变更后需要重新构建，并删掉只存放 Linux `node_modules` 的卷。`-v` 不会删除宿主机上的数据库。

```powershell
docker compose build
docker compose down -v
docker compose up -d
```

## 配置

配置在 `docker-compose.yml`。

- `ENCRYPTION_KEY`：游戏 API 的解密密钥，默认与 `start-dev-server.bat` 中的本地开发密钥相同。
- `VITE_ENCRYPTION_KEY`：传给前端，必须与 `ENCRYPTION_KEY` 相同，否则提交成绩无法解密。
- `ADMIN_TOKEN`：管理后台登录令牌，默认 `admin`。

可用环境变量覆盖上述三项，不改端口。
