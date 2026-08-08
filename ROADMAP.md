# Roadmap

The roadmap prioritizes measured detection quality and real maintainer feedback
over rule count.

## 0.1: Explainable core

- GitHub Actions YAML and Agentic Workflow Markdown parsing
- Seven high-value data-flow and capability rules
- Text, JSON, and SARIF output
- Standalone GitHub Action bundle
- Safe and unsafe regression fixtures

## 0.2: Evaluation

- [x] Build a labeled corpus of at least 100 public and synthetic workflows
- [x] Publish per-rule precision and recall with reproduction metadata
- Add action metadata for newly observed Codex, Claude, Gemini, and Copilot
  integrations
- Scope suppressions to jobs and steps
- [x] Document and regression-test generated Agentic Workflow lock files

## 0.3: Policy

- Repository configuration for allowed agents and required permission ceilings
- Reusable permission-diff checks for pull requests
- Machine-readable evidence graph export
- Baseline files for gradual adoption

## 1.0: Stable contracts

- Stable CLI, JSON schema, rule IDs, and SARIF fingerprints
- Tested monorepo and reusable-workflow support
- Public false-positive and false-negative reporting process
- Maintainer feedback from real repositories incorporated into defaults

## Adoption work

- Offer report-only scans to consenting open-source maintainers
- Submit fixes privately or through responsible pull requests
- [x] Publish reproducible, aggregate public-pilot evaluation results
- Track installs, active repositories, issues, and merged fixes without
  manufacturing activity
