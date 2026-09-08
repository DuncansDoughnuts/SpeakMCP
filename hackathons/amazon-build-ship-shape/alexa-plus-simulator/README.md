# Agentic Day — Alexa+ Simulation

A zero-spend, browser-only simulated Alexa+ experience for Amazon Build, Ship, Shape. It demonstrates a stateful agent turning one natural-language intent into a bounded multi-service plan while preserving explicit approval boundaries.

## Why this branch exists

The Alexa+ track permits a simulated Alexa+ experience built with an AI/agentic tool of choice. This implementation uses that path so judges can evaluate orchestration, state, permissions, user control, and evidence without requiring paid APIs or real-world account mutations.

## Judge path

1. Serve this directory with any static server, for example `python -m http.server 8000`.
2. Open `http://localhost:8000`.
3. Run each scenario before approving write-adjacent steps and observe the blocked actions.
4. Approve a draft/preview step and rerun to observe policy-controlled execution.
5. Switch scenarios to demonstrate session memory.
6. Export the audit receipt and inspect the structured event log.

## Demonstrated capabilities

- Four distinct Alexa+-style agentic scenarios: morning planning, travel disruption recovery, family coordination, and untrusted-content defense.
- Multi-service orchestration across calendar, weather/travel, tasks, messages, shopping preview, and local security inspection surfaces.
- Session state and memory.
- Tool-level scope labels.
- Explicit allow / approval / deny policy states.
- Scenario-scoped approval gating for write or purchase-adjacent operations.
- Hard-denied no-secret-egress behavior for untrusted instructions.
- No-purchase and draft-only boundaries.
- Structured execution/block/approval receipts with blocked-reason persistence.
- No external API keys or network calls.

## Test

From this directory:

```bash
node test_contract.js
```

Fresh deterministic execution on 2026-09-08 against the current branch files returned `20 passed, 0 failed`.

A GitHub Actions workflow is also present at `.github/workflows/amazon-buildfest-alexa-plus.yml` to run the same contract suite on eligible branch/PR events. The existence of that workflow is not itself a claim that GitHub-hosted CI has executed; use the local command above as the canonical reproducible check until a hosted run is visible.

## Evidence boundary

This is a simulation. It does not claim Alexa certification, an Amazon Agent Skill, a deployed MCP server, live external service calls, message delivery, purchases, contest registration, Amazon judging results, placement, or payout. Its purpose is to provide a truthful, reproducible judge surface that can be upgraded with approved live integrations later.

## Zero-spend rule

Do not add paid API dependencies, paid hosting, advertisements, purchases, developer fees, or other out-of-pocket participation costs. If a required final integration cannot be completed with sponsor-provided, genuinely free-tier, or local resources, keep the simulation path rather than spend.

## Open-source note

The containing SpeakMCP repository is licensed AGPL-3.0. This simulator is contributed under the same repository license unless a later project-level license file explicitly states otherwise.
