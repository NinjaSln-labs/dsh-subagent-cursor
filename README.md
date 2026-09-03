# dsh-subagent-cursor

[English](README.en.md) | 简体中文

[![npm version](https://img.shields.io/npm/v/dsh-subagent-cursor)](https://www.npmjs.com/package/dsh-subagent-cursor)
[![GitHub stars](https://img.shields.io/github/stars/NinjaSln-labs/dsh-subagent-cursor?style=social)](https://github.com/NinjaSln-labs/dsh-subagent-cursor)

> 中文为本仓库权威文档；[English](README.en.md) 翻译可能滞后。

把 Cursor 当作 DeepSeek Harness 子代理提供方的插件：一次本地 one-shot `@cursor/sdk` 运行、摘要优先的结果展示、可无人值守的 Profile Bundle。设计见 [docs/DESIGN.md](./docs/DESIGN.md)，路线图见 [docs/ROADMAP.md](./docs/ROADMAP.md)。

## 安装

```bash
dsh plugin add dsh-subagent-cursor
```

本插件注册一个 `ctx.subagents` 提供方（默认名 `cursor`）。每次运行是一次父会话 cwd 下的本地 one-shot `@cursor/sdk` 查询。属于 host 平面的 Profile Bundle，与官方 Claude Code / Codex 提供方同族；对模型可见的工具由独立的 `dsh-tool-subagent` 行提供并指定本提供方。

## 最小启用

在 Profile Bundle / 部署配置中挂上本包，并暴露 tool-subagent 行（工具名可自定）：

```yaml
plugins:
  - package: dsh-subagent-cursor
    config:
      providerName: cursor
      model: composer-2.5
      env:
        CURSOR_API_KEY: ${CURSOR_API_KEY}
  - package: dsh-tool-subagent
    config:
      tools:
        - name: subagent_cursor
          provider: cursor
```

需要本机有效的 `CURSOR_API_KEY`（Cursor Dashboard → Integrations）。单测用 fake SDK，不依赖 Key。

## 配置

| 字段 | 默认 | 含义 |
|---|---|---|
| `providerName` | `cursor` | 注册到 `ctx.subagents` 上的提供方名 |
| `model` | `composer-2.5` | 传给 SDK 的 Cursor 模型 id |
| `env` | `{}` | 叠加在凭据清洗后的父 env 之上的显式子进程/SDK 环境；在此提供 `CURSOR_API_KEY` |
| `disposeGraceMs` | `3000` | 关闭等待的正向宽限（ms） |

## 开发

```bash
npm ci --legacy-peer-deps
npm run build       # tsc → lib/
npm run typecheck   # 严格类型检查
npm test            # vitest：fake SDK 契约覆盖（completed / aborted / error / missing key）
```

详见 [DEVELOPMENT.md](DEVELOPMENT.md) 与 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License

[MIT](LICENSE)
