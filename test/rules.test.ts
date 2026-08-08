import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { parseWorkflow } from "../src/parser.js";
import { evaluateWorkflow } from "../src/rules.js";

async function findingsFor(fixture: string) {
  const source = await readFile(`test/fixtures/${fixture}`, "utf8");
  return evaluateWorkflow(parseWorkflow(fixture, source));
}

void test("detects each high-value unsafe data flow in the unsafe fixture", async () => {
  const findings = await findingsFor("unsafe.yml");
  const ruleIds = new Set(findings.map((finding) => finding.ruleId));

  assert.deepEqual(
    [...ruleIds].sort(),
    ["AFA001", "AFA002", "AFA003", "AFA004", "AFA005", "AFA006", "AFA007"],
  );
  assert.ok(findings.every((finding) => finding.trace.length >= 2));
  assert.ok(findings.every((finding) => finding.fingerprint.length === 24));
  const shellFinding = findings.find((finding) => finding.ruleId === "AFA003");
  assert.equal(shellFinding?.trace[0]?.location.line, 37);
});

void test("does not flag a read-only agent with sanitized file input", async () => {
  assert.deepEqual(await findingsFor("safe.yml"), []);
});

void test("traces untrusted agentic Markdown content into write capability", async () => {
  const findings = await findingsFor("agentic.md");

  assert.ok(findings.some((finding) => finding.ruleId === "AFA001"));
  assert.ok(findings.some((finding) => finding.ruleId === "AFA004"));
  assert.ok(
    findings
      .flatMap((finding) => finding.trace)
      .some((node) => node.label.includes("comment")),
  );
});

void test("supports explicit rule suppression", async () => {
  assert.deepEqual(await findingsFor("suppressed.yml"), []);
});

void test("recognizes versioned GitHub Agentic Workflow actions", () => {
  const source = `name: Agentic review
on: issues
permissions:
  issues: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: github/gh-aw@v1
        with:
          prompt: \${{ github.event.issue.body }}
`;
  const ruleIds = evaluateWorkflow(parseWorkflow("gh-aw.yml", source)).map(
    (finding) => finding.ruleId,
  );

  assert.deepEqual(ruleIds.sort(), ["AFA001", "AFA004"]);
});

void test("distinguishes generated gh-aw support steps from a path-qualified Copilot CLI", () => {
  const source = `name: Generated lock regression
on: issues
permissions:
  issues: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - name: Setup Scripts
        uses: github/gh-aw/actions/setup@0123456789abcdef
      - name: Validate COPILOT_GITHUB_TOKEN secret
        run: /opt/gh-aw/actions/validate_multi_secret.sh COPILOT_GITHUB_TOKEN 'GitHub Copilot CLI'
        env:
          COPILOT_GITHUB_TOKEN: \${{ secrets.COPILOT_GITHUB_TOKEN }}
      - name: Execute GitHub Copilot CLI
        run: sudo -E awf -- /bin/bash -c '/usr/local/bin/copilot --prompt review'
        env:
          COPILOT_GITHUB_TOKEN: \${{ secrets.COPILOT_GITHUB_TOKEN }}
`;
  const findings = evaluateWorkflow(parseWorkflow("generated.lock.yml", source));

  assert.deepEqual(
    findings.map((finding) => [finding.ruleId, finding.message]).sort(),
    [
      ["AFA004", "Execute GitHub Copilot CLI runs on issues with write access to issues."],
      ["AFA006", "Execute GitHub Copilot CLI receives a secret or repository token."],
    ],
  );
});

void test("does not treat a fixed-literal conditional flag as shell taint", () => {
  const source = `name: Fixed option selector
on: pull_request
permissions:
  contents: read
jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - name: Compare benchmark
        run: |
          compare-results \${{ (github.event_name == 'schedule' && github.ref == 'refs/heads/main' || github.head_ref == 'ci/test-duration-tracking') && '--warn-only' || '' }}
`;

  assert.deepEqual(evaluateWorkflow(parseWorkflow("selector.yml", source)), []);
});
