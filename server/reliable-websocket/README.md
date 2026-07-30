# 可靠 WebSocket 演示服务端

在 `server` 目录下运行：

```bash
npm run websocket:reliable
```

服务端点：

- WebSocket: `ws://localhost:8083/ws/reliable`
- 健康检查：`http://localhost:8083/health`

Vite 开发服务器会将 `/ws/reliable` 代理到 `8083` 端口，因此浏览器端演示会使用当前页面的源地址。
可以通过 `PORT` 修改后端端口。在非本地环境中，请使用英文逗号分隔的
`ALLOWED_ORIGINS` 设置允许访问的源；未设置时，仅接受来自 localhost 的浏览器请求，
以及不包含 `Origin` 请求头的客户端连接。

`nginx.conf` 包含与之匹配的生产环境反向代理配置。消息历史记录仅保存在当前进程中，
最多保留 100 条；如需在多个服务实例之间持久化消息并支持重放，请使用 Redis 或数据库。
