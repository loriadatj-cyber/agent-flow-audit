import { parseDocument } from "yaml";

import { locate, locateAfter } from "./location.js";
import { parsePermissions } from "./permissions.js";
import type {
  ParsedWorkflow,
  Location,
  PermissionMap,
  WorkflowJob,
  WorkflowStep,
} from "./types.js";

type UnknownRecord = Record<string, unknown>;

export function parseWorkflow(path: string, source: string): ParsedWorkflow {
  return /\.md(?:own)?$/iu.test(path)
    ? parseAgenticMarkdown(path, source)
    : parseActionsYaml(path, source);
}

function parseActionsYaml(path: string, source: string): ParsedWorkflow {
  const document = parseDocument(source, {
    prettyErrors: true,
    strict: true,
    uniqueKeys: true,
  });
  if (document.errors.length > 0) {
    throw new Error(document.errors.map((error) => error.message).join("; "));
  }

  const root = asRecord(document.toJS());
  const globalPermissions = parsePermissions(root.permissions);
  const jobsRecord = asRecord(root.jobs);
  const jobs: WorkflowJob[] = [];

  for (const [jobId, rawJob] of Object.entries(jobsRecord)) {
    const job = asRecord(rawJob);
    const jobPermissions = Object.hasOwn(job, "permissions")
      ? parsePermissions(job.permissions)
      : globalPermissions;
    const rawSteps = Array.isArray(job.steps) ? job.steps : [];
    const jobLocation = locate(path, source, `${jobId}:`);
    const steps: WorkflowStep[] = [];
    let anchor = jobLocation;
    for (const [index, rawStep] of rawSteps.entries()) {
      const parsed = parseStep(path, source, rawStep, index, anchor);
      steps.push(parsed);
      anchor = parsed.location;
    }
    jobs.push({
      id: jobId,
      permissions: jobPermissions,
      steps,
      location: jobLocation,
    });
  }

  return {
    kind: "actions-yaml",
    path,
    source,
    name: typeof root.name === "string" ? root.name : path,
    triggers: parseTriggers(root.on),
    permissions: globalPermissions,
    jobs,
  };
}

function parseAgenticMarkdown(path: string, source: string): ParsedWorkflow {
  const frontmatterMatch = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/u.exec(source);
  if (frontmatterMatch === null) {
    throw new Error("Agentic workflow Markdown must start with YAML frontmatter.");
  }

  const yaml = frontmatterMatch[1] ?? "";
  const document = parseDocument(yaml, {
    prettyErrors: true,
    strict: true,
    uniqueKeys: true,
  });
  if (document.errors.length > 0) {
    throw new Error(document.errors.map((error) => error.message).join("; "));
  }

  const metadata = asRecord(document.toJS());
  const body = source.slice(frontmatterMatch[0].length);
  const permissions = parsePermissions(metadata.permissions);
  const engine =
    typeof metadata.engine === "string" ? metadata.engine : "agentic-workflow";
  const tools = metadata.tools ?? metadata["network"] ?? [];

  return {
    kind: "agentic-markdown",
    path,
    source,
    name: typeof metadata.name === "string" ? metadata.name : path,
    triggers: parseTriggers(metadata.on),
    permissions,
    jobs: [
      {
        id: "agentic-workflow",
        permissions,
        location: locate(path, source, "engine:"),
        steps: [
          {
            index: 0,
            id: "agent",
            name: `${engine} agent`,
            uses: `agentic:${engine}`,
            with: { prompt: body, tools },
            env: {},
            location: locate(path, source, body.trim().slice(0, 48)),
          },
        ],
      },
    ],
  };
}

function parseStep(
  path: string,
  source: string,
  rawStep: unknown,
  index: number,
  anchor: Location,
): WorkflowStep {
  const step = asRecord(rawStep);
  const uses = typeof step.uses === "string" ? step.uses : undefined;
  const run = typeof step.run === "string" ? step.run : undefined;
  const name =
    typeof step.name === "string"
      ? step.name
      : uses ?? (run === undefined ? `step-${index + 1}` : run.split(/\r?\n/u)[0] ?? `step-${index + 1}`);
  const location =
    typeof step.name === "string"
      ? locateYamlScalarAfter(path, source, "name", step.name, anchor)
      : uses !== undefined
        ? locateYamlScalarAfter(path, source, "uses", uses, anchor)
        : locateAfter(path, source, run?.split(/\r?\n/u)[0] ?? name, anchor);

  return {
    index,
    ...(typeof step.id === "string" ? { id: step.id } : {}),
    name,
    ...(uses === undefined ? {} : { uses }),
    ...(run === undefined ? {} : { run }),
    with: asRecord(step.with),
    env: asRecord(step.env),
    location,
  };
}

function locateYamlScalarAfter(
  path: string,
  source: string,
  key: string,
  value: string,
  anchor: Location,
): Location {
  const lines = source.split(/\r?\n/u);
  const keyPattern = new RegExp(`^\\s*(?:-\\s*)?${key}:\\s*(.+?)\\s*$`, "u");
  for (let index = Math.max(0, anchor.line - 1); index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const match = keyPattern.exec(line);
    if (match === null) continue;
    const raw = (match[1] ?? "").replace(/\s+#.*$/u, "").trim();
    const scalar =
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
        ? raw.slice(1, -1)
        : raw;
    if (scalar === value) {
      return {
        path,
        line: index + 1,
        column: Math.max(1, line.indexOf(value) + 1),
      };
    }
  }
  return locateAfter(path, source, value, anchor);
}

function parseTriggers(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (value !== null && typeof value === "object") {
    return Object.keys(value);
  }
  return [];
}

function asRecord(value: unknown): UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as UnknownRecord;
}

export function effectivePermissions(
  workflow: ParsedWorkflow,
  jobId: string,
): PermissionMap {
  return workflow.jobs.find((job) => job.id === jobId)?.permissions ?? workflow.permissions;
}
