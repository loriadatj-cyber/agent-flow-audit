import { locate, locateAfter } from "./location.js";
import type { Location, TaintSource } from "./types.js";

interface SourcePattern {
  pattern: RegExp;
  label: string;
}

const SOURCE_PATTERNS: SourcePattern[] = [
  { pattern: /github\.event\.issue\.(?:title|body)/gu, label: "attacker-controlled issue content" },
  { pattern: /github\.event\.pull_request\.(?:title|body|head\.ref|head\.label)/gu, label: "attacker-controlled pull request content" },
  { pattern: /github\.event\.(?:comment|review|review_comment)\.body/gu, label: "attacker-controlled comment or review" },
  { pattern: /github\.event\.discussion(?:_comment)?\.(?:title|body)/gu, label: "attacker-controlled discussion content" },
  { pattern: /github\.event\.pages\[[^\]]+\]\.page_name/gu, label: "attacker-controlled wiki content" },
  { pattern: /github\.head_ref/gu, label: "attacker-controlled branch name" },
];

export function findTaintSources(
  path: string,
  source: string,
  value: unknown,
  anchor?: Location,
): TaintSource[] {
  const text = stringifyValue(value);
  const results: TaintSource[] = [];

  for (const { pattern, label } of SOURCE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const expression = match[0];
      if (
        expression !== undefined &&
        !isFixedLiteralSelector(text, match.index ?? 0)
      ) {
        results.push({
          expression,
          label,
          location:
            anchor === undefined
              ? locate(path, source, expression)
              : locateAfter(path, source, expression, anchor),
        });
      }
    }
  }

  return deduplicateSources(results);
}

function isFixedLiteralSelector(text: string, sourceIndex: number): boolean {
  const expressionStart = text.lastIndexOf("${{", sourceIndex);
  const expressionEnd = text.indexOf("}}", sourceIndex);
  if (expressionStart < 0 || expressionEnd < 0) {
    return false;
  }

  const body = text.slice(expressionStart + 3, expressionEnd).trim();
  const quotedLiteral = String.raw`(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')`;
  return new RegExp(
    String.raw`&&\s*${quotedLiteral}\s*\|\|\s*${quotedLiteral}\s*$`,
    "u",
  ).test(body);
}

export function containsSecretReference(value: unknown): boolean {
  return /(?:secrets\.[A-Za-z0-9_]+|github\.token|GITHUB_TOKEN)/u.test(stringifyValue(value));
}

export function stringifyValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(stringifyValue).join("\n");
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value)
      .map(([key, nested]) => `${key}: ${stringifyValue(nested)}`)
      .join("\n");
  }
  if (
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  return "";
}

function deduplicateSources(sources: TaintSource[]): TaintSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.expression}:${source.location.line}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
