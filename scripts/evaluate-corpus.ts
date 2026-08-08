import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { RULES } from "../src/rules.js";
import { scan } from "../src/scanner.js";

interface CorpusCase {
  id: string;
  file: string;
  sha256: string;
  expectedFindings: string[];
  reviewedNonFindings: string[];
  source: {
    type: "public" | "synthetic";
    generator?: string;
    template?: string;
    variant?: number;
    url?: string;
  };
  review: {
    status: "reviewed";
    notes: string;
  };
}

interface CorpusManifest {
  schemaVersion: number;
  datasetVersion: string;
  description: string;
  rules: string[];
  cases: CorpusCase[];
}

interface RuleMetrics {
  ruleId: string;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  trueNegative: number;
  precision: number;
  recall: number;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS_DIR = resolve(ROOT, "evaluation", "corpus");
const MANIFEST_PATH = resolve(CORPUS_DIR, "manifest.json");
const RESULTS_DIR = resolve(ROOT, "evaluation", "results");
const JSON_RESULT = resolve(RESULTS_DIR, "latest.json");
const MARKDOWN_RESULT = resolve(RESULTS_DIR, "latest.md");

async function evaluate() {
  const manifest = JSON.parse(
    await readFile(MANIFEST_PATH, "utf8"),
  ) as CorpusManifest;
  await validateManifest(manifest);

  const requestedPaths = manifest.cases.map(
    (item) => `evaluation/corpus/${item.file}`,
  );
  const result = await scan({ cwd: ROOT, paths: requestedPaths });
  if (result.errors.length > 0) {
    throw new Error(
      `Corpus scan failed:\n${result.errors.map((error) => `- ${error.path}: ${error.message}`).join("\n")}`,
    );
  }

  const findingsByPath = new Map<string, Set<string>>();
  for (const finding of result.findings) {
    const rules = findingsByPath.get(finding.location.path) ?? new Set<string>();
    rules.add(finding.ruleId);
    findingsByPath.set(finding.location.path, rules);
  }

  const mismatches = manifest.cases.flatMap((item) => {
    const path = `evaluation/corpus/${item.file}`;
    const actual = [...(findingsByPath.get(path) ?? new Set<string>())].sort();
    const expected = [...item.expectedFindings].sort();
    const missing = expected.filter((rule) => !actual.includes(rule));
    const unexpected = actual.filter((rule) => !expected.includes(rule));
    return missing.length === 0 && unexpected.length === 0
      ? []
      : [{ id: item.id, path, expected, actual, missing, unexpected }];
  });

  const metrics = manifest.rules.map((ruleId) =>
    calculateMetrics(manifest.cases, findingsByPath, ruleId),
  );
  const summary = {
    cases: manifest.cases.length,
    passed: manifest.cases.length - mismatches.length,
    failed: mismatches.length,
    rules: manifest.rules.length,
    findings: result.findings.length,
  };
  const report = {
    schemaVersion: 1,
    datasetVersion: manifest.datasetVersion,
    methodology: "case-level neighboring positive and negative classification",
    summary,
    rules: metrics,
    mismatches,
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = formatMarkdown(report);

  if (process.argv.includes("--write")) {
    await mkdir(RESULTS_DIR, { recursive: true });
    await writeFile(JSON_RESULT, json, "utf8");
    await writeFile(MARKDOWN_RESULT, markdown, "utf8");
    process.stdout.write(`Wrote evaluation results for ${summary.cases} cases.\n`);
  } else if (process.argv.includes("--check")) {
    await compareCommitted(JSON_RESULT, json);
    await compareCommitted(MARKDOWN_RESULT, markdown);
    process.stdout.write(markdown);
  } else {
    process.stdout.write(markdown);
  }

  if (mismatches.length > 0) {
    process.exitCode = 1;
  }
}

async function validateManifest(manifest: CorpusManifest): Promise<void> {
  if (manifest.schemaVersion !== 1) {
    throw new Error(`Unsupported corpus schema version: ${manifest.schemaVersion}`);
  }
  if (manifest.cases.length < 100) {
    throw new Error(`Corpus contains ${manifest.cases.length} cases; at least 100 are required.`);
  }
  const ruleIds = RULES.map((rule) => rule.id).sort();
  if (JSON.stringify([...manifest.rules].sort()) !== JSON.stringify(ruleIds)) {
    throw new Error("Manifest rules do not match the scanner rule registry.");
  }

  const ids = new Set<string>();
  const files = new Set<string>();
  for (const item of manifest.cases) {
    if (ids.has(item.id) || files.has(item.file)) {
      throw new Error(`Duplicate corpus case id or file: ${item.id}`);
    }
    ids.add(item.id);
    files.add(item.file);
    if (item.review.status !== "reviewed" || item.review.notes.trim() === "") {
      throw new Error(`${item.id} lacks a completed review record.`);
    }
    if (
      item.source.type === "synthetic" &&
      (item.source.generator === undefined ||
        item.source.template === undefined ||
        item.source.variant === undefined)
    ) {
      throw new Error(`${item.id} lacks synthetic generation metadata.`);
    }
    if (item.source.type === "public" && item.source.url === undefined) {
      throw new Error(`${item.id} lacks a public source URL.`);
    }
    const expected = new Set(item.expectedFindings);
    const reviewed = new Set(item.reviewedNonFindings);
    for (const rule of ruleIds) {
      if (expected.has(rule) === reviewed.has(rule)) {
        throw new Error(
          `${item.id} must label ${rule} exactly once as expected or reviewed absent.`,
        );
      }
    }
    const path = resolve(CORPUS_DIR, item.file);
    const content = await readFile(path, "utf8");
    const actualHash = createHash("sha256").update(content).digest("hex");
    if (actualHash !== item.sha256) {
      throw new Error(`${item.id} has a stale SHA-256 digest.`);
    }
  }
}

function calculateMetrics(
  cases: CorpusCase[],
  findingsByPath: Map<string, Set<string>>,
  ruleId: string,
): RuleMetrics {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;
  for (const item of cases) {
    const expected = item.expectedFindings.includes(ruleId);
    const actual =
      findingsByPath
        .get(`evaluation/corpus/${item.file}`)
        ?.has(ruleId) ?? false;
    if (expected && actual) truePositive += 1;
    else if (!expected && actual) falsePositive += 1;
    else if (expected && !actual) falseNegative += 1;
    else trueNegative += 1;
  }
  return {
    ruleId,
    truePositive,
    falsePositive,
    falseNegative,
    trueNegative,
    precision: ratio(truePositive, truePositive + falsePositive),
    recall: ratio(truePositive, truePositive + falseNegative),
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(4));
}

function formatMarkdown(report: {
  datasetVersion: string;
  methodology: string;
  summary: { cases: number; passed: number; failed: number; findings: number };
  rules: RuleMetrics[];
  mismatches: Array<{ id: string; missing: string[]; unexpected: string[] }>;
}): string {
  const lines = [
    "# Evaluation Results",
    "",
    `Dataset: \`${report.datasetVersion}\``,
    "",
    `Methodology: ${report.methodology}.`,
    "",
    `Cases: **${report.summary.cases}** | Passed: **${report.summary.passed}** | Failed: **${report.summary.failed}** | Findings: **${report.summary.findings}**`,
    "",
    "| Rule | TP | FP | FN | TN | Precision | Recall |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...report.rules.map(
      (rule) =>
        `| ${rule.ruleId} | ${rule.truePositive} | ${rule.falsePositive} | ${rule.falseNegative} | ${rule.trueNegative} | ${formatRatio(rule.precision)} | ${formatRatio(rule.recall)} |`,
    ),
    "",
  ];
  if (report.mismatches.length > 0) {
    lines.push("## Mismatches", "");
    for (const mismatch of report.mismatches) {
      lines.push(
        `- \`${mismatch.id}\`: missing ${mismatch.missing.join(", ") || "none"}; unexpected ${mismatch.unexpected.join(", ") || "none"}`,
      );
    }
    lines.push("");
  }
  lines.push(
    "These figures measure the committed neighboring synthetic corpus, not unconstrained real-world accuracy. See [the evaluation methodology](../README.md) for scope and known blind spots.",
  );
  return `${lines.join("\n")}\n`;
}

function formatRatio(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

async function compareCommitted(path: string, expected: string): Promise<void> {
  const actual = await readFile(path, "utf8").catch(() => undefined);
  if (actual !== expected) {
    throw new Error(
      `${relative(ROOT, path).replaceAll("\\", "/")} is stale. Run npm run evaluation:update.`,
    );
  }
}

await evaluate().catch((error: unknown) => {
  process.stderr.write(
    `evaluation: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
