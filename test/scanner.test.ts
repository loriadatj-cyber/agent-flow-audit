import assert from "node:assert/strict";
import { test } from "node:test";

import { formatSarif } from "../src/formatters/sarif.js";
import { formatText } from "../src/formatters/text.js";
import { scan } from "../src/scanner.js";

void test("scans directories and returns deterministic ordering", async () => {
  const result = await scan({ paths: ["test/fixtures"] });

  assert.equal(result.files.length, 4);
  assert.equal(result.errors.length, 0);
  assert.ok(result.findings.length >= 7);
  assert.deepEqual(result.findings, [...result.findings].sort(compareFindings));
});

void test("emits useful text and valid SARIF", async () => {
  const result = await scan({ paths: ["test/fixtures/unsafe.yml"] });
  const text = formatText(result);
  const sarif = JSON.parse(formatSarif(result)) as {
    version: string;
    runs: Array<{ results: unknown[] }>;
  };

  assert.match(text, /AFA001/u);
  assert.match(text, /source/u);
  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs[0]?.results.length, result.findings.length);
});

void test("reports parse errors without aborting the whole scan", async () => {
  const result = await scan({
    paths: ["test/fixtures/safe.yml", "test/data/broken.yml"],
  });

  assert.equal(result.files.length, 1);
  assert.equal(result.errors.length, 1);
  assert.match(
    result.errors[0]?.message ?? "",
    /flow sequence|end of the stream|implicit keys/iu,
  );
});

function compareFindings(
  left: { location: { path: string; line: number }; ruleId: string },
  right: { location: { path: string; line: number }; ruleId: string },
): number {
  return (
    left.location.path.localeCompare(right.location.path) ||
    left.location.line - right.location.line ||
    left.ruleId.localeCompare(right.ruleId)
  );
}
