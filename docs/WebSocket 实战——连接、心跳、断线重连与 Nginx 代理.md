# WebSocket 实战——连接、心跳、断线重连与 Nginx 代理

## 一、为什么用 WebSocket：和它的几个竞品对比

**选型建议**：

- 只要服务端推送（行情、通知、日志）→ **优先 SSE**，简单、纯 HTTP、天然兼容 HTTP/2 多路复用

- 需要双向频繁通信（聊天、协同、游戏）→ **WebSocket**

- 不要为了"实时"硬上 WebSocket，**SSE 能搞定的就 SSE，运维成本低一档**

## 二、握手过程：从 HTTP Upgrade 到全双工

WebSocket 用 HTTP/1\.1 完成握手（**注意：握手必须走 HTTP/1\.1，HTTP/2 上的 WebSocket 是 RFC 8441 专门定义的，落地不普遍**），握手完成后协议升级，TCP 连接被复用做帧通信。

### 客户端握手请求

```Plain Text
GET /chat HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
Origin: https://example.com
```

关键三行：

- `Upgrade: websocket` 表明要协议升级

- `Connection: Upgrade` 表明这次连接需要升级

- `Sec-WebSocket-Key` 客户端随机生成的 16 字节 base64

### 服务端响应

```Plain Text
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

`Sec-WebSocket-Accept` 计算规则：把 `Sec-WebSocket-Key` 加上固定字符串 `258EAFA5-E914-47DA-95CA-C5AB0DC85B11`（魔数），SHA\-1 再 base64。这一步纯粹是为了防止「老代理 / 缓存把握手当普通 HTTP 处理」。

收到 101 之后握手完成，**同一条 TCP 上开始走 WebSocket 帧**。

### 帧格式（粗略了解就行）

每条消息分一个或多个 frame，最小头部 2 字节：

```Plain Text
+-+-+-+-+-------+-+-------------+-------------------------------+
|F|R|R|R| opcode|M| Payload len |    Extended payload length    |
|I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
|N|V|V|V|       |S|             |   (if payload len==126/127)   |
| |1|2|3|       |K|             |                               |
+-+-+-+-+-------+-+-------------+-------------------------------+
| Masking-key (if MASK set, 4 bytes)                            |
+---------------------------------------------------------------+
|                          Payload Data                         |
```

opcode 重点几个：

- `0x1` 文本帧（UTF\-8）

- `0x2` 二进制帧

- `0x8` close 帧

- `0x9` ping 帧

- `0xA` pong 帧

**客户端发服务端必须 mask**（防中间设备误把 frame 当 HTTP），服务端发客户端不能 mask——库都帮你处理了，调试抓包时遇到 mask 别懵。

## 三、前端：原生 API 与封装

### 原生 API 四个回调

```JavaScript
const ws = newWebSocket('wss://example.com/chat');

ws.onopen = () => {
    console.log('connected');
    ws.send(JSON.stringify({ type: 'hello' }));
};
ws.onmessage = (e) => {
    console.log('recv:', e.data);     *// 字符串或 Blob/ArrayBuffer*
};
ws.onerror = (e) => {
    console.error('error:', e);       *// 注意：浏览器出于安全不暴露细节*
};
ws.onclose = (e) => {
    console.log('closed:', e.code, e.reason);
};
```

`readyState` 四个状态：`CONNECTING(0)` / `OPEN(1)` / `CLOSING(2)` / `CLOSED(3)`。

发送前一定要判断：

```JavaScript
if (ws.readyState === WebSocket.OPEN) ws.send(data);
```

### 推荐封装：自动重连 \+ 心跳

裸 WebSocket 没有重连、没有心跳、没有消息队列，每个项目都要自己封一层。下面是一个最小可用版（TS）：

```TypeScript
interface Options {
    url: string;
    heartbeatInterval?: number;     *// 默认 30s*
    maxReconnectDelay?: number;     *// 最大退避，默认 30s*
    onMessage?: (data: any) =>void;
}

classReliableWS {
    privatews?: WebSocket;
    privateopts: Required<Options>;
    private reconnectAttempts = 0;
    privateheartbeatTimer?: number;
    private manualClose = false;
    privatequeue: string[] = [];

    constructor(opts: Options) {
        this.opts = {
            heartbeatInterval: 30_000,
            maxReconnectDelay: 30_000,
            onMessage: () => {},
            ...opts,
        };
        this.connect();
    }

    privateconnect() {
        this.ws = newWebSocket(this.opts.url);

        this.ws.onopen = () => {
            console.log('[ws] connected');
            this.reconnectAttempts = 0;
            this.startHeartbeat();
            *// 把离线期间排队的消息发出去*
            while (this.queue.length) this.ws!.send(this.queue.shift()!);
        };

        this.ws.onmessage = (e) => {
            *// 服务端心跳回包，丢弃*
            if (e.data === 'pong') return;
            this.opts.onMessage(e.data);
        };

        this.ws.onclose = () => {
            this.stopHeartbeat();
            if (!this.manualClose) this.reconnect();
        };

        this.ws.onerror = (e) =>console.error('[ws] error', e);
    }

    privatereconnect() {
        *// 指数退避 + jitter，避免雪崩*
        const base = Math.min(
            this.opts.maxReconnectDelay,
            1000 * Math.pow(2, this.reconnectAttempts++)
        );
        const jitter = Math.random() * 1000;
        const delay = base + jitter;
        console.log(`[ws] reconnect in ${delay}ms`);
        setTimeout(() =>this.connect(), delay);
    }

    privatestartHeartbeat() {
        this.heartbeatTimer = window.setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send('ping');         *// 业务层心跳*
            }
        }, this.opts.heartbeatInterval);
    }

    privatestopHeartbeat() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    }

    send(data: string) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(data);
        } else {
            this.queue.push(data);            *// 排队等连接恢复*
        }
    }

    close() {
        this.manualClose = true;
        this.ws?.close();
        this.stopHeartbeat();
    }
}
```

200 行内搞定四件事：自动重连（指数退避 \+ jitter）、心跳保活、消息队列、手动关闭区分。生产里换成成熟库：`reconnecting-websocket` / `robust-websocket`。

### socket\.io 不等于 WebSocket

很多人混淆，强调一下：**socket\.io 是一个带 fallback 的协议簇**，优先用 WebSocket，不行降级到 long polling。它有自己的帧格式（在 WebSocket payload 里又套了一层），**服务端必须用对应的 socket\.io 服务端**，原生 WebSocket 服务端连不上。

## 四、后端 demo

### Node\.js（ws 库）

```JavaScript
const { WebSocketServer } = require('ws');

const wss = newWebSocketServer({ port: 8080 });
const clients = newSet();

wss.on('connection', (ws, req) => {
    clients.add(ws);
    ws.isAlive = true;

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data) => {
        const msg = data.toString();
        if (msg === 'ping') { ws.send('pong'); return; }
        *// 广播*
        for (const c of clients) {
            if (c.readyState === 1) c.send(msg);
        }
    });

    ws.on('close', () => clients.delete(ws));
});

*// 服务端心跳：30s 没收到响应就断*
setInterval(() => {
    for (const ws of clients) {
        if (!ws.isAlive) { ws.terminate(); continue; }
        ws.isAlive = false;
        ws.ping();
    }
}, 30_000);
```

注意 Node\.js 的 `ws` 库支持**协议层 ping/pong**（`ws.ping()` 发的是 opcode 0x9 帧），但浏览器原生 WebSocket API 没有 `.ping()` 方法（见下一节）。

### Spring Boot

```Java
@Configuration
@EnableWebSocket
publicclassWsConfigimplementsWebSocketConfigurer {
    @Override
    publicvoidregisterWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(newChatHandler(), "/chat")
                .setAllowedOrigins("*");
    }
}

publicclassChatHandlerextendsTextWebSocketHandler {
    privatestaticfinal Set<WebSocketSession> SESSIONS = ConcurrentHashMap.newKeySet();

    @Override
    publicvoidafterConnectionEstablished(WebSocketSession session) {
        SESSIONS.add(session);
    }

    @Override
    protectedvoidhandleTextMessage(WebSocketSession session, TextMessage msg)throws Exception {
        for (WebSocketSession s : SESSIONS) {
            if (s.isOpen()) s.sendMessage(msg);
        }
    }

    @Override
    publicvoidafterConnectionClosed(WebSocketSession session, CloseStatus status) {
        SESSIONS.remove(session);
    }
}
```

Spring 内部用 Tomcat / Jetty / Undertow 的 WebSocket 支持，并发量大优先考虑 Netty 或 Reactor Netty。

### Go（gorilla/websocket）

性能口碑好，单机十万长连接没压力：

```Go
var upgrader = websocket.Upgrader{
    CheckOrigin: func(r *http.Request)bool { returntrue },
}

func chatHandler(w http.ResponseWriter, r *http.Request) {
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil { return }
    defer conn.Close()
    for {
        msgType, msg, err := conn.ReadMessage()
        if err != nil { break }
        conn.WriteMessage(msgType, msg)   *// echo*
    }
}
```

## 五、心跳：必须有，但要会设计

### 为什么需要心跳

TCP 自己也有 keepalive，但 Linux 默认 **2 小时**（`tcp_keepalive_time=7200`）才开始探测，远远晚于：

- 各种 NAT 设备 / 防火墙：默认 5\-15 分钟超时回收

- 云厂商 LB 空闲超时（**层不同默认差很多**）：

    - 阿里云 SLB / NLB / ALB：**七层 HTTP/HTTPS 默认 60s（可调到 4000s）；四层 TCP 默认 900s**

    - AWS ALB：默认 **60s**（可调 1\-4000s）

    - 腾讯云 CLB：**七层 60s、四层 900s**

- Nginx `proxy_read_timeout` 默认 **60s**

任何一段超时未通信，连接被中间设备静默断开（双方还以为活着，**直到下次发数据才知道 RST**）。所以业务层必须主动心跳。**经验值：心跳间隔取小于最近一层中间设备超时的一半**（默认 60s 超时就心跳 30s）。

### 谁发 / 多久一次

**推荐客户端主动发 ping，服务端回 pong，服务端兜底超时检测**。

间隔取经验值 **30 秒**（兼容主流 LB 60s 超时），间隔太短浪费电量 / 流量，太长心跳作用退化。

### 协议层 ping vs 业务层 ping

WebSocket 规范有专门的 ping/pong opcode（0x9 / 0xA），但**浏览器原生 WebSocket API 没有 **`.ping()`** 方法**——这是 W3C 故意设计的（避免应用滥用）。

所以浏览器端心跳一般这么做：

```JavaScript
*// 简单：业务层发字符串*
ws.send('ping');
*// 服务端识别并回*
```

后端互相通信时（Node 当客户端）可以用协议层：

```JavaScript
ws.ping();         *// ws 库支持*
ws.on('pong', () => { */* alive */* });
```

## 六、断线重连：指数退避 \+ jitter

### 为什么必须有 jitter

万人在线时如果服务挂了重启，所有客户端如果按固定间隔 / 同一节奏重连，会**同时**打回来——叫**重连风暴**（thundering herd）。jitter 就是给每个客户端一个随机偏移，把重连流量摊到时间轴上。

公式：

```Plain Text
delay = min(maxDelay, base * 2^retries) + random(0, jitter)
```

- `base` 起步延迟，建议 1s

- `2^retries` 指数退避，第 N 次重连等更久

- `maxDelay` 上限，建议 30s（避免无限拖大）

- `random(0, jitter)` 抖动，建议 0\-1s

### 状态机

```Plain Text
CLOSED ──connect──→ CONNECTING ──   open  ──→ OPEN
   ↑                       │                         │
   │                      close                     close
   └──RECONNECTING ←───┘                        │
                      ↑                              │
                      └──────────────────┘
                          (close 后调度重连)
```

实战代码见第三节封装。

### 消息补偿

重连成功后，**离线期间未发出的消息**要补发（队列暂存）；**离线期间错过的服务端推送**要补推（客户端带 last\_msg\_id，服务端基于 id 回放）。

简单方案：客户端记下最后一条已收消息 id，重连时 query string 带上 `?last_id=xxx`，服务端从数据库 / Redis 拉取该 id 之后的消息推过去。

## 七、Nginx 反代 WebSocket：完整配置

**这是最容易抄错也最容易出问题的部分**，直接给完整版：

```Nginx
*# 定义 upstream*
upstream ws_backend {
    server 127.0.0.1:8080;
    server 127.0.0.1:8081;
    *# WebSocket 是长连接，建议用 ip_hash 或一致性 hash 保证粘性*
    *# ip_hash;*
    keepalive 64;
}

*# 全局变量：判断 Upgrade header 是否存在*
map$http_upgrade$connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    location /ws/ {
        proxy_pass http://ws_backend;

        *# ===== WebSocket 关键三行 =====*
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        *# ============================*

        *# 透传必要头部*
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        *# ===== 长连接超时（必改） =====*
        proxy_read_timeout 3600s;     *# 默认 60s 会强断空闲连接！*
        proxy_send_timeout 3600s;
        *# ============================*

        *# 关闭缓冲，消息低延迟透传*
        proxy_buffering off;
    }
}
```

**几个坑加粗强调**：

- **`proxy_http_version 1.1`**：必须，WebSocket 握手要求 HTTP/1\.1，Nginx 默认对后端走 1\.0

- **`proxy_read_timeout 3600s`**：**最高频踩坑**，默认 60s 没数据就断，业务心跳 30s 配 timeout 60s 风险高，建议直接调到 1 小时甚至 1 天

- **`proxy_buffering off`**：开了缓冲会有消息延迟，实时类场景必关

- `map $http_upgrade $connection_upgrade`：用 map 处理 `Connection` 头，普通请求保持 close 长连接逻辑，升级请求才发 upgrade

### wss（TLS）

如果 SSL 在 Nginx 终结（推荐），后端 `proxy_pass http://...`（不是 https），别 wss 一路走到底。客户端用 wss，到 Nginx 解密，转 ws 到后端，性能最佳。

## 八、常见问题排查

### 跨域

WebSocket **不走浏览器 CORS 检查**（CORS 是 fetch/XHR 的事），但服务端必须**手动校验 Origin 头**防 CSRF：

```JavaScript
const wss = new WebSocketServer({
    verifyClient: (info) => {
        const allowed = ['https://example.com', 'https://app.example.com'];
        return allowed.includes(info.origin);
    },
    port: 8080
});
```

### 关闭码对照

**1006 是最常见也最难排查**——它就是「连接断了但没走正常 close 流程」。常见原因：网络抖动、Nginx `proxy_read_timeout` 到期、LB 60s 空闲断、wss 证书过期。

### 经过 CDN 后断连

部分 CDN 默认不支持 WebSocket 或需要单独开通。开通后还要检查：

- 是否有长连接超时（多数 CDN 强制 60s）

- 是否需要走特定的端口或域名

**实在不行的方案**：WebSocket 流量不走 CDN，单独一个域名 `ws.example.com` 直接绑源站 LB。

### 鉴权三种姿势

子协议方式样例：

```JavaScript
const ws = new WebSocket('wss://example.com/chat', ['token.xxx-jwt-token-xxx']);
*// 服务端 Sec-WebSocket-Protocol 选中 token.xxx 子协议*
```

### 单机连接数受限

WebSocket 长连接对 fd 消耗大，上万连接要调（详见 `W9 文件句柄章节`）：

```Bash
*# /etc/security/limits.conf*
* soft nofile 100000
* hard nofile 100000

*# systemd service*
LimitNOFILE=100000
```

后端单进程能 hold 多少连接，按业务消息频率压测，**Node \+ ws 一般单实例 5\-10 万**，超过靠水平扩展。

## 写在最后

WebSocket 不复杂，难在**长连接的环境治理**：

1. **优先 SSE，必须双向才上 WebSocket**——选型先问清楚业务

2. **Nginx 反代必加三行**（`proxy_http_version 1.1` \+ `Upgrade` \+ `Connection`）\+ 调大 `proxy_read_timeout`

3. **业务层心跳 30s**，浏览器原生 API 没法发协议 ping，用 message 模拟

4. **重连必须指数退避 \+ jitter**，否则万人在线挂一次重启服务就被打死

5. **关闭码 1006 = 异常断**，最常见的是 LB / Nginx 超时把连接干掉

6. **鉴权别用 query string 裸传 token**，要么子协议要么走 cookie

