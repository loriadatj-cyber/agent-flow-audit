import { createHash } from "node:crypto";

import { locate } from "./location.js";
import { permissionLevel, writeCapabilities } from "./permissions.js";
import {
  containsSecretReference,
  findTaintSources,
  stringifyValue,
} from "./sources.js";
import type {
  Finding,
  ParsedWorkflow,
  RuleMetadata,
  TraceNode,
  WorkflowJob,
  WorkflowStep,
} from "./types.js";

export const RULES: RuleMetadata[] = [
  {
    id: "AFA001",
    title: "Untrusted input reaches a privileged AI agent",
    description: "Attacker-controlled event data is interpolated into an agent prompt while the job has write capabilities.",
    severity: "critical",
    remediation: "Move untrusted text into a quoted data file, reduce permissions to read-only, and place writes behind a separate reviewed job.",
  },
  {
    id: "AFA002",
    title: "AI output reaches a shell",
    description: "Output from an AI agent step is interpolated into a later shell command.",
    severity: "critical",
    remediation: "Parse the model output as typed data, validate it against an allowlist, and pass it through a file or argument-safe API instead of shell interpolation.",
  },
  {
    id: "AFA003",
    title: "Untrusted event data reaches a shell",
    description: "Attacker-controlled GitHub event data is interpolated directly into a run step.",
    severity: "high",
    remediation: "Assign the expression to an environment variable and quote it, or consume the event payload with a structured parser.",
  },
  {
    id: "AFA004",
    title: "AI agent has broad write capabilities",
    description: "An AI agent runs on an untrusted event with one or more write permissions.",
    severity: "medium",
    remediation: "Grant contents: read by default and move each required write into a narrow, separately authorized job.",
  },
  {
    id: "AFA005",
    title: "Untrusted pull request code is checked out in pull_request_target",
    description: "A pull_request_target workflow appears to check out the pull request head.",
    severity: "critical",
    remediation: "Do not execute or check out untrusted head code in pull_request_target. Use pull_request with read-only permissions or a two-stage workflow.",
  },
  {
    id: "AFA006",
    title: "Secret is exposed to an AI agent",
    description: "An AI agent step receives a secret or GitHub token through its inputs or environment.",
    severity: "high",
    remediation: "Remove secrets from the agent process. Use a brokered, allowlisted operation after validating structured agent output.",
  },
  {
    id: "AFA007",
    title: "AI agent can mint an OIDC token",
    description: "The AI agent job grants id-token: write.",
    severity: "high",
    remediation: "Move OIDC-backed deployment or cloud access into a separate environment-protected job that consumes validated artifacts.",
  },
];

const UNTRUSTED_TRIGGERS = new Set([
  "discussion",
  "discussion_comment",
  "issue_comment",
  "issues",
  "pull_request",
  "pull_request_review",
  "pull_request_review_comment",
  "pull_request_target",
]);

const AGENT_ACTION_PATTERNS = [
  /openai\/codex-action/iu,
  /anthropics\/claude-code-action/iu,
  /google-github-actions\/run-gemini-cli/iu,
  /^github\/gh-aw(?:@|$)/iu,
  /(?:^|[/_-])(?:ai-)?agent(?:[/_@-]|$)/iu,
  /^agentic:/iu,
];

const AGENT_COMMAND_AT_BOUNDARY_PATTERN =
  /(?:^|[\n;&|]\s*)(?:sudo\s+(?:-\S+\s+)*)?(?:codex\s+(?:exec|run)|claude(?:\s|$)|gemini(?:\s|$)|copilot(?:\s|$))/imu;
const PATH_QUALIFIED_AGENT_COMMAND_PATTERN =
  /(?:^|[\s'"(])(?:[A-Za-z]:)?(?:[./\\][^\s'";&|()]+[/\\])+(?:codex|claude|gemini|copilot)(?:\.exe)?(?=\s|$)/imu;

export function evaluateWorkflow(workflow: ParsedWorkflow): Finding[] {
  const findings: Finding[] = [];
  const untrustedTrigger = workflow.triggers.some((trigger) =>
    UNTRUSTED_TRIGGERS.has(trigger),
  );

  for (const job of workflow.jobs) {
    const agents = job.steps.filter(isAgentStep);
    const writes = writeCapabilities(job.permissions);

    for (const agent of agents) {
      const promptSources = findTaintSources(
        workflow.path,
        workflow.source,
        { with: agent.with, env: agent.env, run: agent.run },
        agent.location,
      );

      if (promptSources.length > 0 && writes.length > 0) {
        const source = promptSources[0];
        if (source !== undefined) {
          findings.push(
            makeFinding(
              workflow,
              job,
              agent,
              "AFA001",
              `Untrusted input can influence ${agent.name}, which can write: ${writes.join(", ")}.`,
              [
                trace("source", source.label, source.location),
                trace("prompt", `prompt contains ${source.expression}`, agent.location),
                trace("agent", agent.name, agent.location),
                trace("capability", `write permissions: ${writes.join(", ")}`, job.location),
              ],
            ),
          );
        }
      }

      if (untrustedTrigger && writes.length > 0) {
        findings.push(
          makeFinding(
            workflow,
            job,
            agent,
            "AFA004",
            `${agent.name} runs on ${workflow.triggers.join(", ")} with write access to ${writes.join(", ")}.`,
            [
              trace("source", `untrusted trigger: ${workflow.triggers.join(", ")}`, job.location),
              trace("agent", agent.name, agent.location),
              trace("capability", `write permissions: ${writes.join(", ")}`, job.location),
            ],
          ),
        );
      }

      if (
        containsSecretReference({
          with: agent.with,
          env: agent.env,
          run: agent.run,
        })
      ) {
        findings.push(
          makeFinding(
            workflow,
            job,
            agent,
            "AFA006",
            `${agent.name} receives a secret or repository token.`,
            [
              trace("agent", agent.name, agent.location),
              trace("capability", "secret or token available to agent", agent.location),
            ],
          ),
        );
      }

      if (permissionLevel(job.permissions, "id-token") === "write") {
        findings.push(
          makeFinding(
            workflow,
            job,
            agent,
            "AFA007",
            `${agent.name} can request an OpenID Connect token.`,
            [
              trace("agent", agent.name, agent.location),
              trace("capability", "id-token: write", job.location),
            ],
          ),
        );
      }
    }

    findings.push(...evaluateShellFlows(workflow, job, agents));
    findings.push(...evaluatePullRequestTarget(workflow, job));
  }

  return suppressAndDeduplicate(workflow.source, findings);
}

export function isAgentStep(step: WorkflowStep): boolean {
  const uses = step.uses ?? "";
  return (
    AGENT_ACTION_PATTERNS.some((pattern) => pattern.test(uses)) ||
    (step.run !== undefined &&
      (AGENT_COMMAND_AT_BOUNDARY_PATTERN.test(step.run) ||
        PATH_QUALIFIED_AGENT_COMMAND_PATTERN.test(step.run)))
  );
}

function evaluateShellFlows(
  workflow: ParsedWorkflow,
  job: WorkflowJob,
  agents: WorkflowStep[],
): Finding[] {
  const findings: Finding[] = [];
  for (const step of job.steps) {
    if (step.run === undefined) {
      continue;
    }

    const untrustedSources = findTaintSources(
      workflow.path,
      workflow.source,
      step.run,
      step.location,
    );
    for (const source of untrustedSources) {
      findings.push(
        makeFinding(
          workflow,
          job,
          step,
          "AFA003",
          `${source.expression} is interpolated directly into a shell command.`,
          [
            trace("source", source.label, source.location),
            trace("sink", "shell command", step.location),
          ],
        ),
      );
    }

    for (const agent of agents) {
      if (agent.id === undefined) {
        continue;
      }
      const outputPattern = new RegExp(
        `steps\\.${escapeRegExp(agent.id)}\\.outputs\\.[A-Za-z0-9_-]+`,
        "u",
      );
      const match = outputPattern.exec(step.run);
      if (match !== null) {
        findings.push(
          makeFinding(
            workflow,
            job,
            step,
            "AFA002",
            `Output from ${agent.name} is interpolated into the shell step ${step.name}.`,
            [
              trace("agent", agent.name, agent.location),
              trace("source", `model output: ${match[0]}`, locate(workflow.path, workflow.source, match[0])),
              trace("sink", "shell command", step.location),
            ],
          ),
        );
      }
    }
  }
  return findings;
}

function evaluatePullRequestTarget(
  workflow: ParsedWorkflow,
  job: WorkflowJob,
): Finding[] {
  if (!workflow.triggers.includes("pull_request_target")) {
    return [];
  }

  return job.steps
    .filter((step) => /actions\/checkout/iu.test(step.uses ?? ""))
    .filter((step) =>
      /github\.event\.pull_request\.(?:head\.sha|head\.ref|head\.repo)/u.test(
        stringifyValue(step.with),
      ),
    )
    .map((step) =>
      makeFinding(
        workflow,
        job,
        step,
        "AFA005",
        "This pull_request_target workflow checks out a ref controlled by the pull request author.",
        [
          trace("source", "untrusted pull request head", step.location),
          trace("sink", "actions/checkout", step.location),
        ],
      ),
    );
}

function makeFinding(
  workflow: ParsedWorkflow,
  job: WorkflowJob,
  step: WorkflowStep,
  ruleId: string,
  message: string,
  nodes: TraceNode[],
): Finding {
  const metadata = rule(ruleId);
  const identity = [
    workflow.path,
    ruleId,
    job.id,
    step.id ?? String(step.index),
    nodes.map((node) => node.label).join(">"),
  ].join("\0");

  return {
    ruleId,
    title: metadata.title,
    message,
    severity: metadata.severity,
    confidence: ruleId === "AFA004" ? "medium" : "high",
    location: step.location,
    trace: nodes,
    remediation: metadata.remediation,
    fingerprint: createHash("sha256").update(identity).digest("hex").slice(0, 24),
  };
}

function rule(id: string): RuleMetadata {
  const metadata = RULES.find((candidate) => candidate.id === id);
  if (metadata === undefined) {
    throw new Error(`Unknown rule: ${id}`);
  }
  return metadata;
}

function trace(
  kind: TraceNode["kind"],
  label: string,
  location: TraceNode["location"],
): TraceNode {
  return { kind, label, location };
}

function suppressAndDeduplicate(source: string, findings: Finding[]): Finding[] {
  const suppressions = [
    ...source.matchAll(/agent-flow-audit:\s*ignore\s+(AFA\d{3})/gu),
  ]
    .map((match) => {
      const id = match[1];
      if (id === undefined || match.index === undefined) {
        return undefined;
      }
      return {
        id,
        line: source.slice(0, match.index).split(/\r?\n/u).length,
      };
    })
    .filter(
      (suppression): suppression is { id: string; line: number } =>
        suppression !== undefined,
    );
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const locallySuppressed = suppressions.some(
      (suppression) =>
        suppression.id === finding.ruleId &&
        suppression.line <= finding.location.line &&
        finding.location.line - suppression.line <= 2,
    );
    if (locallySuppressed || seen.has(finding.fingerprint)) {
      return false;
    }
    seen.add(finding.fingerprint);
    return true;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
