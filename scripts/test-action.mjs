import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

const temporary = mkdtempSync(join(tmpdir(), "agent-flow-audit-action-"));
const output = join(temporary, "github-output.txt");
const sarif = join(temporary, "results.sarif");

try {
  const result = spawnSync(
    process.execPath,
    [resolve("dist/action/index.cjs")],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        INPUT_PATHS: "test/fixtures/safe.yml",
        "INPUT_FAIL-ON": "none",
        "INPUT_SARIF-FILE": sarif,
        GITHUB_OUTPUT: output,
      },
    },
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.ok(existsSync(sarif), "Action did not write a SARIF report.");
  assert.match(readFileSync(sarif, "utf8"), /"version": "2\.1\.0"/u);
  assert.match(readFileSync(output, "utf8"), /findings=0/u);
  process.stdout.write("Bundled Action integration test passed.\n");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
