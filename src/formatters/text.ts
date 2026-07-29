import type { ScanResult, Severity } from "../types.js";

const LABELS: Record<Severity, string> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
  note: "NOTE",
};

export interface TextFormatOptions {
  color?: boolean;
  traces?: boolean;
}

export function formatText(
  result: ScanResult,
  options: TextFormatOptions = {},
): string {
  const color = options.color ?? false;
  const traces = options.traces ?? true;
  const lines: string[] = [];

  for (const finding of result.findings) {
    const severity = paint(LABELS[finding.severity], finding.severity, color);
    lines.push(
      `${severity} ${finding.ruleId} ${finding.location.path}:${finding.location.line}:${finding.location.column}`,
    );
    lines.push(`  ${finding.title}`);
    lines.push(`  ${finding.message}`);
    if (traces) {
      for (const node of finding.trace) {
        lines.push(
          `  ${node.kind.padEnd(10)} ${node.label} (${node.location.path}:${node.location.line})`,
        );
      }
    }
    lines.push(`  Fix: ${finding.remediation}`);
    lines.push("");
  }

  for (const error of result.errors) {
    lines.push(`ERROR ${error.path}`);
    lines.push(`  ${error.message}`);
    lines.push("");
  }

  const counts = countBySeverity(result);
  lines.push(
    `Scanned ${result.files.length} workflow${result.files.length === 1 ? "" : "s"}: ` +
      `${result.findings.length} finding${result.findings.length === 1 ? "" : "s"} ` +
      `(${counts.critical} critical, ${counts.high} high, ${counts.medium} medium), ` +
      `${result.errors.length} parse error${result.errors.length === 1 ? "" : "s"}.`,
  );
  return lines.join("\n");
}

export function countBySeverity(result: ScanResult): Record<Severity, number> {
  const counts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    note: 0,
  };
  for (const finding of result.findings) {
    counts[finding.severity] += 1;
  }
  return counts;
}

function paint(text: string, severity: Severity, enabled: boolean): string {
  if (!enabled) {
    return text;
  }
  const code =
    severity === "critical" || severity === "high"
      ? 31
      : severity === "medium"
        ? 33
        : 36;
  return `\u001B[${code}m${text}\u001B[0m`;
}
