import { appendFile, writeFile } from "node:fs/promises";

import { formatSarif } from "./formatters/sarif.js";
import { countBySeverity, formatText } from "./formatters/text.js";
import { scan } from "./scanner.js";
import type { Severity } from "./types.js";

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  note: 1,
};

async function run(): Promise<void> {
  const paths = input("paths", ".github/workflows")
    .split(/\r?\n|,/u)
    .map((path) => path.trim())
    .filter(Boolean);
  const failOn = input("fail-on", "high");
  if (failOn !== "none" && !isSeverity(failOn)) {
    throw new Error(
      `Invalid fail-on value "${failOn}". Expected critical, high, medium, low, note, or none.`,
    );
  }
  const sarifFile = input("sarif-file", "agent-flow-audit.sarif");
  const result = await scan({ paths });

  process.stdout.write(`${formatText(result, { color: false, traces: true })}\n`);
  await writeFile(sarifFile, formatSarif(result), "utf8");

  for (const finding of result.findings) {
    const command =
      finding.severity === "critical" || finding.severity === "high"
        ? "error"
        : "warning";
    process.stdout.write(
      `::${command} file=${escapeProperty(finding.location.path)},line=${finding.location.line},col=${finding.location.column},title=${escapeProperty(`${finding.ruleId}: ${finding.title}`)}::${escapeData(finding.message)}\n`,
    );
  }
  for (const error of result.errors) {
    process.stdout.write(
      `::error file=${escapeProperty(error.path)},title=Workflow parse error::${escapeData(error.message)}\n`,
    );
  }

  const counts = countBySeverity(result);
  await setOutput("sarif-file", sarifFile);
  await setOutput("findings", String(result.findings.length));
  await setOutput("critical", String(counts.critical));
  await setOutput("high", String(counts.high));

  if (result.errors.length > 0) {
    process.exitCode = 2;
    return;
  }
  if (failOn !== "none" && isSeverity(failOn)) {
    const threshold = SEVERITY_RANK[failOn];
    if (
      result.findings.some(
        (finding) => SEVERITY_RANK[finding.severity] >= threshold,
      )
    ) {
      process.exitCode = 1;
    }
  }
}

function input(name: string, fallback: string): string {
  const githubKey = `INPUT_${name.replaceAll(" ", "_").toUpperCase()}`;
  const shellFriendlyKey = githubKey.replaceAll("-", "_");
  return (
    process.env[githubKey]?.trim() ||
    process.env[shellFriendlyKey]?.trim() ||
    fallback
  );
}

async function setOutput(name: string, value: string): Promise<void> {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile !== undefined) {
    await appendFile(outputFile, `${name}=${value}\n`, "utf8");
  } else {
    process.stdout.write(`::set-output name=${name}::${escapeData(value)}\n`);
  }
}

function isSeverity(value: string): value is Severity {
  return value in SEVERITY_RANK;
}

function escapeData(value: string): string {
  return value
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

function escapeProperty(value: string): string {
  return escapeData(value).replaceAll(":", "%3A").replaceAll(",", "%2C");
}

void run().catch((error: unknown) => {
  process.stderr.write(
    `::error title=agent-flow-audit failed::${escapeData(error instanceof Error ? error.message : String(error))}\n`,
  );
  process.exitCode = 2;
});
