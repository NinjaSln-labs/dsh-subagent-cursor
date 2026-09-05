# 发布记录：dsh-subagent-cursor

**发布状态（2026-09 单库化）：** 尚未发布到 npm（`npm view dsh-subagent-cursor` 为 E404）。

> 本仓库 2026-09 从 dsh-plugins monorepo 迁出为独立单库（`NinjaSln-labs/dsh-subagent-cursor`），
> 仓库根即插件目录。首次发布即在本单库完成。

| 项 | 状态 |
|---|---|
| npm | ⏳ 未发布（首发待配 Trusted Publisher 后走 OIDC） |
| GitHub | ✅ 单库 `NinjaSln-labs/dsh-subagent-cursor`（public，subtree split 保留历史） |
| profile | `~/.dsh/profiles/web` 部署按 DEVELOPMENT.md 纪律（未发版 = `file:` 直装） |
| 发布管道 | ⏳ tag → 版本守卫 → 验证链 → OIDC trusted publishing 直发（待配置） |

## 版本历史

- **0.1.0** — **单库化后首个版本（首发）**：
  - 单库迁移：dsh-plugins monorepo → `NinjaSln-labs/dsh-subagent-cursor` 独立仓库（subtree split 保留历史）
  - 仓库规范化：LICENSE / CONTRIBUTING / SECURITY / DEVELOPMENT / PUBLISHING / 双语 README；check:deploy + pre-commit 部署纪律落地
  - peer 对齐宿主 alpha：cordis `^4.0.2` / 其余 dsh 宿主包 `^0.1.2-alpha.4`（peer 与 devDependencies 同范围）
  - 验证：strict typecheck + vitest（fake SDK 契约覆盖）+ build 全绿

## 发布后验证（共性纪律）

- 确认 latest 已更新（`npm view dsh-subagent-cursor version`）
- provenance/attestations 徽章（npmjs 包页可见；OIDC 签发）
- 实机重装路径实测一遍：README 安装命令 → `npm run check:deploy` PASS

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
