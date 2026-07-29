export type Severity = "critical" | "high" | "medium" | "low" | "note";
export type Confidence = "high" | "medium" | "low";

export interface Location {
  path: string;
  line: number;
  column: number;
}

export interface TraceNode {
  kind: "source" | "prompt" | "agent" | "capability" | "sink";
  label: string;
  location: Location;
}

export interface Finding {
  ruleId: string;
  title: string;
  message: string;
  severity: Severity;
  confidence: Confidence;
  location: Location;
  trace: TraceNode[];
  remediation: string;
  fingerprint: string;
}

export type PermissionLevel = "none" | "read" | "write";
export type PermissionMap = Record<string, PermissionLevel>;

export interface TaintSource {
  expression: string;
  label: string;
  location: Location;
}

export interface WorkflowStep {
  index: number;
  id?: string;
  name: string;
  uses?: string;
  run?: string;
  with: Record<string, unknown>;
  env: Record<string, unknown>;
  location: Location;
}

export interface WorkflowJob {
  id: string;
  permissions: PermissionMap;
  steps: WorkflowStep[];
  location: Location;
}

export interface ParsedWorkflow {
  kind: "actions-yaml" | "agentic-markdown";
  path: string;
  source: string;
  name: string;
  triggers: string[];
  permissions: PermissionMap;
  jobs: WorkflowJob[];
}

export interface ScanOptions {
  cwd?: string;
  paths?: string[];
}

export interface ScanResult {
  files: string[];
  findings: Finding[];
  errors: ScanError[];
}

export interface ScanError {
  path: string;
  message: string;
}

export interface RuleMetadata {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  remediation: string;
}
