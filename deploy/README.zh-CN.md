# ddzhilian 生产加速部署建议

目标：让中国大陆用户进入网页时优先命中边缘静态资源，香港服务器只负责 `/api/*`、`/ws` 和历史文件。

## 推荐架构

1. 前端静态资源放 CDN 或静态托管。
   - 上传 `npm run build:compressed` 生成的 `out/`。
   - `out/_next/static/*` 是带 hash 的文件，可以长期缓存。
   - `out/index.html` 必须 `no-cache`，否则发版后用户可能拿到旧入口。

2. 香港服务器只跑后端。
   - WebSocket：`/ws`
   - API：`/api/*`
   - 大文件历史下载支持 `Range`，可断点/分段读取。

3. 前端构建时配置后端地址。
   - 前后端同域：不需要额外配置，默认 `/ws` 和 `/api`。
   - 前后端分域：设置 `VITE_SIGNALING_WS_URL` 和 `VITE_SIGNALING_HTTP_URL`。

## 静态托管头

`public/_headers` 会被 Next.js 静态导出复制到 `out/_headers`，可被部分静态托管平台识别：

- `/_next/static/*`: `Cache-Control: public, max-age=31536000, immutable`
- `/index.html`: 通过 `/*` 规则走 `no-cache`
- SVG 图标：缓存 7 天

如果托管平台不识别 `_headers`，请在 CDN 控制台配置等价规则。

## Nginx 反代

参考 `deploy/nginx/ddzhilian.conf`：

- 静态资源开启长期缓存。
- `gzip_static on` 直接使用 `.gz` 预压缩文件。
- 如安装了 `ngx_brotli`，开启 `brotli_static on` 使用 `.br` 文件。
- `/api/*` 和 `/ws` 反代到本机后端 `127.0.0.1:8787`。
- `proxy_request_buffering off` 避免上传历史文件时被 Nginx 先完整缓存。

## 构建命令

```bash
npm run build:compressed
```

输出示例：

```text
out/
  index.html
  _next/static/**/*.js
  _next/static/**/*.js.gz
  _next/static/**/*.js.br
  _next/static/**/*.css
  _next/static/**/*.css.gz
  _next/static/**/*.css.br
```

## 线上排查顺序

1. 看 HTML 的 TTFB：如果慢，优先解决 CDN 回源或源站距离。
2. 看 `assets/*.js` 和 `assets/*.css` 是否命中 CDN、是否 `immutable`。
3. 看是否返回 `br` 或 `gzip`。
4. 看 `/ws` 的连接耗时：它影响“在线设备”出现，但不应该阻塞页面框架渲染。
