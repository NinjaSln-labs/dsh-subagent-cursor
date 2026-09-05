# AGENTS（AI 协作与工程纪律）

## 项目概览

DeepSeek Harness 的 Cursor-as-subagent 提供方插件：一次本地 one-shot `@cursor/sdk` 运行、摘要优先的结果展示、可无人值守的 Profile Bundle。仓库根即工程根；分支、提交、验证、发版规范见下与 CONTRIBUTING.md。

## 提交规范

- **Conventional Commits 前缀 + 中文描述**：`feat(scope):` / `fix(scope):` / `refactor:` / `docs:` / `test:` / `chore:`；scope 用模块名；发布提交固定 `chore: release v<版本> — <一句话主旨>`。
- **提交前必须跑本仓验证链单源**（`node scripts/verify.mjs`，即 `npm test`）并全绿；CI 与本地同源。FAIL 修根因，不绕过；确需 `--no-verify` 必须在提交说明注明原因。

## AI 协作守则（agent 贡献者必读）

1. **不猜 API/契约**：写代码前用宿主/依赖的检查工具查精确签名；测试 stub 必须按真实契约形状写（失真的 stub 会掩盖契约 bug）。
2. **完成的定义 = 验证链全绿 + 实机/测试验收**，不是"代码写完"；声称完成前附验证输出。
3. **机密红线**：本机绝对路径、个人邮箱、token/密钥、会过时的部署实况描述一律不入库；提交前 `git grep` 自查。属本机特有的配置文件（如 `.githooks/commit-msg`）只留本地并 ignore；末尾目录名（无完整路径）不构成泄露。
4. **不静默绕过门禁**：pre-commit/CI FAIL 先修根因；中间态确需跳过必须留痕注明。
5. **改动最小化**：不顺手重构、不改无关文件；构建产物不入库、锁文件必须入库。
6. **文档同步**：行为/接口变化同步 README、DEVELOPMENT.md、CHANGELOG（如有）。
7. **冲突处理**：用户显式指示优先于本文件，但需在 PR/提交说明中标注冲突点。

## 安全考虑

- 漏洞**不要**公开披露：走 SECURITY.md 指定的私密漏洞报告渠道。
- 引入新依赖需在 PR 说明中给出理由。

## 部署纪律（本插件单库适用，硬性）

全文与事故背景见仓库根 `DEVELOPMENT.md`「部署纪律：profile 安装」，核心规则：

1. 改了本插件源码（`src/`、`lib/`）未发版 → profile 必须以 `file:` 指向本目录安装，禁止留在 registry 安装（同版本号不同内容，版本校验失效）。
2. 安装一律走 `dsh plugin --profile web install`，禁裸 `npm install`。
3. 每次 install / build 后必跑：`npm run check:deploy`（本单库即一个插件，无需 --pkg；FAIL 必须修复）。
4. `file:` 场景禁止手动软链。
5. 本机私有信息不入库（详见上方 AI 协作守则第 3 条）。

> 单库说明：本仓库 2026-09 从 dsh-plugins monorepo 迁出，仓库根即插件目录。monorepo 时代的根级 `pnpm-workspace.yaml` + `overrides`（多包防双实例护栏）**本单库不需要**（单一包非 workspace）；peer 版本兼容由宿主 dsh 决定，peerDependencies 如实声明即可。git 钩子在 `.githooks/`（启用：`git config core.hooksPath .githooks`）。
