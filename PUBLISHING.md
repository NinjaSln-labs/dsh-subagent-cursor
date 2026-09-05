# 发布记录：dsh-subagent-cursor

**发布状态（2026-09-06）：** ✅ **已发布** `0.1.0`（npm latest）。首发用一次性 publish token（npm Trusted Publishing 不支持首发，见下方 bootstrap 记录）；后续版本待配 Trusted Publisher 后走 OIDC git 管道。

> 本仓库 2026-09 从 dsh-plugins monorepo 迁出为独立单库（`NinjaSln-labs/dsh-subagent-cursor`），
> 仓库根即插件目录。首次发布即在本单库完成。

| 项 | 状态 |
|---|---|
| npm | ✅ `0.1.0`（latest，2026-09-06 首发） |
| GitHub | ✅ 单库 `NinjaSln-labs/dsh-subagent-cursor`（public，subtree split 保留历史） |
| profile | `~/.dsh/profiles/web` 部署按 DEVELOPMENT.md 纪律（已发版可切 registry，仍 file: 也可） |
| 发布管道 | ⏳ tag → 版本守卫 → 验证链 → OIDC（Trusted Publisher 待配） |

## 版本历史

- **0.1.0** — **正式首发（2026-09-06，npm registry）**：
  - 单库迁移 + 仓库规范化 + peer 对齐宿主 alpha + 验证链 13/13（见下历史行）
  - **双驱动架构**：cli 驱动默认（复用本机 cursor-agent 登录态，无需 CURSOR_API_KEY）+ sdk 可选
  - 就绪检测 / cliPath 回退 / 权限自动预生成 / 结果 Cursor 归属标记 / 默认同步（`backgroundMode: one-shot`）
  - 首次发布方式：一次性 publish token（bootstrap），非 OIDC——npm 要求包先存在才能配 Trusted Publisher
  - 验证：registry 下载实装可加载 + verify.mjs 全绿（41 测试）+ check:deploy PASS

## 首次发布记录（bootstrap，新包名专用）

> **npm Trusted Publishing 不支持首发**：包不存在时 npmjs.com 无页面可配 Trusted Publisher
> （[npm docs](https://docs.npmjs.com/trusted-publishers/) / npm/cli #8544）。全新包必须先传统方式发一次。

1. 生成**一次性 publish token**（npmjs → Access Tokens → Granular，限定本包、短期有效）
2. 写入 `~/.npmrc`（`//registry.npmjs.org/:_authToken=` + token）
3. `npm whoami` 验证 → `npm publish --access public`（会先跑 prepublishOnly build）
4. `npm view <pkg> version` 确认（registry 有 ~5s 传播延迟，稍候重查）
5. 发布后**立即删除 token**
6. 之后配置 Trusted Publisher → 后续版本走 OIDC git 管道

- **0.1.1** — **授权体系版（2026-09-06，OIDC 链路首发）**：approvalLevel 三档 / DSH 免问档自动授权 / 弹窗兜底+自动重发 / 权限集扩充；走 `cursor-v0.1.1` tag → OIDC publish 成功（provenance ✓）；途中修 publish.yml YAML（jobs 缺换行）。

## 发布后验证（共性纪律）

- 确认 latest 已更新（`npm view dsh-subagent-cursor version`）——已验证 `0.1.0` ✓
- provenance/attestations 徽章（OIDC 签发；首发为 token 方式无 provenance，待后续 OIDC 版本）
- 实机重装路径实测一遍：README 安装命令 → `npm run check:deploy` PASS（registry 下载实装可加载已验证）

## 发布流程（日常）

> 用显式两步而非 `npm version` 自动 commit+tag：npm version 默认打 `v%s` tag，与本库触发器
> `cursor-v*` 不符；且工作树脏时 npm 的自动 commit/tag 会被**静默跳过**。

```bash
# 本单库仓库根即插件目录
npm version patch --no-git-tag-version
V="$(node -p "require('./package.json').version")"
git add package.json package-lock.json && git commit -m "chore: release dsh-subagent-cursor v$V — <一句话主旨>"
git tag cursor-v$V
git push && git push --tags    # CI 验证（verify.mjs 单源）→ 版本守卫 → OIDC trusted publishing 发布
```

### canary 灰度通道（可选，先灰度再全量）

```bash
npm version prerelease --preid=next --no-git-tag-version
V="$(node -p "require('./package.json').version")"
git commit -am "chore: canary dsh-subagent-cursor v$V" && git tag cursor-v$V
git push && git push --tags    # publish.yml 对 prerelease 自动走 dist-tag next
# 实测通过 → 晋级 latest：npm dist-tag add dsh-subagent-cursor@x.y.z latest
```

首发前置：npmjs.com 为 `dsh-subagent-cursor` 配置 Trusted Publisher（Owner=`NinjaSln-labs` / Repo=`dsh-subagent-cursor` / Workflow=`publish.yml`），源仓库需 public（已满足）。配好前勿打 release tag。

## 维护规则

- 每个新版本发布后在本文件追加一条版本历史（一行式 + 关键细节），并在 `HANDOFF.md` §2 同步快照（本地私有，未追踪）
- 发布一律走 git 管道，不用手工 `npm publish`（bootstrap 例外仅限新包名首发）
