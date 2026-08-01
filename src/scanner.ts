import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { parseWorkflow } from "./parser.js";
import { evaluateWorkflow } from "./rules.js";
import type { ScanOptions, ScanResult } from "./types.js";

const SUPPORTED_EXTENSIONS = /\.(?:ya?ml|md|markdown)$/iu;

export async function scan(options: ScanOptions = {}): Promise<ScanResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const requested = options.paths ?? [".github/workflows"];
  const discoveries = await Promise.all(
    requested.map((path) => discoverRequested(cwd, path)),
  );
  const files = discoveries
    .flatMap((discovery) => discovery.files)
    .flat()
    .sort();

  const result: ScanResult = {
    files: [],
    findings: [],
    errors: discoveries.flatMap((discovery) => discovery.errors),
  };
  for (const absolutePath of files) {
    const displayPath = relative(cwd, absolutePath).replaceAll("\\", "/");
    try {
      const source = await readFile(absolutePath, "utf8");
      const workflow = parseWorkflow(displayPath, source);
      result.files.push(displayPath);
      result.findings.push(...evaluateWorkflow(workflow));
    } catch (error) {
      result.errors.push({
        path: displayPath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  result.findings.sort(
    (left, right) =>
      left.location.path.localeCompare(right.location.path) ||
      left.location.line - right.location.line ||
      left.ruleId.localeCompare(right.ruleId),
  );
  return result;
}

async function discoverRequested(
  cwd: string,
  requestedPath: string,
): Promise<{ files: string[]; errors: ScanResult["errors"] }> {
  const absolutePath = resolve(cwd, requestedPath);
  try {
    await stat(absolutePath);
  } catch (error) {
    return {
      files: [],
      errors: [
        {
          path: relative(cwd, absolutePath).replaceAll("\\", "/"),
          message: `Requested path is unavailable: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
  return { files: await discover(absolutePath), errors: [] };
}

async function discover(path: string): Promise<string[]> {
  let metadata;
  try {
    metadata = await stat(path);
  } catch {
    return [];
  }
  if (metadata.isFile()) {
    return SUPPORTED_EXTENSIONS.test(path) ? [path] : [];
  }
  if (!metadata.isDirectory()) {
    return [];
  }

  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.name !== ".git" && entry.name !== "node_modules")
      .map((entry) => discover(resolve(path, entry.name))),
  );
  return nested.flat();
}
