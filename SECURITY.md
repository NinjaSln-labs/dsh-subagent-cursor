# 安全策略

## 支持面

本插件在宿主 harness 内以**子代理提供方**身份工作：它接收父会话的 `@cursor/sdk` 的一次性本地运行，并把结果格式化后返回给父会话。安全边界值得关注的点：

- **凭据**：`CURSOR_API_KEY` 由配置的 `env` 显式提供，只在 `@cursor/sdk` 调用时使用；错误诊断线（`cursor:<stage>/<category>`）**从不回显原始凭据或完整 stderr**（见 `src/failure.ts`）。
- **子进程 cwd**：运行在父会话 cwd（或显式 `configuredCwd`）下，`resolveChildCwd` 要求目录真实存在。
- **任务文本**：只接受文本 prompt 块，拒绝空/非文本任务。
- **依赖**：运行时最小依赖 `@cursor/sdk`。

## 报告漏洞

若你发现漏洞或安全缺陷，**不要**公开 issue——到 GitHub 仓库 Security 标签页用私密漏洞报告（Private vulnerability reporting，首选）。

## 响应

- 确认收到后 72 小时内回复。
- 严重漏洞优先修复并发布补丁版本。
