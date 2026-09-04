# qwenwork2api

把**千问办公（QwenWork，gateway.qwenwork.cn）**转成 **OpenAI 兼容 API**，部署在 **EdgeOne Pages 边缘函数**上，账号与配置存 **KV**。

## 部署

### 创建项目

EdgeOne Nakers 控制台导入本目录（或 `edgeone upload` 直接上传）。

### 绑定 KV

控制台「存储 - KV」开通账户 → 创建命名空间（如 `qwenwork2api`）→ 在项目中绑定，**变量名填 `QWENWORK_KV`**（`edge-functions/_shared/config.js` 的 `KV_NAMES` 里也兼容 `qwenwork_kv` / `my_kv` / `KV` 等名字）。

### 定时保活（可选）

在 WebUI「设置」复制定时任务 Token，填入 `edgeone.json` 的 `schedules[0].payload.token` 后重新部署；或直接在控制台建定时任务指向 `/cron/keepalive`。未携带有效 token 时该端点只做无害的"临近过期才刷新"。

## 本地测试

```bash
npm test
```

## 限制

- 边缘函数请求 body 上限 **1MB**（超长上下文会被拒绝）。
- 单次执行 CPU 时间片 **200ms**（不含 I/O 等待）；签名计算约 <5ms，SSE 转换为逐帧解析。