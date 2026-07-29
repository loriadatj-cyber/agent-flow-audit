import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

void test("runs as a real CLI process on the current platform", () => {
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/tsx/dist/cli.mjs",
      "src/cli.ts",
      "test/fixtures/unsafe.yml",
      "--fail-on",
      "none",
      "--no-color",
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CRITICAL AFA001/u);
  assert.match(result.stdout, /Scanned 1 workflow/u);
});
