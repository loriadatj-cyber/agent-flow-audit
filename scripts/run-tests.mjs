import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import process from "node:process";

const coverage = process.argv.includes("--coverage");
const testFiles = readdirSync("test", { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
  .map((entry) => `test/${entry.name}`)
  .sort();

if (testFiles.length === 0) {
  throw new Error("No test files found.");
}

const coverageArguments = coverage
  ? [
      "--experimental-test-coverage",
      "--test-coverage-lines=90",
      "--test-coverage-branches=70",
      "--test-coverage-functions=80",
    ]
  : [];
const result = spawnSync(
  process.execPath,
  [...coverageArguments, "--import", "tsx", "--test", ...testFiles],
  { stdio: "inherit" },
);

if (result.error !== undefined) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
