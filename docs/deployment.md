# 部署文档

当前网页版仅支持单人游戏与 `/wiki/` 资料站（暂不支持多人游戏），可纯静态部署。`pnpm build` 的产物包含游戏和 `/wiki/` 资料站（约 3300+ 个页面），两者一起发布。以下命令均在仓库根目录执行；本地运行和开发环境准备见[开发文档](development.md)。

## Docker

在仓库根目录手动构建并运行（Node 构建，Nginx 提供静态页面，包含游戏资源）：

```bash
docker build -t sts2-web:local .
docker run --rm -p 8080:80 sts2-web:local
# 打开 http://localhost:8080/
```

存档仍保存在玩家浏览器中，无需挂载容器数据卷。替换已有部署时保持访问地址的协议、域名和端口不变，浏览器才能继续访问原存档；公网部署使用 HTTPS 以支持 Service Worker 离线缓存。

### 手动构建并推送 Docker Hub

仓库 Settings → Secrets and variables → Actions 中配置：

| 类型 | 名称 | 值 |
|---|---|---|
| Variable | `DOCKERHUB_USERNAME` | Docker Hub 登录用户名 |
| Secret | `DOCKERHUB_TOKEN` | 有目标仓库写入权限的 Docker Hub access token |
| Variable（可选） | `DOCKERHUB_IMAGE` | 完整镜像名，如 `moonrailgun/sts2-web`；默认 `<DOCKERHUB_USERNAME>/sts2-web` |

确保 Docker Hub 上已创建目标仓库，且工作流文件已合入 GitHub 默认分支。在 Actions → **Build and push Docker image** → **Run workflow** 手动启动；`ref` 可填分支、标签或提交 SHA，留空则构建所选工作流版本。目标版本需要包含 Docker 构建文件。

工作流仅手动触发，不因 push、PR 或定时任务运行。它构建 `linux/amd64` 镜像，以实际检出提交的完整哈希发布为 `<镜像名>:sha-<40 位 SHA>`，不发布 `latest`。第三方 Actions 同样固定到完整提交 SHA。

```bash
docker run --rm -p 8080:80 <镜像名>:sha-<40位提交SHA>
```

## Cloudflare

Cloudflare Workers 提供静态资源与可选的 Steam 登录/云存档端点（当前版本暂不支持多人游戏，原 `packages/server/` 房间服务已移除）。配置见 `wrangler.jsonc`：

```bash
pnpm build
npx wrangler deploy
```

推送到 `main` 时由 `.github/workflows/cloudflare.yml` 自动部署（只在构建内容有变化时触发，也可以在 Actions 里手动运行）。仓库 Settings → Secrets and variables → Actions 中配置：

| 类型 | 名称 | 值 |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | Cloudflare API 令牌（模板 **编辑 Cloudflare Workers**，限定到所用账户和域名） |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID |

响应头在 `packages/app/public/_headers`。`wrangler.jsonc` 里的 `routes` 是本仓库站点的域名，自行部署时换成自己的或删掉。存档按访问地址隔离：给玩家用的地址要一直用同一个自定义域名，`*.workers.dev` 只用来预览。

刷新原有地址即可更新页面，保留该地址的浏览器存档；不要用删除网站数据来排查缓存。

### Steam 登录

Steam 网页登录使用 [Steam OpenID](https://partner.steamgames.com/doc/features/auth)，无需让玩家向本项目提交 Steam 密码。登录状态保存在 HttpOnly Cookie 中；昵称与头像由服务端调用 [GetPlayerSummaries](https://partner.steamgames.com/doc/webapi/ISteamUser)。部署前将自己的 Web API 密钥写入 Worker Secret：

```bash
pnpm exec wrangler secret put STEAM_WEB_API_KEY
```

不要将密钥写入 Git、Vite 环境变量或浏览器代码。原有浏览器单人存档继续按原地址读取。

## GitHub Pages

GitHub Pages 提供单人游戏和 `/wiki/` 资料站的静态托管（当前网页版暂不支持多人游戏）。

### 部署步骤

1. 在 GitHub 仓库设置：**Settings → Pages**：
   - **Source** 选择 **GitHub Actions**。
   - （可选）若使用自定义域名，在 **Custom domain** 填入你的域名（例如 `sts2.yourdomain.com`），并配置 DNS 记录（CNAME 指向 `<你的用户名>.github.io`）。
2. 工作流文件位于 `.github/workflows/pages.yml`：
   - 推送到 `main` 分支时自动构建并发布；
   - 也可在 **Actions → Deploy to GitHub Pages → Run workflow** 手动触发；
   - 若通过 Actions 手动触发，支持在输入框直接填入自定义域名以生成 `CNAME` 文件。
3. 存档同样保存在浏览器 IndexedDB 中，绑定当前访问 Origin。使用稳定自定义域名可保证后续迁移服务商时玩家存档不丢失。
