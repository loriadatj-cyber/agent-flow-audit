import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS_DIR = resolve(ROOT, "evaluation", "corpus");
const MANIFEST_PATH = resolve(CORPUS_DIR, "manifest.json");
const RULE_IDS = [
  "AFA001",
  "AFA002",
  "AFA003",
  "AFA004",
  "AFA005",
  "AFA006",
  "AFA007",
];

const PROVIDERS = [
  { name: "Codex", uses: "openai/codex-action@v1" },
  { name: "Claude", uses: "anthropics/claude-code-action@v1" },
  { name: "Gemini", uses: "google-github-actions/run-gemini-cli@v1" },
  { name: "Agentic Workflow", uses: "github/gh-aw@v1" },
  { name: "Repository agent", uses: "example/ai-agent@v1" },
  { name: "Codex CLI", command: "codex exec" },
  { name: "Claude CLI", command: "claude" },
  { name: "Gemini CLI", command: "gemini" },
];

const UNTRUSTED_TRIGGERS = [
  "issues",
  "issue_comment",
  "pull_request",
  "pull_request_review",
  "pull_request_review_comment",
  "discussion",
  "discussion_comment",
  "pull_request_target",
];

const UNTRUSTED_EXPRESSIONS = [
  "${{ github.event.issue.body }}",
  "${{ github.event.comment.body }}",
  "${{ github.event.pull_request.title }}",
  "${{ github.event.review.body }}",
  "${{ github.event.comment.body }}",
  "${{ github.event.discussion.body }}",
  "${{ github.event.comment.body }}",
  "${{ github.event.pull_request.body }}",
];

const WRITE_CAPABILITIES = [
  "contents",
  "issues",
  "pull-requests",
  "discussions",
  "actions",
  "checks",
  "deployments",
  "statuses",
];

function quote(value) {
  return JSON.stringify(value);
}

function agentStep(variant, { id = "agent", prompt, secret } = {}) {
  const provider = PROVIDERS[variant % PROVIDERS.length];
  const lines = [
    `      - name: ${provider.name} evaluation ${variant + 1}`,
    `        id: ${id}`,
  ];
  if (provider.uses !== undefined) {
    lines.push(`        uses: ${provider.uses}`);
    lines.push("        with:");
    lines.push(`          prompt: ${quote(prompt ?? "Review the prepared input file.")}`);
  } else {
    lines.push("        run: |");
    lines.push(`          ${provider.command} ${quote(prompt ?? "Review the prepared input file.")}`);
  }
  if (secret !== undefined) {
    lines.push("        env:");
    lines.push(`          AGENT_TOKEN: ${secret}`);
  }
  return lines.join("\n");
}

function workflow({ name, trigger, permissions, steps }) {
  const permissionLines = Object.entries(permissions)
    .map(([capability, level]) => `  ${capability}: ${level}`)
    .join("\n");
  return `${[
    `name: ${name}`,
    `on: ${trigger}`,
    "permissions:",
    permissionLines,
    "jobs:",
    "  evaluate:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    steps,
  ].join("\n")}\n`;
}

function checkoutStep(ref) {
  const lines = [
    "      - name: Checkout source",
    "        uses: actions/checkout@v4",
  ];
  if (ref !== undefined) {
    lines.push("        with:");
    lines.push(`          ref: ${ref}`);
  }
  return lines.join("\n");
}

function artifactStep(path) {
  return [
    "      - name: Store reviewed output",
    "        uses: actions/upload-artifact@v4",
    "        with:",
    "          name: reviewed-output",
    `          path: ${path}`,
  ].join("\n");
}

function shellStep(name, command, env) {
  const lines = [`      - name: ${name}`, `        run: ${quote(command)}`];
  if (env !== undefined) {
    lines.push("        env:");
    for (const [key, value] of Object.entries(env)) {
      lines.push(`          ${key}: ${value}`);
    }
  }
  return lines.join("\n");
}

function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}

function createCases() {
  const cases = [];
  const add = ({ ruleId, polarity, variant, content, expectedFindings, notes }) => {
    const number = String(variant + 1).padStart(2, "0");
    const file = `samples/${ruleId}/${polarity}-${number}.yml`;
    cases.push({
      id: `${ruleId.toLowerCase()}-${polarity}-${number}`,
      file,
      sha256: hash(content),
      expectedFindings: [...expectedFindings].sort(),
      reviewedNonFindings: RULE_IDS.filter(
        (rule) => !expectedFindings.includes(rule),
      ),
      source: {
        type: "synthetic",
        generator: "scripts/generate-evaluation-corpus.mjs",
        template: `${ruleId}-${polarity}`,
        variant: variant + 1,
      },
      review: {
        status: "reviewed",
        notes,
      },
      content,
    });
  };
  const addPublic = ({ id, file, content, expectedFindings, notes, url }) => {
    cases.push({
      id,
      file,
      sha256: hash(content),
      expectedFindings: [...expectedFindings].sort(),
      reviewedNonFindings: RULE_IDS.filter(
        (rule) => !expectedFindings.includes(rule),
      ),
      source: { type: "public", url },
      review: { status: "reviewed", notes },
      content,
    });
  };

  for (let variant = 0; variant < 8; variant += 1) {
    const trigger = UNTRUSTED_TRIGGERS[variant];
    const expression = UNTRUSTED_EXPRESSIONS[variant];
    const capability = WRITE_CAPABILITIES[variant];

    add({
      ruleId: "AFA001",
      polarity: "positive",
      variant,
      content: workflow({
        name: `Privileged prompt flow ${variant + 1}`,
        trigger,
        permissions: { [capability]: "write" },
        steps: agentStep(variant, { prompt: expression }),
      }),
      expectedFindings:
        variant >= 5
          ? ["AFA001", "AFA003", "AFA004"]
          : ["AFA001", "AFA004"],
      notes: "Untrusted event text reaches an agent that retains a write capability.",
    });
    add({
      ruleId: "AFA001",
      polarity: "control",
      variant,
      content: workflow({
        name: `Read-only prompt flow ${variant + 1}`,
        trigger,
        permissions: { contents: "read" },
        steps: agentStep(variant, { prompt: expression }),
      }),
      expectedFindings: variant >= 5 ? ["AFA003"] : [],
      notes: "The same untrusted prompt is present, but the job is read-only.",
    });

    add({
      ruleId: "AFA002",
      polarity: "positive",
      variant,
      content: workflow({
        name: `Agent output shell flow ${variant + 1}`,
        trigger: "workflow_dispatch",
        permissions: { contents: "read" },
        steps: `${agentStep(variant % 5, { id: "review", prompt: "Return a proposed command." })}\n${shellStep("Execute model output", "${{ steps.review.outputs.command }}")}`,
      }),
      expectedFindings: ["AFA002"],
      notes: "A later shell step interpolates output produced by the agent step.",
    });
    add({
      ruleId: "AFA002",
      polarity: "control",
      variant,
      content: workflow({
        name: `Agent output artifact flow ${variant + 1}`,
        trigger: "workflow_dispatch",
        permissions: { contents: "read" },
        steps: `${agentStep(variant % 5, { id: "review", prompt: "Write structured output to result.json." })}\n${artifactStep("result.json")}`,
      }),
      expectedFindings: [],
      notes: "Agent output is stored as an artifact and is not interpolated into a shell.",
    });

    add({
      ruleId: "AFA003",
      polarity: "positive",
      variant,
      content: workflow({
        name: `Event data shell flow ${variant + 1}`,
        trigger,
        permissions: { contents: "read" },
        steps: shellStep("Print event data", `printf '%s\\n' ${expression}`),
      }),
      expectedFindings: ["AFA003"],
      notes: "Attacker-controlled event data is interpolated directly in run.",
    });
    add({
      ruleId: "AFA003",
      polarity: "control",
      variant,
      content: workflow({
        name: `Quoted event environment ${variant + 1}`,
        trigger,
        permissions: { contents: "read" },
        steps: shellStep("Print quoted environment", "printf '%s\\n' \"$EVENT_TEXT\"", {
          EVENT_TEXT: expression,
        }),
      }),
      expectedFindings: [],
      notes: "Event data is assigned to an environment variable and quoted in the shell.",
    });

    add({
      ruleId: "AFA004",
      polarity: "positive",
      variant,
      content: workflow({
        name: `Broad agent capability ${variant + 1}`,
        trigger,
        permissions: { [capability]: "write" },
        steps: agentStep(variant, { prompt: "Review the checked-in policy file." }),
      }),
      expectedFindings: ["AFA004"],
      notes: "An agent runs on an untrusted trigger with a write capability.",
    });
    add({
      ruleId: "AFA004",
      polarity: "control",
      variant,
      content: workflow({
        name: `Read-only agent capability ${variant + 1}`,
        trigger,
        permissions: { contents: "read" },
        steps: agentStep(variant, { prompt: "Review the checked-in policy file." }),
      }),
      expectedFindings: [],
      notes: "The agent runs on the same trigger with read-only permissions.",
    });

    add({
      ruleId: "AFA005",
      polarity: "positive",
      variant,
      content: workflow({
        name: `Target checkout head ${variant + 1}`,
        trigger: "pull_request_target",
        permissions: { contents: "read" },
        steps: checkoutStep(
          variant % 2 === 0
            ? "${{ github.event.pull_request.head.sha }}"
            : "${{ github.event.pull_request.head.ref }}",
        ),
      }),
      expectedFindings: ["AFA005"],
      notes: "pull_request_target checks out a pull-request-controlled head ref.",
    });
    add({
      ruleId: "AFA005",
      polarity: "control",
      variant,
      content: workflow({
        name: `Target checkout base ${variant + 1}`,
        trigger: variant % 2 === 0 ? "pull_request_target" : "pull_request",
        permissions: { contents: "read" },
        steps:
          variant % 2 === 0
            ? checkoutStep()
            : checkoutStep("${{ github.event.pull_request.head.sha }}"),
      }),
      expectedFindings: [],
      notes: "The target workflow uses the trusted base, or the head checkout uses pull_request.",
    });

    add({
      ruleId: "AFA006",
      polarity: "positive",
      variant,
      content: workflow({
        name: `Agent secret exposure ${variant + 1}`,
        trigger: "workflow_dispatch",
        permissions: { contents: "read" },
        steps: agentStep(variant, {
          prompt: "Review the prepared release notes.",
          secret:
            variant % 2 === 0
              ? "${{ secrets.AGENT_TOKEN }}"
              : "${{ secrets.GITHUB_TOKEN }}",
        }),
      }),
      expectedFindings: ["AFA006"],
      notes: "A secret or repository token is made available to the agent process.",
    });
    add({
      ruleId: "AFA006",
      polarity: "control",
      variant,
      content: workflow({
        name: `Agent without secret ${variant + 1}`,
        trigger: "workflow_dispatch",
        permissions: { contents: "read" },
        steps: agentStep(variant, { prompt: "Review the prepared release notes." }),
      }),
      expectedFindings: [],
      notes: "The neighboring agent step receives no secret or repository token.",
    });

    add({
      ruleId: "AFA007",
      polarity: "positive",
      variant,
      content: workflow({
        name: `Agent OIDC capability ${variant + 1}`,
        trigger: "workflow_dispatch",
        permissions: { contents: "read", "id-token": "write" },
        steps: agentStep(variant, { prompt: "Review the deployment manifest." }),
      }),
      expectedFindings: ["AFA007"],
      notes: "The agent job can mint an OpenID Connect token.",
    });
    add({
      ruleId: "AFA007",
      polarity: "control",
      variant,
      content: workflow({
        name: `Agent without OIDC ${variant + 1}`,
        trigger: "workflow_dispatch",
        permissions: { contents: "read", "id-token": "none" },
        steps: agentStep(variant, { prompt: "Review the deployment manifest." }),
      }),
      expectedFindings: [],
      notes: "The neighboring agent job explicitly disables id-token access.",
    });
  }

  addPublic({
    id: "public-fixed-literal-shell-selector",
    file: "samples/real-world/fixed-literal-shell-selector.yml",
    content: workflow({
      name: "Public regression - fixed literal option",
      trigger: "pull_request",
      permissions: { contents: "read" },
      steps: shellStep(
        "Compare benchmark",
        "compare-results ${{ (github.event_name == 'schedule' && github.ref == 'refs/heads/main' || github.head_ref == 'ci/test-duration-tracking') && '--warn-only' || '' }}",
      ),
    }),
    expectedFindings: [],
    notes: "A public workflow showed that untrusted data used only to select fixed literal flags does not inject attacker-controlled bytes into the shell.",
    url: "https://github.com/AI-Hypercomputer/maxtext/blob/5f2c70a563d2df8b21c892a51e1d4d4027e68550/.github/workflows/track_performance.yml",
  });
  addPublic({
    id: "public-gh-aw-setup-action",
    file: "samples/real-world/gh-aw-setup-action.yml",
    content: workflow({
      name: "Public regression - gh-aw setup helper",
      trigger: "issues",
      permissions: { issues: "write" },
      steps: [
        "      - name: Setup Scripts",
        "        uses: github/gh-aw/actions/setup@9cbca3cd9be433a23a38e4da332635097fd40251",
      ].join("\n"),
    }),
    expectedFindings: [],
    notes: "The generated gh-aw setup action installs support scripts but is not itself an AI agent execution.",
    url: "https://github.com/colindembovsky/cols-agent-tasks/blob/3645e6c68b21713da27fa247d7a966dffe87582c/.github/workflows/issue-triage.lock.yml",
  });
  addPublic({
    id: "public-provider-name-in-validator-argument",
    file: "samples/real-world/provider-name-in-validator-argument.yml",
    content: workflow({
      name: "Public regression - provider name as data",
      trigger: "issues",
      permissions: { issues: "write" },
      steps: shellStep(
        "Validate COPILOT_GITHUB_TOKEN secret",
        "/opt/gh-aw/actions/validate_multi_secret.sh COPILOT_GITHUB_TOKEN 'GitHub Copilot CLI'",
        { COPILOT_GITHUB_TOKEN: "${{ secrets.COPILOT_GITHUB_TOKEN }}" },
      ),
    }),
    expectedFindings: [],
    notes: "A provider name passed as an argument to a validator is data, not a Copilot CLI invocation.",
    url: "https://github.com/colindembovsky/cols-agent-tasks/blob/3645e6c68b21713da27fa247d7a966dffe87582c/.github/workflows/issue-triage.lock.yml",
  });
  addPublic({
    id: "public-path-qualified-copilot-cli",
    file: "samples/real-world/path-qualified-copilot-cli.yml",
    content: workflow({
      name: "Public regression - path-qualified Copilot CLI",
      trigger: "issues",
      permissions: { issues: "write" },
      steps: shellStep(
        "Execute GitHub Copilot CLI",
        "sudo -E awf -- /bin/bash -c '/usr/local/bin/copilot --prompt review'",
        { COPILOT_GITHUB_TOKEN: "${{ secrets.COPILOT_GITHUB_TOKEN }}" },
      ),
    }),
    expectedFindings: ["AFA004", "AFA006"],
    notes: "A path-qualified Copilot executable is an agent invocation and receives a repository secret.",
    url: "https://github.com/colindembovsky/cols-agent-tasks/blob/3645e6c68b21713da27fa247d7a966dffe87582c/.github/workflows/issue-triage.lock.yml",
  });
  addPublic({
    id: "public-action-reference-after-comment",
    file: "samples/real-world/action-reference-after-comment.yml",
    content: `${[
      "name: Public regression - action location",
      "on: workflow_dispatch",
      "permissions:",
      "  contents: read",
      "jobs:",
      "  audit:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      # openai/codex-action@v1 is installed by the next step.",
      "      - name: Run Codex",
      "        uses: openai/codex-action@v1",
      "        env:",
      "          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}",
    ].join("\n")}\n`,
    expectedFindings: ["AFA006"],
    notes: "The finding must point to the action step rather than an earlier comment containing the same action reference.",
    url: "https://github.com/jitsucom/jitsu/blob/f55bc9793abf4e6e05fd04b0e4dae8067f183d94/.github/workflows/security-fix.yml",
  });
  return cases;
}

function manifestFor(cases) {
  return {
    schemaVersion: 1,
    datasetVersion: "0.3.0-1",
    description:
      "Deterministic neighboring cases plus minimized, attributed public-workflow regressions for Agent Flow Audit rules.",
    rules: RULE_IDS,
    cases: cases.map((item) => {
      const manifestItem = { ...item };
      delete manifestItem.content;
      return manifestItem;
    }),
  };
}

async function listYamlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  );
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listYamlFiles(path)));
    } else if (/\.ya?ml$/iu.test(entry.name)) {
      files.push(relative(CORPUS_DIR, path).replaceAll("\\", "/"));
    }
  }
  return files.sort();
}

async function writeCorpus(cases, manifest) {
  for (const item of cases) {
    const destination = resolve(CORPUS_DIR, item.file);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, item.content, "utf8");
  }
  await mkdir(CORPUS_DIR, { recursive: true });
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${cases.length} corpus cases.\n`);
}

async function checkCorpus(cases, manifest) {
  const expectedFiles = cases.map((item) => item.file).sort();
  const actualFiles = await listYamlFiles(resolve(CORPUS_DIR, "samples"));
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error("Committed sample file list differs from the generator output.");
  }
  for (const item of cases) {
    const actual = await readFile(resolve(CORPUS_DIR, item.file), "utf8");
    if (actual !== item.content) {
      throw new Error(`${item.file} differs from the generator output.`);
    }
  }
  const actualManifest = await readFile(MANIFEST_PATH, "utf8");
  const expectedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
  if (actualManifest !== expectedManifest) {
    throw new Error("Committed manifest differs from the generator output.");
  }
  process.stdout.write(`Verified ${cases.length} reproducible corpus cases.\n`);
}

const cases = createCases();
const manifest = manifestFor(cases);
if (process.argv.includes("--write")) {
  await writeCorpus(cases, manifest);
} else if (process.argv.includes("--check")) {
  await checkCorpus(cases, manifest);
} else {
  process.stdout.write(
    "Usage: node scripts/generate-evaluation-corpus.mjs --write|--check\n",
  );
}
