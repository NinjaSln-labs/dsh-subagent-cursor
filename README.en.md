# dsh-subagent-cursor

[简体中文](README.md) | English (Chinese is authoritative; English may lag)

[![npm version](https://img.shields.io/npm/v/dsh-subagent-cursor)](https://www.npmjs.com/package/dsh-subagent-cursor)
[![License](https://img.shields.io/npm/l/dsh-subagent-cursor)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/NinjaSln-labs/dsh-subagent-cursor?style=social)](https://github.com/NinjaSln-labs/dsh-subagent-cursor)

Cursor-as-subagent provider for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): one-shot local Cursor runs, summary-first result presentation, unattended Profile Bundle.

- **Subagent provider** — registers a provider on `ctx.subagents` (default name `cursor`); each run is a one-shot local Cursor query in the parent session cwd.
- **Dual driver** — default `driver: cli` spawns the local `cursor-agent -p` using its login state, **no `CURSOR_API_KEY` needed**; optional `driver: sdk` uses `@cursor/sdk` (requires a key).
- **Host-plane Profile Bundle** — same family as the official Claude Code / Codex providers; model-facing tools are provided by separate `dsh-tool-subagent` rows that name this provider.
- **Summary-first results** — soft parsing with summary / `<details>` presentation, so the parent agent sees the conclusion at a glance.

## Install

```bash
dsh plugin add dsh-subagent-cursor
```

This plugin registers a `ctx.subagents` provider (default name `cursor`). Each run is a one-shot local Cursor query in the parent session cwd. It is a host-plane Profile Bundle in the same family as the official Claude Code / Codex providers; model-facing tools are provided by separate `dsh-tool-subagent` rows that name this provider.

### Minimal enablement

```yaml
plugins:
  - package: dsh-subagent-cursor
    config:
      providerName: cursor
      # driver: cli                  # default; uses local CLI login, no key
      # cliPath: cursor-agent        # optional; resolved from PATH by default
  - package: dsh-tool-subagent
    config:
      tools:
        - name: subagent_cursor
          provider: cursor
```

Default `driver: cli` requires a logged-in local `cursor-agent` CLI (`cursor-agent login`) and no API key. `driver: sdk` requires `CURSOR_API_KEY` (Cursor Dashboard → API Keys). Unit tests use fake drivers and need neither.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `providerName` | `cursor` | Provider name registered on `ctx.subagents` |
| `driver` | `cli` | Execution backend: `cli` (local login state) or `sdk` (`@cursor/sdk` + key) |
| `model` | `composer-2.5` | Cursor model id passed to the driver (`auto` works for the cli driver) |
| `env` | `{}` | Explicit environment layered over the credential-scrubbed parent env; supply `CURSOR_API_KEY` here for `driver: sdk` |
| `cliPath` | `cursor-agent` | CLI executable path (`driver: cli`) |
| `timeoutMs` | `600000` | Hard wall-clock limit per run (ms, `driver: cli`) |
| `disposeGraceMs` | `3000` | Positive grace (ms) for teardown waits |

## Why local one-shot

Each delegation is an independent Cursor query in the parent session cwd — naturally isolated, never polluting the parent context. Both driver facades are injectable (`createRun` / `createAgent`); unit tests use fakes, touch no network, and need no `CURSOR_API_KEY`.

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
