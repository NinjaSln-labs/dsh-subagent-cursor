# Changelog

## Unreleased

- （暂无——0.1.0 已发布，见下）

## 0.1.0（2026-09-06 首发 npm）

- feat: 双驱动架构——`driver: cli`（默认，spawn 本机 `cursor-agent` 登录态，无需 Key）+ `driver: sdk`（`@cursor/sdk`，需 Key）
- feat: cli 驱动就绪检测 + cliPath 回退 + CLI 权限自动预生成（`autoPermissions` 默认开）
- feat: bundle 自带工具行（`tool-subagent-cursor`，maxDepth: provider-managed / backgroundMode: one-shot）
- feat: 结果 Cursor 归属标记 + markdown 证据（无裸 HTML）+ 子代理残留标签净化
- feat: Cursor one-shot subagent provider via `@cursor/sdk` (`create` / `send` / `wait` / `cancel`)
- feat: summary-first parent output (`formatForParent` + task result footer)
- feat: closed-set failure lines `cursor:<stage>/<category>`
- test: fake SDK contract coverage (completed / aborted / error / missing key)
- chore: 单库迁移（2026-09）——dsh-plugins monorepo → `NinjaSln-labs/dsh-subagent-cursor` 独立仓库（subtree split 保留历史）；peer 对齐宿主 alpha（cordis `^4.0.2` / dsh 宿主 `^0.1.2-alpha.4`，peer 与 devDependencies 同范围）；仓库规范化（LICENSE/CONTRIBUTING/SECURITY/DEVELOPMENT/PUBLISHING/双语 README）；check:deploy + pre-commit 部署纪律落地
- 回顾：顺利=对齐 `settleRunResult`/`subprocessRunHandle` 与 Claude Code 发布边界后，fake SDK TDD 一次过；坑=`resolveChildCwd` 要求真实目录导致初测用 `/tmp/workspace` 失败、包目录 `pnpm test` 可能 EPERM；是否流程缺陷=否（文档已写清用本地 vitest/tsc bin）
