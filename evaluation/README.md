# Evaluation Corpus

This directory contains the public, reproducible evaluation baseline for Agent
Flow Audit. The corpus is designed to answer a narrow question: does each rule
distinguish a vulnerable workflow from a closely neighboring control?

## Reproduce the results

```bash
npm ci
npm run evaluation:check
```

To regenerate the committed synthetic samples and result files after an
intentional evaluation change:

```bash
npm run evaluation:update
```

`evaluation:check` independently regenerates the expected corpus, verifies
every committed sample and SHA-256 digest, runs the scanner, recomputes the
metrics, and compares them with `results/latest.json` and `results/latest.md`.

## Corpus contract

`corpus/manifest.json` is the source of truth. Every case records:

- a stable ID and file path;
- a SHA-256 digest;
- the expected rule IDs;
- every rule manually reviewed as absent;
- public source or deterministic generation metadata; and
- a completed review note.

The dataset contains 112 synthetic cases plus five minimized, attributed
regressions derived from the public-repository pilot. The synthetic baseline has
eight positive and eight neighboring control cases for each of the seven rules.
Variants cover supported Codex, Claude, Gemini, GitHub Agentic Workflow,
generic agent action, and CLI signatures, along with different triggers and
capabilities.

## Metrics

Precision and recall are measured at the case/rule level. A true positive means
that a rule is both labeled and emitted for a case. A false positive means that
the scanner emits a rule explicitly reviewed as absent. A false negative means
that a labeled rule is missing.

The committed results are regression measurements, not a claim of universal
real-world accuracy. Synthetic neighboring cases isolate expected behavior but
cannot represent every GitHub expression, custom action, reusable workflow, or
repository permission default.

## Known blind spots

- Custom or renamed agent actions may not match a provider signature.
- Data flow through files, artifacts, reusable workflows, or custom actions is
  not followed across workflow boundaries.
- Shell quoting is recognized conservatively; the scanner does not implement a
  shell parser.
- Repository and organization default token permissions are not available to
  an offline workflow scan.
- Suppression scope is currently based on nearby source lines.
- The corpus does not measure prevalence or maintainer impact.

Public workflow samples may be contributed when their license and source URL
are recorded. Sensitive findings must follow the source repository's security
policy before inclusion.
