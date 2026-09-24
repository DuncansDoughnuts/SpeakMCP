# Agentic Day — Alexa+ Simulation + Self-Hosted MCP

A zero-spend Alexa+ experience for Amazon Build, Ship, Shape. The project now provides **three judgeable surfaces** from one repository:

1. a browser-only Alexa+ simulation for stateful multi-service orchestration, scoped approvals, policy boundaries, and structured receipts;
2. a Node.js MCP `2025-11-25` mission-planner endpoint over Streamable HTTP; and
3. a Python Continuity MCP reliability layer for secure sessions, checkpoint/resume, one-time approvals, idempotent replay, concurrent duplicate-call collapse, session isolation, and audit ledgers.

The project turns natural-language intent into bounded multi-service work while preserving a hard distinction between remembered context and user authority.

## Why it matters

Long-running agents fail in practical ways: sessions are interrupted, tool calls are retried, duplicate requests race, and consequential actions can be repeated. This submission demonstrates that an Alexa+-style agent can resume from a verified checkpoint, fail closed at approval boundaries, and return deterministic replay receipts instead of silently repeating an irreversible action.

## Judge path — browser simulator

1. Serve this directory with any static server, for example `python -m http.server 8000`.
2. Open `http://localhost:8000`.
3. Run the morning, travel, family, and untrusted-content scenarios.
4. Observe blocked write-adjacent steps before approval.
5. Approve a scoped draft/preview step and rerun.
6. Switch scenarios to demonstrate session memory.
7. Export the audit receipt and inspect the structured event log.

## Judge path — Node MCP mission planner

Requires Node.js 22+ and no package installation.

```bash
node mcp_server.js
# MCP endpoint: http://127.0.0.1:8788/mcp
# health:       http://127.0.0.1:8788/health
```

The server supports protocol version `2025-11-25`, JSON-RPC over POST, JSON response mode, `initialize`, `notifications/initialized`, `ping`, `tools/list`, and `tools/call`. GET returns `405` because the server does not expose a standalone SSE stream. Foreign browser origins are rejected.

### Node MCP tools

- `remember_context`
- `recall_context`
- `plan_mission`
- `approve_step`
- `execute_mission`
- `get_audit_receipt`

## Judge path — Continuity MCP

```bash
cd continuity_mcp
python -m unittest -v test_conformance.py
python server.py
# MCP endpoint: http://127.0.0.1:8765/mcp
```

Continuity MCP adds:

- secure server-issued session IDs;
- checkpoint/resume state continuity;
- approval consumed exactly once before irreversible execution;
- idempotency-key replay behavior;
- concurrent duplicate calls collapsed onto one execution identity;
- session isolation;
- structured ledgers and digests; and
- Origin, Accept, protocol-version, request-size, notification/202, GET/405, DELETE, and stale-session controls.

## Demonstrated capabilities

- Four Alexa+-style browser scenarios: morning planning, travel disruption recovery, family coordination, and untrusted-content defense.
- Multi-service orchestration across calendar, weather/travel, tasks, message drafting, shopping preview, and local security inspection surfaces.
- Tool-level scopes and explicit allow / approval / deny policy states.
- Scenario-scoped and workflow-step-scoped approval gates.
- Hard-denied no-secret-egress behavior for untrusted instructions.
- No-purchase and draft-only boundaries.
- Structured execution, block, approval, replay, and memory receipts.
- MCP `2025-11-25` initialization, tool discovery, calls, and Streamable HTTP contract checks.
- No external API keys, package downloads, cloud accounts, or network calls required for the judge path.

## Reproduce the evidence

From this directory:

```bash
node test_contract.js
node test_mcp_server.js
cd continuity_mcp
python -m unittest -v test_conformance.py
```

Verified results:

- browser simulator contract suite: **20/20 PASS** locally;
- Node MCP transport/tool suite: **24/24 PASS** locally;
- Continuity MCP session/idempotency suite: **30/30 PASS** locally; and
- GitHub Actions run [36017164639](https://github.com/DuncansDoughnuts/SpeakMCP/actions/runs/36017164639): **SUCCESS** on 2026-09-24, with all three suites completing.

The workflow is defined at `.github/workflows/amazon-buildfest-alexa-plus.yml`.

## Evidence boundary

This project does not claim Alexa certification, a deployed Amazon Agent Skill, live external mutations, message delivery, purchases, Devpost registration, legal-terms acceptance, a public demo video, final submission, Amazon judging, placement, or payout. The browser scenarios and tool adapters use local/simulated data. The two MCP transports are runnable and testable; external side effects remain simulated.

## Zero-spend rule

Do not add paid APIs, paid hosting, advertisements, purchases, developer fees, or other out-of-pocket participation costs. Optional sponsor credits are not required by this submission and no overage is authorized.

## License and provenance

The containing SpeakMCP repository is licensed AGPL-3.0. This hackathon work is contributed under the same repository license. It was added on the contest branch during the submission period. Synthetic fixtures are used; no IBM/client data, credentials, personal production data, or proprietary Genesis modules are included.
