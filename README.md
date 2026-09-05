# dsh-subagent-cursor

[English](README.en.md) | 简体中文（中文为准，英文翻译可能滞后）

[![npm version](https://img.shields.io/npm/v/dsh-subagent-cursor)](https://www.npmjs.com/package/dsh-subagent-cursor)
[![License](https://img.shields.io/npm/l/dsh-subagent-cursor)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/NinjaSln-labs/dsh-subagent-cursor?style=social)](https://github.com/NinjaSln-labs/dsh-subagent-cursor)

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Cursor-as-subagent 提供方插件：一次本地 one-shot Cursor 查询、摘要优先的结果展示、可无人值守的 Profile Bundle。

- **Subagent 提供方** — 向 `ctx.subagents` 注册一个提供方（默认名 `cursor`），每次运行是一次父会话 cwd 下的本地 one-shot Cursor 查询。
- **双驱动** — 默认 `driver: cli`：spawn 本机 `cursor-agent -p`，复用 CLI 登录态，**无需 `CURSOR_API_KEY`**；可选 `driver: sdk`：走 `@cursor/sdk`（需要 Key）。
- **宿主平面 Profile Bundle** — 与官方 Claude Code / Codex 提供方同族；对模型可见的工具由独立的 `dsh-tool-subagent` 行提供并指定本提供方。
- **摘要优先结果** — 软解析 + summary / `<details>` 呈现，父代理一眼看到结论。

## 安装

```bash
dsh plugin add dsh-subagent-cursor
```

本插件注册一个 `ctx.subagents` 提供方（默认名 `cursor`）。每次运行是一次父会话 cwd 下的本地 one-shot Cursor 查询。属于 host 平面的 Profile Bundle，与官方 Claude Code / Codex 提供方同族；对模型可见的工具由独立的 `dsh-tool-subagent` 行提供并指定本提供方。

### 最小启用

本插件的 **bundle 自带正确的工具行**（`tool-subagent-cursor`：`provider: cursor` / `toolName: subagent_cursor` / `maxDepth: provider-managed`），在 Profile Bundle / 部署配置的 bundles 清单挂上本包即可，**无需手写工具行**：

```yaml
# profile package.json → dsh.profile.bundles（或在 plugins 清单挂包）
- package: dsh-subagent-cursor
```

**若要自定义工具名 / 覆盖配置**，手写 `dsh-tool-subagent` 行时必须遵守两个硬契约（违反任一都会挂载即崩）：

```yaml
plugins:
  - package: dsh-subagent-cursor
    config:
      providerName: cursor
      # model: auto                   # 可选；默认 auto（CLI 侧自动选模型）
      # cliPath: cursor-agent        # 可选；默认从 PATH 解析 cursor-agent
      # driver: cli                  # 默认 cli（登录态，无 Key）；sdk 需要 CURSOR_API_KEY
  - package: dsh-tool-subagent
    config:
      provider: cursor
      toolName: subagent_cursor
      maxDepth: provider-managed     # 必须！cursor 是 out-of-process provider（depthLimit=false）
                                     # 数字 maxDepth（默认 3）会挂载失败：provider cannot enforce maxDepth
      # 禁止设置 backgroundMode: continuable —— Cursor 运行是一次性 one-shot，不支持 continuable
```

默认 `driver: cli` 要求本机已安装并登录 `cursor-agent` CLI（`cursor-agent login`），不需要 API Key。`driver: sdk` 需要 `CURSOR_API_KEY`（Cursor Dashboard → API Keys）。单测用 fake 驱动，不触网、两者都不依赖。

> **就绪检测**：每次委派前插件自动检查 CLI 是否已安装且已登录（调用 `cursor-agent status` 解析其输出，**不读取你的凭据**）。未安装或未登录时返回带修复指引的明确错误，而非黑盒失败：
> - 未安装：`找不到 cursor-agent CLI … 安装：curl https://cursor.com/install -fsS | bash`（或配置 `cliPath`）
> - 未登录：`cursor-agent 未登录 … 登录：cursor-agent login`

## 配置

| 字段 | 默认 | 含义 |
|---|---|---|
| `providerName` | `cursor` | 注册到 `ctx.subagents` 上的提供方名 |
| `driver` | `cli` | 执行后端：`cli`（本机登录态）或 `sdk`（`@cursor/sdk` + Key） |
| `model` | `auto` | 传给驱动的 Cursor 模型 id；`auto` = CLI 侧自动选模型 |
| `env` | `{}` | 叠加在凭据清洗后的父 env 之上的显式环境；`driver: sdk` 时在此提供 `CURSOR_API_KEY` |
| `cliPath` | `cursor-agent` | CLI 可执行文件路径（`driver: cli`） |
| `timeoutMs` | `600000` | 单次运行硬墙钟上限（ms，`driver: cli`） |
| `disposeGraceMs` | `3000` | 关闭等待的正向宽限（ms） |

## 为什么用本地 one-shot

每次委派都是父会话 cwd 下的独立 Cursor 查询，天然隔离、不污染父上下文；CLI / SDK 驱动门面均可注入（`createRun` / `createAgent`），单测用 fake 驱动，不触网、无需 `CURSOR_API_KEY`。

## 开发

```bash
npm ci --legacy-peer-deps
npm run build       # tsc → lib/
npm run typecheck   # 严格类型检查
npm test            # vitest：fake SDK 契约覆盖（completed / aborted / error / missing key）
```

详见 [DEVELOPMENT.md](DEVELOPMENT.md) 与 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 设计

完整设计笔记（模块职责、SDK 契约、错误分类、结果格式）见 [`docs/DESIGN.md`](docs/DESIGN.md)；后续路线图见 [`docs/ROADMAP.md`](docs/ROADMAP.md)。

## ⭐ 支持

如果这个插件对你有帮助，欢迎到 [GitHub 仓库](https://github.com/NinjaSln-labs/dsh-subagent-cursor) 点个 ⭐ Star——它是我持续维护的动力。也欢迎提 issue / PR 一起改进。

## License

[MIT](LICENSE)
