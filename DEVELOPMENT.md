# dsh-subagent-cursor 开发流程（敏捷迭代版）

> 原则：**短迭代、增量交付、持续反馈、复盘沉淀**。插件开发不是一次性的瀑布工程，而是一连串小迭代——每个功能就是一个迭代，每个迭代结束都要交付可用的版本、收集反馈、复盘沉淀。
> 本仓库是 `dsh-subagent-cursor` 的**独立单库**（2026-09 从 dsh-plugins monorepo 迁出），仓库根即插件目录。
> 开发 → 验证 → 构建 → 发布的通用规范见 AGENTS.md / CONTRIBUTING.md；本文件聚焦本插件专属流程与部署纪律。
> **验证链单源**：`npm test` = `node scripts/verify.mjs`（build → typecheck → vitest，本地与 CI 同一入口）。

## 核心循环（一个迭代 = 一个功能）

```
Backlog ──Sprint 计划──▶ 设计决策 ──▶ 实现 ──▶ DoD 验证 ──▶ 交付试用 ──▶ 回顾
   ▲                                                                        │
   └────────────────── 反馈/新坑 进 Backlog 与速查表 ◀───────────────────────┘
```

- **迭代长度**：一个功能一个迭代；多个小功能可合并一个迭代
- **每迭代只做 1-2 条 Backlog**，做完并验证才进下一个——防止"半成品堆叠"

## 1. Backlog（产品待办，用户故事格式）

所有条目用用户故事写，**体验导向**：

```
作为 <用户>，我想要 <能力>，以便 <收益>
```

三类条目统一进 Backlog，按价值排序：功能 / 缺陷 / 技术债。

## 2. Sprint 计划（迭代开始，轻量）

- 从 Backlog 顶部取 1-2 条
- **只做必要的设计决策**（不是全套设计文档）：
  - 平台与边界：host 各模块职责（`provider` / `run` / `sdk` / `failure` / `result-format`）
  - 契约预检：`cordis_inspect_query` 查清用到的 Service/Event 精确签名（本插件走 `ctx.subagents` 提供方契约与 `@deepseek-ai/dsh-subagent` 的 `SubagentProvider` / `settleRunResult` / `subprocessRunHandle`）
  - 数据流与生命周期：谁创建 SDK agent、谁 cancel、谁 teardown、停止/取消时清理什么
  - 边界条件：空 prompt / 无 apiKey / 信号中止 / SDK 错误分类 / 清理失败

## 3. 实现

编码规范（本插件是静态 TS，遵循仓库 tsconfig strict）：

- 纯函数驱动优先（`failure` / `result-format` / `prompt` 无宿主依赖，可独立单测）
- SDK 门面可注入（`createAgent`），测试用 fake SDK，不触网、无需 `CURSOR_API_KEY`
- 错误诊断线走闭集 `cursor:<stage>/<category>`，**从不回显凭据/完整 stderr**

## 4. DoD（Definition of Done）——每迭代必须全部满足

> 没有验证 = 没有做完。

### 功能 DoD
- [ ] 用户故事描述的行为可复现
- [ ] 端到端验收任务跑通（如：`subagent_cursor` 工具委派 → 摘要优先结果返回）
- [ ] 边界条件处理明确（空 / 并发 / 超时 / 取消 / 清理失败）

### 质量 DoD（AI 风险检查）
- [ ] `npm run build` + `npm run typecheck` 通过
- [ ] 无 sandbox 禁用全局（grep setTimeout/fetch/require/process/Buffer）
- [ ] 所有宿主契约有依据（无猜的 API）
- [ ] 生命周期可逆（cancel/teardown 后无残留）
- [ ] 错误诊断不泄露凭据

### 文档 DoD
- [ ] README（双语）更新
- [ ] PUBLISHING.md 版本历史一行记录（做了什么 + 为什么）
- [ ] 新坑已进速查表（若无则不勾）

## 5. 交付与反馈

- 交付 = 一个可运行的版本 + 一句话变更说明
- **让用户立即试用**：给一条可直接复制的命令
- 用户的每个反馈都登记，不满意点优先转成 Backlog 缺陷条目

## 6. 回顾（Retrospective，每迭代 5 分钟）

三个问题，答案必须落盘（写进 PUBLISHING.md 或速查表）：

1. **这次什么顺利？**（保留的做法）
2. **这次踩了什么坑？**（新坑 → 立即进速查表）
3. **同类坑是否重复出现 ≥2 次？**（是 = 流程缺陷，先补流程再继续）

## 部署纪律：profile 安装（2026-08-31 事故沉淀，2026-09 单库化适配）

> 事故：本地改了源码并 build，但 profile 里装的仍是 registry 旧版——**同版本号、不同内容**，版本校验完全失效，行为错位极难排查。

### 统一规则

| 插件状态 | profile 安装方式 |
|---|---|
| 联调中（本目录有未提交改动） | `file:` 指向本目录源码目录 |
| 已入库、未发版 | `file:` 指向本目录（仓库根即插件） |
| 已发版且本目录 lib == 部署 lib | registry `^x.y.z` |

安装一律走官方入口（禁裸 npm install——npm 会把 peerDependencies 装进 profile，产生第二套 `@deepseek-ai/*`）：

```bash
dsh plugin --profile web install
```

### 装后自检（每次 install 后必跑）

```bash
npm run check:deploy     # 全量（本单库即一个插件，等价 --pkg dsh-subagent-cursor）
```

FAIL 条件：① registry 安装且与本目录 lib 有差异；② profile 内 `@deepseek-ai/` 出现非 cosmokit/schemastery 包；③ `file:` 安装为软链，或源码 lib ≠ 部署 lib。

### 强制执行（git hook）

pre-commit 钩子（`.githooks/pre-commit`）：提交涉及 `src/`、`scripts/` 改动时自动跑 `check:deploy`，FAIL 拒绝提交。启用：

```bash
git config core.hooksPath .githooks
```

中间态确需跳过时用 `git commit --no-verify`，并注明"未部署，部署前需自检"。

### 关键认知

- **版本号相同 ≠ 内容相同**：registry 包只在"发版→立即重装"闭环里可信；脱离闭环一律降级为 file: 直装
- peer 永远由宿主 dsh 提供（fallback 在 `~/.dsh/profiles/node_modules/@deepseek-ai/`），profile 内不装宿主核心包；`npm ls` 报 missing peer 属预期
- **单库化说明**：monorepo 时代的 `pnpm-workspace.yaml` 及 `overrides` 是**多包 workspace 防双实例护栏**，本单库只有单一包、不是 workspace，**不需要** pnpm-workspace.yaml/overrides——peer 版本兼容由宿主 dsh 单点决定，peerDependencies 声明实际需求即可
- `file:` 场景禁止手动软链：Node 按 realpath 解析会脱离 profile 的宿主 fallback

## 附录：高频坑速查表（回顾沉淀）

| 坑 | 症状 | 拦截环节 |
|---|---|---|
| 单库 npm test 缺宿主 peer | `Cannot find package '@deepseek-ai/dsh-*'` | 单库化把运行时可达的宿主 peer 包显式加进 devDependencies（参照 dsh-subagent-router 全量写法） |
| `resolveChildCwd` 要求真实目录 | 初测用不存在的 cwd 失败 | 测试用真实 `process.cwd()` |
| 包目录 `pnpm test` 可能 EPERM | 权限错误 | 用本地 `node_modules/.bin/vitest` / `tsc` |
| 改了源码没发版仍 registry 装 | 同版本号不同内容 | `npm run check:deploy` + pre-commit 硬拦截 |
| 错误诊断泄露凭据 | 安全风险 | `failure.ts` 闭集诊断线，不回显凭据/完整 stderr |

## 维护

- 速查表 = 回顾的沉淀物，新坑先补表再修码
- 流程本身也要迭代：回顾中发现"清单没拦住"的坑 → 改清单
