# dsh-subagent-cursor

[简体中文](README.md) | English (Chinese is authoritative; English may lag)

[![npm version](https://img.shields.io/npm/v/dsh-subagent-cursor)](https://www.npmjs.com/package/dsh-subagent-cursor)
[![License](https://img.shields.io/npm/l/dsh-subagent-cursor)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/NinjaSln-labs/dsh-subagent-cursor?style=social)](https://github.com/NinjaSln-labs/dsh-subagent-cursor)

Cursor-as-subagent provider for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): one-shot local Cursor runs, summary-first result presentation, unattended Profile Bundle.

- **Subagent provider** — registers a provider on `ctx.subagents` (default name `cursor`); each run is a one-shot local Cursor task in the parent session cwd: the child has full agent tools (read/write files, shell, web — bounded by the Cursor permission set) and completes one self-contained task before returning.
- **Dual driver** — default `driver: cli` spawns the local `cursor-agent -p` using its login state, **no `CURSOR_API_KEY` needed**; optional `driver: sdk` uses `@cursor/sdk` (requires a key).
- **Host-plane Profile Bundle** — same family as the official Claude Code / Codex providers; model-facing tools are provided by separate `dsh-tool-subagent` rows that name this provider.
- **Summary-first results** — soft parsing with summary / `<details>` presentation, so the parent agent sees the conclusion at a glance.

## Install

```bash
dsh plugin add dsh-subagent-cursor
```

This plugin registers a `ctx.subagents` provider (default name `cursor`). Each run is a one-shot local Cursor task execution in the parent session cwd — the child completes one self-contained task with full agent tools (read/write, shell, web, bounded by the Cursor permission set) and leaves no resumable session. It is a host-plane Profile Bundle in the same family as the official Claude Code / Codex providers; model-facing tools are provided by separate `dsh-tool-subagent` rows that name this provider.

### Minimal enablement

The plugin's **bundle ships the correct tool row** (`tool-subagent-cursor`: `provider: cursor` / `toolName: subagent_cursor` / `maxDepth: provider-managed`); mount the package in the profile bundle list and you're done — **no hand-written tool row needed**:

```yaml
# profile package.json → dsh.profile.bundles (or mount the package in your plugins list)
- package: dsh-subagent-cursor
```

**To customize the tool name / override config**, hand-writing a `dsh-tool-subagent` row must obey two hard contracts (violating either fails the mount):

```yaml
plugins:
  - package: dsh-subagent-cursor
    config:
      providerName: cursor
      # driver: cli                  # default; uses local CLI login, no key
  - package: dsh-tool-subagent
    config:
      provider: cursor
      toolName: subagent_cursor
      maxDepth: provider-managed     # REQUIRED! cursor is out-of-process (depthLimit=false)
                                     # a numeric maxDepth (default 3) fails mount: provider cannot enforce maxDepth
      # DO NOT set backgroundMode: continuable — Cursor runs are one-shot; continuable is unsupported
```

Default `driver: cli` requires a logged-in local `cursor-agent` CLI (`cursor-agent login`) and no API key. `driver: sdk` requires `CURSOR_API_KEY` (Cursor Dashboard → API Keys). Unit tests use fake drivers and need neither.

> **Readiness check**: before each delegation the plugin checks the CLI is installed and logged in (runs `cursor-agent status` and parses its output — **your credentials are never read**). Missing install or login returns an explicit error with fix guidance instead of a black-box failure:
> - Not installed: `cursor-agent CLI not found … install: curl https://cursor.com/install -fsS | bash` (or set `cliPath`)
> - Not logged in: `cursor-agent not logged in … login: cursor-agent login`

> **Permission auto-provision** (`autoPermissions: true`, default): on mount the plugin ensures the global `~/.cursor/cli-config.json` carries a sensible default permission set (read files, git, node/npm, web docs, in-project writes). Creates the file if missing, or appends only missing entries (your custom allow/deny untouched; automatic backup before write). Sensitive surfaces are denied by default (`.env`, keys, certs). Disable with `autoPermissions: false`.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `providerName` | `cursor` | Provider name registered on `ctx.subagents` |
| `driver` | `cli` | Execution backend: `cli` (local login state) or `sdk` (`@cursor/sdk` + key) |
| `model` | `auto` | Cursor model id passed to the driver; `auto` lets the CLI pick |
| `env` | `{}` | Explicit environment layered over the credential-scrubbed parent env; supply `CURSOR_API_KEY` here for `driver: sdk` |
| `cliPath` | `cursor-agent` | CLI executable path (`driver: cli`) |
| `timeoutMs` | `600000` | Hard wall-clock limit per run (ms, `driver: cli`) |
| `disposeGraceMs` | `3000` | Positive grace (ms) for teardown waits |
| `autoPermissions` | `true` | Provision/merge the Cursor CLI permission set on mount (create or append-only merge) |

## Why local one-shot

Each delegation is an independent Cursor task execution in the parent session cwd — naturally isolated, never polluting the parent context. The child has full tools (read/write files, shell, web, bounded by the permission set), completes its task in one session, then is cleaned up. Both driver facades are injectable (`createRun` / `createAgent`); unit tests use fakes, touch no network, and need no `CURSOR_API_KEY`.

## Development

```bash
npm ci --legacy-peer-deps
npm run build       # tsc → lib/
npm run typecheck   # strict typecheck
npm test            # vitest: fake SDK contract coverage (completed / aborted / error / missing key)
```

See [DEVELOPMENT.md](DEVELOPMENT.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Design

Full design notes (module responsibilities, SDK contract, error classification, result format) live in [`docs/DESIGN.md`](docs/DESIGN.md); the roadmap is in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## ⭐ Support

If this plugin helps you, give it a ⭐ on the [GitHub repo](https://github.com/NinjaSln-labs/dsh-subagent-cursor) — it keeps me maintaining it. Issues / PRs are welcome too.

## License

[MIT](LICENSE)
