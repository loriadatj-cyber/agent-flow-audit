import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { parseWorkflow } from "../src/parser.js";

void test("parses GitHub Actions YAML into a normalized workflow", async () => {
  const source = await readFile("test/fixtures/unsafe.yml", "utf8");
  const workflow = parseWorkflow(".github/workflows/unsafe.yml", source);

  assert.equal(workflow.kind, "actions-yaml");
  assert.deepEqual(workflow.triggers, ["issues", "pull_request_target"]);
  assert.equal(workflow.jobs[0]?.steps.length, 4);
  assert.equal(workflow.jobs[0]?.permissions.contents, "write");
});

void test("parses agentic workflow Markdown and exposes its body as a prompt", async () => {
  const source = await readFile("test/fixtures/agentic.md", "utf8");
  const workflow = parseWorkflow(".github/workflows/agentic.md", source);

  assert.equal(workflow.kind, "agentic-markdown");
  assert.deepEqual(workflow.triggers, ["issue_comment"]);
  assert.match(String(workflow.jobs[0]?.steps[0]?.with.prompt), /comment\.body/u);
  assert.equal(workflow.jobs[0]?.steps[0]?.uses, "agentic:codex");
});

void test("rejects Markdown without workflow frontmatter", () => {
  assert.throws(
    () => parseWorkflow("broken.md", "# no frontmatter"),
    /must start with YAML frontmatter/u,
  );
});

void test("treats an explicit empty job permissions map as no permissions", () => {
  const workflow = parseWorkflow(
    ".github/workflows/empty-permissions.yml",
    [
      "on: issues",
      "permissions: write-all",
      "jobs:",
      "  audit:",
      "    permissions: {}",
      "    steps:",
      "      - uses: openai/codex-action@v1",
    ].join("\n"),
  );

  assert.equal(workflow.permissions.contents, "write");
  assert.deepEqual(workflow.jobs[0]?.permissions, {});
});
