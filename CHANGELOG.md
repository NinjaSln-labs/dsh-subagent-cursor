# Changelog

## 0.1.0

- feat: Cursor one-shot subagent provider via `@cursor/sdk` (`create` / `send` / `wait` / `cancel`)
- feat: summary-first parent output (`formatForParent` + task result footer)
- feat: closed-set failure lines `cursor:<stage>/<category>`
- test: fake SDK contract coverage (completed / aborted / error / missing key)
- chore: 单库迁移（2026-09）——dsh-plugins monorepo → `NinjaSln-labs/dsh-subagent-cursor` 独立仓库（subtree split 保留历史）；peer 对齐宿主 alpha（cordis `^4.0.2` / dsh 宿主 `^0.1.2-alpha.4`，peer 与 devDependencies 同范围）；仓库规范化（LICENSE/CONTRIBUTING/SECURITY/DEVELOPMENT/PUBLISHING/双语 README）；check:deploy + pre-commit 部署纪律落地
- 回顾：顺利=对齐 `settleRunResult`/`subprocessRunHandle` 与 Claude Code 发布边界后，fake SDK TDD 一次过；坑=`resolveChildCwd` 要求真实目录导致初测用 `/tmp/workspace` 失败、包目录 `pnpm test` 可能 EPERM；是否流程缺陷=否（文档已写清用本地 vitest/tsc bin）
