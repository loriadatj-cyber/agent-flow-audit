# Threat model

## Security objective

Agent Flow Audit helps maintainers identify workflows where an external
contributor can influence an AI agent and that influence can reach a privileged
repository or execution capability.

## Trust boundaries

The model separates five kinds of node:

1. **Source:** issue, pull request, comment, review, discussion, wiki, or branch
   content controlled by an untrusted user.
2. **Prompt:** text or structured input consumed by an AI action or CLI.
3. **Agent:** a model-driven process that can choose actions.
4. **Capability:** repository writes, secrets, OIDC, tools, or other authority.
5. **Sink:** shell execution, checkout of untrusted code, or another concrete
   side effect.

A finding records a path through at least two of these nodes.

## Attacker assumptions

- The attacker can open or update content accepted by the workflow trigger.
- The attacker knows the public workflow definition.
- The AI system may follow instructions embedded in untrusted content.
- GitHub expressions and action outputs behave according to Actions semantics.
- A declared write permission, secret, or OIDC capability is security relevant
  even if the happy path does not use it.

## Defender assumptions

- Maintainers review workflow changes and scanner findings.
- Permissions declared in the workflow represent the effective token ceiling.
- A suppression documents a separately verified control.
- The scanner runs against the same revision that will execute.

## Out of scope

- Detecting malicious meaning in arbitrary natural language
- Runtime model behavior and provider-side guardrails
- Network egress inspection
- Vulnerabilities inside the implementation of third-party actions
- Proving that sanitization code is semantically correct
- Secret values and cloud-side IAM configuration

## Failure modes

Custom or renamed AI actions may be missed until their signatures are added.
Generated workflows may differ from source Markdown. Location traces use static
source matching and can point to the first identical expression in a file.
Repository-level default token permissions are intentionally not guessed when
the workflow omits `permissions`.

These limitations favor explainable, high-confidence findings over broad claims.
