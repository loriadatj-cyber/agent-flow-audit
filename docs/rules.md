# Rule reference

Each finding has a stable rule ID, severity, confidence, primary location,
evidence trace, remediation, and partial fingerprint.

## AFA001: Untrusted input reaches a privileged AI agent

**Severity:** Critical

Reports when issue, pull request, comment, review, discussion, wiki, or branch
data enters an AI agent input while the job has a declared write permission.

The dangerous combination is influence plus capability. A prompt-injection
attempt can change the agent's behavior, and the token can turn that behavior
into a repository mutation.

**Remediation:** Keep the agent job read-only. Store its result as typed data,
validate the schema and allowed operations, then perform the write in a separate
job with the narrowest possible permission.

## AFA002: AI output reaches a shell

**Severity:** Critical

Reports `${{ steps.<agent-id>.outputs.<name> }}` inside a later `run` step.
Model output is not a command language and must not be treated as one.

**Remediation:** Parse JSON output, validate values against an allowlist, and
invoke a process API without a shell. Prefer a fixed command whose data arrives
through a file.

## AFA003: Untrusted event data reaches a shell

**Severity:** High

Reports direct interpolation of attacker-controlled GitHub context into a
`run` step. This is a conventional GitHub Actions script-injection path that
often appears beside agent steps.

**Remediation:** Bind the expression to an environment variable, quote the
variable for the selected shell, or parse `$GITHUB_EVENT_PATH` as structured
data.

## AFA004: AI agent has broad write capabilities

**Severity:** Medium, medium confidence

Reports an agent job triggered by an event that accepts content from users while
the job declares write permissions. It does not require a direct expression in
the prompt because agents may read repository and event context through tools.

**Remediation:** Start with `contents: read`. Move writes into a separate job,
environment, or broker that accepts only a constrained operation.

## AFA005: Untrusted PR code in pull_request_target

**Severity:** Critical

Reports an `actions/checkout` step in a `pull_request_target` workflow when its
`ref` or related inputs reference the pull request head.

**Remediation:** Use `pull_request` with read-only permissions for untrusted
code. If a privileged follow-up is required, use a separate workflow that
consumes a verified artifact and never executes fork code.

## AFA006: Secret is exposed to an AI agent

**Severity:** High

Reports `secrets.*`, `github.token`, or `GITHUB_TOKEN` in an agent step's inputs
or environment.

**Remediation:** Do not expose a general credential to the agent process. Use a
short-lived, narrowly scoped broker after checking structured output.

## AFA007: AI agent can mint an OIDC token

**Severity:** High

Reports `id-token: write` on a job containing an AI agent. OIDC may allow cloud
authentication even when no long-lived cloud secret is present.

**Remediation:** Put cloud authentication and deployment in an
environment-protected job. Consume only validated, immutable artifacts from the
agent job.
