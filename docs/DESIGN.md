# dsh-subagent-cursor — Design

Status: Sprint 0 landed + 双驱动（2026-09-05）  
Version: 0.1.0（可委派 one-shot provider；未 npm publish）

## Problem

DSH 父代理需要把仓库内编码任务委派给 **Cursor 子代理**。官方已有 `codex` / `claude-code` / `acp`；缺少 Cursor。

## Decision: path B（双驱动）

专用 Profile Bundle `dsh-subagent-cursor`，注册 `ctx.subagents` provider（默认 `cursor`），经 `dsh-tool-subagent` 暴露工具。

**Bundle 自带 provider 行 + 工具行**（`cordis.patch.yml` insert）：`tool-subagent-cursor`（`provider: cursor` / `toolName: subagent_cursor` / `maxDepth: provider-managed`）——用户挂包即得完整能力，不手写工具行。

工具行硬契约（宿主 `dsh-tool-subagent` 校验，违反即挂载失败）：
- `maxDepth: 'provider-managed'` **必须**——cursor 是 out-of-process provider，`capabilities.depthLimit=false`；数字 maxDepth（工具默认 3）报 `provider "cursor" cannot enforce maxDepth`
- **禁止 `backgroundMode: continuable`**——Cursor 运行是一次性 one-shot；不设即默认 one-shot

## Domain boundary

| 概念 | 含义 |
|---|---|
| 委派 | 父代理提交自包含文本任务 |
| Cursor 子代理 | 父 session `cwd` 上的 one-shot local Cursor agent |
| 结果 | summary 优先展示的最终文本 |
| 交接质量 | provider SLA |
| 执行到位 / 正确性 | 父代理 / 验收门，非本包 SLA |

`inheritsParentContext: false`。不宣称 start-time capabilities。

## Runtime（双驱动）

- **cli（默认）**：spawn 本机 `cursor-agent -p --output-format stream-json --trust`；认证 = CLI 登录态（无需 `CURSOR_API_KEY`）
- **sdk（可选）**：`@cursor/sdk` local；`Agent.create` + `send` + `wait`（可 cancel）；鉴权 = `config.env.CURSOR_API_KEY`

### 配置字段

| 字段 | 默认 | 说明 |
|---|---|---|
| `providerName` | `cursor` | `ctx.subagents` 注册名 |
| `driver` | `cli` | 执行后端：`cli`（登录态）/ `sdk`（`@cursor/sdk` + Key） |
| `model` | `auto` | Driver model id（cli 驱动 `auto` = CLI 侧自动选模型） |
| `env.CURSOR_API_KEY` | （空） | 仅 `driver: sdk` 需要；缺则 start 在 publication 前 reject（`query-start/auth`） |
| `cliPath` | `cursor-agent` | CLI 可执行路径（`driver: cli`） |
| `timeoutMs` | `600000` | 单次运行硬墙钟上限（`driver: cli`） |
| `disposeGraceMs` | `3000` | 保留的 teardown 时序参数（正有限数） |

## Sprint 0 落地

| 步骤 | 行为 |
|---|---|
| cwd | `resolveChildCwd('dsh-subagent-cursor', configured?, parent.session.header.cwd)` |
| create | cli：spawn `cursor-agent`；sdk：可注入 `createSdkAgent` → 默认 `Agent.create({ apiKey, model: { id }, local: { cwd } })` |
| send | 用户文本 + `wrapTaskPrompt` footer → agent.send / cli 子进程 |
| settle | `handle.wait()` 与 `signal` abort race；abort → cancel（若支持） |
| map | 见下表 |
| publish | `settleRunResult` + `subprocessRunHandle`；`dispose` 幂等 |

### 结果映射

| 来源状态 | `SubagentResult.stopReason` | 父可见 output |
|---|---|---|
| SDK `finished` / cli `finished` | `completed` | `formatForParent(parseResultText(result))` |
| SDK `cancelled` / cli `cancelled` | `aborted` | `cursor:query-run/cancelled[; run=…]` |
| SDK `error` / cli `error`（超时/崩溃/认证） | `error` | `cursor:<stage>/<category>` 行 + 短详情（无密钥） |

## Result format

软契约 + 展示硬规则（summary 外露，body 折叠）。缺标签不 fail seam。

## Quality split

Provider = 交接可靠。父代理 = 「起码做了」。更外层 = 做对。
