# dsh-subagent-cursor

[简体中文](README.md) | English

[![npm version](https://img.shields.io/npm/v/dsh-subagent-cursor)](https://www.npmjs.com/package/dsh-subagent-cursor)
[![GitHub stars](https://img.shields.io/github/stars/NinjaSln-labs/dsh-subagent-cursor?style=social)](https://github.com/NinjaSln-labs/dsh-subagent-cursor)

> English is a translation; [简体中文](README.md) is the authoritative document and may be newer.

Cursor-as-subagent provider for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): one-shot local runs via `@cursor/sdk`, summary-first result presentation, unattended Profile Bundle. See [docs/DESIGN.md](./docs/DESIGN.md) and [docs/ROADMAP.md](./docs/ROADMAP.md).

## Install

```bash
dsh plugin add dsh-subagent-cursor
```

This plugin registers a `ctx.subagents` provider (default name `cursor`). Each run is a one-shot local `@cursor/sdk` query in the parent session cwd. It is a host-plane Profile Bundle in the same family as the official Claude Code / Codex providers; model-facing tools are provided by separate `dsh-tool-subagent` rows that name this provider.

## Minimal enablement

```yaml
plugins:
  - package: dsh-subagent-cursor
    config:
      providerName: cursor
      model: composer-2.5
      env:
        CURSOR_API_KEY: ${CURSOR_API_KEY}
  - package: dsh-tool-subagent
    config:
      tools:
        - name: subagent_cursor
          provider: cursor
```

Requires a real `CURSOR_API_KEY` (Cursor Dashboard → Integrations). Unit tests use a fake SDK and do not need a key.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `providerName` | `cursor` | Provider name registered on `ctx.subagents` |
| `model` | `composer-2.5` | Cursor model id passed to the SDK |
| `env` | `{}` | Explicit child/SDK environment layered over the credential-scrubbed parent env; supply `CURSOR_API_KEY` here |
| `disposeGraceMs` | `3000` | Positive grace (ms) for teardown waits |

## Development

```bash
npm ci --legacy-peer-deps
npm run build       # tsc → lib/
npm run typecheck   # strict typecheck
npm test            # vitest: fake SDK contract coverage (completed / aborted / error / missing key)
```

See [DEVELOPMENT.md](DEVELOPMENT.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
