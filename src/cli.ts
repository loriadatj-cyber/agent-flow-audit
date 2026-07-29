#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { formatSarif } from "./formatters/sarif.js";
import { formatText } from "./formatters/text.js";
import { scan } from "./scanner.js";
import type { ScanResult, Severity } from "./types.js";

type OutputFormat = "text" | "json" | "sarif";
type FailureThreshold = Severity | "none";

interface CliOptions {
  paths: string[];
  format: OutputFormat;
  output?: string;
  failOn: FailureThreshold;
  color: boolean;
  traces: boolean;
}

const VERSION = "0.1.0";
const SEVERITY_RANK: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  note: 1,
};

export async function runCli(argv: string[]): Promise<number> {
  try {
    if (argv.includes("--help") || argv.includes("-h")) {
      process.stdout.write(help());
      return 0;
    }
    if (argv.includes("--version") || argv.includes("-v")) {
      process.stdout.write(`${VERSION}\n`);
      return 0;
    }

    const options = parseArguments(argv);
    const result = await scan({ paths: options.paths });
    const rendered = render(result, options);

    if (options.output === undefined) {
      process.stdout.write(rendered);
      if (!rendered.endsWith("\n")) {
        process.stdout.write("\n");
      }
    } else {
      const destination = resolve(options.output);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, rendered, "utf8");
      if (options.format === "text") {
        process.stdout.write(`Wrote report to ${options.output}\n`);
      }
    }

    if (result.errors.length > 0) {
      return 2;
    }
    return exceedsThreshold(result, options.failOn) ? 1 : 0;
  } catch (error) {
    process.stderr.write(
      `agent-flow-audit: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 2;
  }
}

function parseArguments(argv: string[]): CliOptions {
  const args = argv[0] === "scan" ? argv.slice(1) : [...argv];
  const options: CliOptions = {
    paths: [],
    format: "text",
    failOn: "high",
    color: Boolean(process.stdout.isTTY) && !process.env.NO_COLOR,
    traces: true,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) {
      continue;
    }
    if (argument === "--format" || argument === "-f") {
      options.format = parseFormat(requireValue(args, ++index, argument));
    } else if (argument.startsWith("--format=")) {
      options.format = parseFormat(argument.slice("--format=".length));
    } else if (argument === "--output" || argument === "-o") {
      options.output = requireValue(args, ++index, argument);
    } else if (argument.startsWith("--output=")) {
      options.output = argument.slice("--output=".length);
    } else if (argument === "--fail-on") {
      options.failOn = parseThreshold(requireValue(args, ++index, argument));
    } else if (argument.startsWith("--fail-on=")) {
      options.failOn = parseThreshold(argument.slice("--fail-on=".length));
    } else if (argument === "--no-color") {
      options.color = false;
    } else if (argument === "--no-traces") {
      options.traces = false;
    } else if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    } else {
      options.paths.push(argument);
    }
  }

  if (options.paths.length === 0) {
    options.paths.push(".github/workflows");
  }
  return options;
}

function render(result: ScanResult, options: CliOptions): string {
  if (options.format === "json") {
    return `${JSON.stringify(result, null, 2)}\n`;
  }
  if (options.format === "sarif") {
    return formatSarif(result);
  }
  return formatText(result, {
    color: options.color,
    traces: options.traces,
  });
}

function exceedsThreshold(
  result: ScanResult,
  threshold: FailureThreshold,
): boolean {
  if (threshold === "none") {
    return false;
  }
  const rank = SEVERITY_RANK[threshold];
  return result.findings.some(
    (finding) => SEVERITY_RANK[finding.severity] >= rank,
  );
}

function parseFormat(value: string): OutputFormat {
  if (value === "text" || value === "json" || value === "sarif") {
    return value;
  }
  throw new Error(`Invalid format "${value}". Expected text, json, or sarif.`);
}

function parseThreshold(value: string): FailureThreshold {
  if (
    value === "critical" ||
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "note" ||
    value === "none"
  ) {
    return value;
  }
  throw new Error(
    `Invalid threshold "${value}". Expected critical, high, medium, low, note, or none.`,
  );
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index];
  if (value === undefined) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function help(): string {
  return `agent-flow-audit ${VERSION}

Explainable data-flow security analysis for AI-powered GitHub workflows.

Usage:
  agent-flow-audit [scan] [paths...] [options]

Options:
  -f, --format <text|json|sarif>       Report format (default: text)
  -o, --output <file>                  Write the report to a file
      --fail-on <severity|none>        Failure threshold (default: high)
      --no-traces                      Hide evidence traces in text output
      --no-color                       Disable ANSI colors
  -h, --help                           Show help
  -v, --version                        Show version

Examples:
  agent-flow-audit
  agent-flow-audit .github/workflows --format sarif -o results.sarif
  agent-flow-audit unsafe.yml --fail-on critical
`;
}

if (
  process.argv[1] !== undefined &&
  realpathSync(resolve(process.argv[1])) ===
    realpathSync(fileURLToPath(import.meta.url))
) {
  process.exitCode = await runCli(process.argv.slice(2));
}
