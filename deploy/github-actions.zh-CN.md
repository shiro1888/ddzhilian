# GitHub Actions 自动部署

目标：推送 `main` 分支到 GitHub 后，由 GitHub Actions 构建最新代码，并通过 SSH/rsync 发布到现有 VPS。

## 已加入的文件

- `.github/workflows/deploy-production.yml`：监听 `main` 分支 push，也支持手动 `workflow_dispatch`。
- `scripts/deploy-uploaded-artifacts.sh`：在服务器上发布 GitHub Actions 上传的构建产物。

## 工作流程

1. GitHub Actions 在 runner 上执行前端 `npm run lint`、`npm run build` 和后端 `npm run build`。
2. 校验通过后，Actions 整理前端 `out/` 和后端 `server/dist/` 等产物。
3. Actions 使用 SSH/rsync 上传产物到服务器临时发布目录。
4. 服务器备份并更新 `/opt/ddzhilian-server`，安装后端生产依赖，重启 `ddzhilian-server.service`。
5. 服务器检查本机 `/health`。
6. 服务器备份并同步 `out/` 到 `/opt/ddzhilian-frontend`。
7. 服务器执行 `nginx -t`，通过后 reload nginx。
8. 服务器检查公网 `https://ddzhilian.com/health`。

## GitHub Secrets

在 GitHub 仓库 `Settings -> Secrets and variables -> Actions` 中添加：

| 名称 | 必填 | 说明 |
| --- | --- | --- |
| `DEPLOY_HOST` | 是 | VPS IP 或域名，例如 `43.99.138.40`。 |
| `DEPLOY_USER` | 是 | SSH 登录用户，建议使用专门的 deploy 用户；也可以用 root。 |
| `DEPLOY_SSH_KEY` | 是 | GitHub Actions 登录服务器用的私钥。 |
| `DEPLOY_KNOWN_HOSTS` | 是 | 服务器 SSH host key，用于防止连到错误服务器。 |

生成 `DEPLOY_KNOWN_HOSTS` 的示例：

```bash
ssh-keyscan -p 22 43.99.138.40
```

## GitHub Variables

这些变量不含敏感信息，不填时会使用默认值：

| 名称 | 默认值 | 说明 |
| --- | --- | --- |
| `DEPLOY_PORT` | `22` | SSH 端口。 |
| `DEPLOY_FRONTEND_DIR` | `/opt/ddzhilian-frontend` | nginx 静态前端目录。 |
| `DEPLOY_FRONTEND_BACKUP_ROOT` | `/opt/ddzhilian-frontend-backups` | 前端发布前备份目录。 |
| `DEPLOY_BACKEND_DIR` | `/opt/ddzhilian-server` | systemd 后端运行目录。 |
| `DEPLOY_BACKEND_BACKUP_ROOT` | `/opt/ddzhilian-server-backups` | 后端发布前备份目录。 |
| `DEPLOY_BACKEND_SERVICE` | `ddzhilian-server.service` | systemd 后端服务名。 |
| `DEPLOY_BACKEND_HEALTH_URL` | `http://127.0.0.1:8787/health` | 服务器本机后端健康检查地址。 |
| `DEPLOY_PUBLIC_HEALTH_URL` | `https://ddzhilian.com/health` | 公网健康检查地址。 |
| `DEPLOY_RELEASE_ROOT` | `/tmp/ddzhilian-actions` | Actions 上传到服务器的临时发布根目录。 |

## 服务器要求

- 已安装 `git`、`node`、`npm`、`rsync`、`curl`、`nginx`、`systemd`。
- GitHub Actions 使用 Node.js 22 构建代码；服务器需要能运行当前后端服务并执行 `npm ci --omit=dev`。
- 后端生产环境变量继续放在服务器上，例如 `server/.env`，不要提交到 GitHub。
- `DEPLOY_USER` 需要有权限写入 `/opt/ddzhilian-frontend`、`/opt/ddzhilian-server`，并能执行：
  - `systemctl restart ddzhilian-server.service`
  - `systemctl is-active ddzhilian-server.service`
  - `nginx -t`
  - `systemctl reload nginx`
- 如果 `DEPLOY_USER` 不是 root，需要配置免密 sudo 覆盖上述命令和前端目录写入。

## 回滚说明

每次发布前，脚本会把当前 `/opt/ddzhilian-frontend` 备份到：

```text
/opt/ddzhilian-frontend-backups/frontend-YYYYMMDDHHMMSS
```

后端 `dist/` 和 package 文件会备份到：

```text
/opt/ddzhilian-server-backups/backend-YYYYMMDDHHMMSS
```

如果发布失败，先查看 GitHub Actions 日志定位失败阶段。前端静态文件可从上述备份目录恢复；后端可从后端备份目录恢复 `dist/` 和 package 文件后重启 systemd 服务。
