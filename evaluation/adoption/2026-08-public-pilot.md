# August 2026 Public-Repository Pilot

This pilot tests Agent Flow Audit against real, publicly visible AI-agent
workflows. It is an engineering validation exercise, not a vulnerability
disclosure program or a claim of ecosystem-wide accuracy.

## Method

- Selected ten public, non-archived, non-fork repositories containing supported
  Codex, Claude, Gemini, Copilot, or GitHub Agentic Workflow signatures.
- Scanned only public workflow files in report-only mode at pinned commits.
- Manually reviewed every emitted finding and inspected missed provider
  executions visible in the scanned files.
- Opened no external issue or pull request. Maintainer contact will happen only
  when invited or through the repository's documented security process.
- Published aggregate review results and minimized regression patterns; exact
  repository-to-finding mappings are intentionally omitted.

## Candidate Set

| ID | Repository | Commit |
| --- | --- | --- |
| R01 | `matomo-org/matomo` | `9adeb65b14ca1b8c56536e44e932fff0685b5d74` |
| R02 | `RediSearch/RediSearch` | `eca67d091c51fc420c5f32164da1f1b0312849f8` |
| R03 | `jitsucom/jitsu` | `f55bc9793abf4e6e05fd04b0e4dae8067f183d94` |
| R04 | `ComposioHQ/composio` | `13cba53b1d1d88eb9f54b740735fcd33534e0eb5` |
| R05 | `AI-Hypercomputer/maxtext` | `5f2c70a563d2df8b21c892a51e1d4d4027e68550` |
| R06 | `gemini-cli-extensions/security` | `2227f3cf7150972baac695b8233abc2186408538` |
| R07 | `GoogleCloudPlatform/vertex-ai-creative-studio` | `035e50c19a387d46e3731023ab412146795d4ae0` |
| R08 | `bulgogi-whopper/taptik-cli` | `2396a47658c7fc70bd024f7182988fb882dab544` |
| R09 | `meteostat/meteostat` | `9e1b3be36188152971c5b622497aa04b3a17f5f5` |
| R10 | `colindembovsky/cols-agent-tasks` | `3645e6c68b21713da27fa247d7a966dffe87582c` |

## Results

| Measure | Result |
| --- | ---: |
| Workflow files scanned | 178 |
| Parse errors | 0 |
| Raw findings | 77 |
| Confirmed by rule semantics | 56 |
| Manually rejected false positives | 21 |
| Review precision for emitted findings | 72.73% |
| Confirmed missed findings | At least 8 AFA006 |

The pilot does not estimate recall because the full negative space was not
exhaustively labeled. The eight confirmed misses were repeated instances of one
unsupported provider signature, not eight independent signature families.

After applying the five regression fixes, the same pinned files produced 64
findings. All 64 match the labels established during this review, all 21 known
false positives are absent, and all eight confirmed misses are recovered. This
is a result for the reviewed pilot set, not a general precision or recall claim.

## Findings Applied

1. `github/gh-aw/actions/setup` is a support action, not an agent execution.
2. A provider name inside a validator argument is data, not a CLI invocation.
3. Path-qualified executables such as `/usr/local/bin/copilot` must be detected.
4. An untrusted condition that selects only fixed literal shell flags does not
   inject attacker-controlled bytes.
5. Step locations must resolve to the actual YAML step instead of an earlier
   comment or repeated support step.

Each pattern is represented by a minimized, attributed case in
`evaluation/corpus/samples/real-world/`. Scanner fixes are covered by unit tests
and the reproducible corpus check.

## Next Checkpoint

The next adoption checkpoint requires maintainer consent or an explicit public
request for help. Evidence will be recorded as a linked review, accepted issue,
or merged pull request. Until then, no adoption claim will be made from package
downloads alone.
