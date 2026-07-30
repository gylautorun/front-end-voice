# Socket.IO 可靠连接演示服务端

在 `server` 目录下运行：

```bash
npm run socket-io:reliable
```

服务端点：

- Socket.IO: `http://localhost:8084/socket.io`
- 健康检查：`http://localhost:8084/health`

该地址不是原生 WebSocket 端点。请使用 Socket.IO 客户端连接，并配置
`path: '/socket.io'`。Engine.IO 会在需要时先使用轮询建立连接，随后升级为 WebSocket；
其心跳检测的 ping 间隔为 10 秒，超时时间为 5 秒。

服务端启用了基于内存的连接状态恢复，恢复窗口为两分钟。如果需要在多个服务实例之间
恢复连接状态，请使用兼容的共享适配器。
