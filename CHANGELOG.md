# Changelog

All notable changes will be documented in this file.

## 0.1.2 - 2026-08-08

### Added

- Add a deterministic 112-case labeled evaluation corpus with per-case source,
  review, expected finding, reviewed non-finding, and SHA-256 metadata.
- Publish reproducible per-rule precision and recall reports and enforce them in
  CI with `npm run evaluation:check`.
- Document the evaluation methodology and known real-world blind spots.

### Fixed

- Recognize versioned `github/gh-aw@v1` Agentic Workflow actions instead of
  treating the `@version` suffix as an unknown provider signature.

## 0.1.1 - 2026-08-01

### Fixed

- Report missing or inaccessible requested paths as scan errors instead of
  silently succeeding with zero scanned workflows.
- Treat an explicit job-level `permissions: {}` map as disabling all job token
  permissions instead of inheriting workflow-level permissions.

### Changed

- Read the CLI version from `package.json` so release metadata cannot drift.
- Add project status badges and an npm trusted-publishing release workflow.

## 0.1.0 - 2026-07-29

### Added

- Explainable source-to-agent-to-capability traces.
- Seven initial GitHub workflow security rules.
- GitHub Actions YAML and Agentic Workflow Markdown parsing.
- Text, JSON, and SARIF 2.1.0 reporters.
- Self-contained GitHub Action.
