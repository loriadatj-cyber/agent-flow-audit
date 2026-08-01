# Changelog

All notable changes will be documented in this file.

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
