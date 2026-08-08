# Contributing

Thank you for improving Agent Flow Audit.

## Before opening a change

- Use an issue for rule semantics, provider signatures, or behavior changes.
- Do not publish an exploitable workflow belonging to another project without
  following that project's security policy.
- Include a minimal workflow fixture for false positives and false negatives.

## Local setup

```bash
npm install
npm run verify
```

Node.js 20, 22, and 24 are supported.

## Evaluation cases

Evaluation cases must include either a public source URL with compatible
licensing or deterministic synthetic generation metadata. Run
`npm run evaluation:update` after an intentional corpus change and commit the
updated manifest and result files. Do not add private workflows, secrets, or
uncoordinated security findings from another project.

## Rule changes

A rule contribution should include:

- a stable rule ID and concise title;
- a documented trust boundary and impact;
- an unsafe fixture that produces the finding;
- a safe neighboring fixture that does not;
- a remediation that changes capability or data handling, not only wording;
- tests for text and SARIF output when the output contract changes.

Rules should prefer structured parsing and evidence paths over keyword
classification. A high-severity finding must identify a concrete capability or
sink.

## Pull requests

Keep changes focused. Run `npm run verify` and include the relevant output in
the pull request. By contributing, you agree that your contribution is licensed
under Apache-2.0.
