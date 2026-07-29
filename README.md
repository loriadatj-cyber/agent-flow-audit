# Agent Flow Audit

Explainable data-flow security analysis for AI-powered GitHub workflows.

Agent Flow Audit follows attacker-controlled GitHub event data through prompts,
AI agent steps, permissions, secrets, and shell commands. Every finding includes
an evidence trace that explains the source, boundary, and dangerous capability.

It is deterministic, runs offline, and does not send workflow content to an AI
model or external service.

## Why this exists

AI workflow security is not only a prompt-text problem. Risk appears when an
untrusted issue, pull request, or comment can influence an agent that also has a
write token, a secret, a shell, or an OIDC identity.

General GitHub Actions linters catch many script-injection mistakes. Agent Flow
Audit adds an agent-aware model:

```text
untrusted event -> prompt -> AI agent -> privileged capability
AI agent output -> shell command
```

The scanner reports that complete path instead of only matching suspicious
words.

## Quick start

Requires Node.js 20 or newer.

```bash
npx agent-flow-audit
```

Scan a specific file and write SARIF:

```bash
npx agent-flow-audit .github/workflows/ai-review.yml \
  --format sarif \
  --output agent-flow-audit.sarif
```

The default failure threshold is `high`. Use `--fail-on critical` for gradual
adoption or `--fail-on none` for report-only mode.

## Example finding

```text
CRITICAL AFA001 .github/workflows/triage.yml:21:15
  Untrusted input reaches a privileged AI agent
  Untrusted input can influence Ask Codex, which can write: contents, issues.
  source     attacker-controlled issue content (triage.yml:25)
  prompt     prompt contains github.event.issue.body (triage.yml:21)
  agent      Ask Codex (triage.yml:21)
  capability write permissions: contents, issues (triage.yml:13)
```

## GitHub Action

```yaml
name: Audit AI workflows

on:
  pull_request:
    paths:
      - ".github/workflows/**"
  push:
    branches: [main]

permissions:
  contents: read
  security-events: write

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - id: audit
        uses: loriadatj-cyber/agent-flow-audit@v1
        with:
          fail-on: high
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: ${{ steps.audit.outputs.sarif-file }}
```

For pull requests from forks, GitHub may not allow SARIF upload with
`security-events: write`. The scanner still prints annotations and can run with
read-only permissions.

## What is detected

| Rule | Default severity | Summary |
| --- | --- | --- |
| `AFA001` | Critical | Untrusted input reaches an AI agent with write access |
| `AFA002` | Critical | AI output is interpolated into a shell command |
| `AFA003` | High | Untrusted event data is interpolated into a shell command |
| `AFA004` | Medium | An AI agent handles untrusted events with broad writes |
| `AFA005` | Critical | `pull_request_target` checks out untrusted PR code |
| `AFA006` | High | A secret or repository token is passed to an AI agent |
| `AFA007` | High | An AI agent can mint an OIDC token |

See [docs/rules.md](docs/rules.md) for examples, rationale, and remediations.

## Supported workflow forms

- GitHub Actions YAML in `.github/workflows/*.yml` and `*.yaml`
- GitHub Agentic Workflows in Markdown with YAML frontmatter
- OpenAI Codex, Anthropic Claude, Google Gemini, and GitHub Agentic Workflow
  action patterns
- Direct `codex`, `claude`, `gemini`, and `copilot` CLI invocations
- Text, JSON, and SARIF 2.1.0 output

## Suppression

Suppress a reviewed rule with a source comment:

```yaml
# agent-flow-audit: ignore AFA003
```

Suppression is intentionally explicit and rule-specific. Add a nearby comment
that records why the data is trusted or how it is constrained.

## Security model and limitations

Agent Flow Audit is a static preflight check. It does not prove that an AI
workflow is secure, inspect runtime network traffic, or judge whether natural
language is malicious. Unknown custom actions may require a new provider
signature. Repository default permissions are not assumed when a workflow does
not declare permissions.

Read [docs/threat-model.md](docs/threat-model.md) before treating the scanner as
a blocking control.

## Development

```bash
npm install
npm run verify
node dist/cli.js test/fixtures/unsafe.yml --fail-on none
```

The Action bundle is generated with `npm run build:action` and committed so
GitHub runners do not install dependencies at runtime.

## Project status

Agent Flow Audit is an early project. Rule behavior may be refined before
version 1.0, but finding identifiers and SARIF fingerprints are designed to
remain stable. See [ROADMAP.md](ROADMAP.md) for the validation and adoption plan.

## Contributing

Minimal reproductions for false positives, false negatives, and new AI action
signatures are especially useful. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache License 2.0.
