# Changelog

## Unreleased

- feat: 双驱动架构——新增 `driver: cli`（默认）：spawn 本机 `cursor-agent -p --output-format stream-json`，复用 CLI 登录态，**无需 `CURSOR_API_KEY`**（实测 apiKeySource=login）；`driver: sdk` 保留 `@cursor/sdk` 路径（需要 Key）
- feat: 新增配置字段 `driver` / `cliPath` / `timeoutMs`（默认 600000 硬墙钟）；`model` 支持传 `auto`（cli 驱动）
- feat: CLI 流式事件解析（`parseCliEventLine`）+ 结果映射到既有摘要优先格式与闭集诊断线（超时/取消/认证分类）
- feat: **bundle 自带工具行**（`tool-subagent-cursor`）——`provider: cursor` / `toolName: subagent_cursor` / `maxDepth: provider-managed`；挂包即得完整能力，避免用户手写工具行踩坑
- docs: README/DESIGN 写明工具行硬契约——`maxDepth: provider-managed` 必须（cursor `depthLimit=false`，数字 maxDepth 挂载失败）；**禁止 `backgroundMode: continuable`**（one-shot）
- chore: scaffold 标准化接入——CI 工作流、验证链单源 `scripts/verify.mjs`、治理文档吸收模板条款
- test: fake 驱动契约覆盖扩至 22 例（cli finished/error/cancelled + 事件解析 + provider 转发）
- 验证：verify.mjs 验证链全绿 + check:deploy FAIL 0 + 真实 CLI 实机冒烟通过（登录态无 Key，summary/status/body 全链路正确）

## 0.1.0

- feat: Cursor one-shot subagent provider via `@cursor/sdk` (`create` / `send` / `wait` / `cancel`)
- feat: summary-first parent output (`formatForParent` + task result footer)
- feat: closed-set failure lines `cursor:<stage>/<category>`
- test: fake SDK contract coverage (completed / aborted / error / missing key)
- chore: 单库迁移（2026-09）——dsh-plugins monorepo → `NinjaSln-labs/dsh-subagent-cursor` 独立仓库（subtree split 保留历史）；peer 对齐宿主 alpha（cordis `^4.0.2` / dsh 宿主 `^0.1.2-alpha.4`，peer 与 devDependencies 同范围）；仓库规范化（LICENSE/CONTRIBUTING/SECURITY/DEVELOPMENT/PUBLISHING/双语 README）；check:deploy + pre-commit 部署纪律落地
- 回顾：顺利=对齐 `settleRunResult`/`subprocessRunHandle` 与 Claude Code 发布边界后，fake SDK TDD 一次过；坑=`resolveChildCwd` 要求真实目录导致初测用 `/tmp/workspace` 失败、包目录 `pnpm test` 可能 EPERM；是否流程缺陷=否（文档已写清用本地 vitest/tsc bin）
