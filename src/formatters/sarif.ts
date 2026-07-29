import { RULES } from "../rules.js";
import type { Finding, ScanResult, Severity } from "../types.js";

export function formatSarif(result: ScanResult): string {
  const sarif = {
    $schema:
      "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "agent-flow-audit",
            informationUri:
              "https://github.com/loriadatj-cyber/agent-flow-audit",
            rules: RULES.map((rule) => ({
              id: rule.id,
              name: rule.title,
              shortDescription: { text: rule.title },
              fullDescription: { text: rule.description },
              help: {
                text: rule.remediation,
                markdown: `**Remediation:** ${rule.remediation}`,
              },
              defaultConfiguration: {
                level: sarifLevel(rule.severity),
              },
              properties: {
                precision: rule.id === "AFA004" ? "medium" : "high",
                tags: ["security", "ai-agent", "prompt-injection"],
              },
            })),
          },
        },
        results: result.findings.map(toSarifResult),
        invocations: [
          {
            executionSuccessful: result.errors.length === 0,
            toolExecutionNotifications: result.errors.map((error) => ({
              level: "error",
              message: { text: `${error.path}: ${error.message}` },
            })),
          },
        ],
      },
    ],
  };
  return `${JSON.stringify(sarif, null, 2)}\n`;
}

function toSarifResult(finding: Finding): object {
  return {
    ruleId: finding.ruleId,
    level: sarifLevel(finding.severity),
    message: {
      text: `${finding.message} Remediation: ${finding.remediation}`,
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: finding.location.path },
          region: {
            startLine: finding.location.line,
            startColumn: finding.location.column,
          },
        },
      },
    ],
    relatedLocations: finding.trace.map((node, index) => ({
      id: index + 1,
      message: { text: `${node.kind}: ${node.label}` },
      physicalLocation: {
        artifactLocation: { uri: node.location.path },
        region: {
          startLine: node.location.line,
          startColumn: node.location.column,
        },
      },
    })),
    partialFingerprints: {
      "agentFlowAudit/v1": finding.fingerprint,
    },
    properties: {
      confidence: finding.confidence,
      trace: finding.trace.map((node) => `${node.kind}: ${node.label}`),
    },
  };
}

function sarifLevel(severity: Severity): "error" | "warning" | "note" {
  if (severity === "critical" || severity === "high") {
    return "error";
  }
  return severity === "medium" ? "warning" : "note";
}
