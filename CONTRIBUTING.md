# 贡献指南

感谢你愿意为 dsh-subagent-cursor 贡献！本仓库是一个独立单库（2026-09 从 dsh-plugins monorepo 迁出），仓库根即插件目录。

## 分支与合并

- **单维护者（默认）**：直接提交 main；push 即触发 CI 验证链；main 保持线性历史。
- **多人协作时**：feature 分支（`feat/<短名>` 或 `fix/<issue号>`）→ PR → CI 绿 + 评审通过后 squash 合并。

## 开发环境

```sh
npm ci --legacy-peer-deps   # peer 由宿主 dsh 在运行时提供，本仓库装 devDeps 供构建/测试
npm run build               # tsc → lib/
npm run typecheck           # 严格类型检查
npm test                    # 验证链单源入口：scripts/verify.mjs（build → typecheck → vitest）
```

测试套件用 fake `createAgent` 驱动真实的 `startCursorRun` 驱动路径，不触网、不需要 `CURSOR_API_KEY`。`package-lock.json` 必须生成并入库（CI 的 `npm ci` 依赖它）。

## 提交规范

- **Conventional Commits 前缀 + 中文描述**（改了什么 + 为什么）；完整规范见仓库 [AGENTS.md](AGENTS.md)。
- 涉及 `src/`、`scripts/` 改动会触发 pre-commit 部署纪律自检（`git config core.hooksPath .githooks` 启用）；确属未部署的中间态用 `--no-verify` 并在说明中注明。
- **机密红线**：本机绝对路径、个人邮箱、token、部署实况快照一律不入库（与 AGENTS.md 同源纪律）。

## 发版流程

见 [PUBLISHING.md](PUBLISHING.md)（显式 bump → tag → CI 验证 → OIDC trusted publishing 发布）。

## 行为准则

简单说：尊重、建设性、对事不对人。本仓库维护者会驳回不友善或与主题无关的 issue / PR。
