# Agentic Day — Alexa+ Simulation + Self-Hosted MCP

A zero-spend Alexa+ experience for Amazon Build, Ship, Shape. It now ships **two judgeable surfaces** from the same project:

1. a browser-only Alexa+ simulation that demonstrates stateful multi-service orchestration, approvals, policy boundaries, and structured receipts; and
2. a self-hosted MCP endpoint implementing the hackathon's required `2025-11-25` handshake-era protocol over Streamable HTTP using JSON responses.

The project turns one natural-language intent into a bounded multi-service plan while preserving explicit approval boundaries. Remembered context can inform a plan but never becomes authorization.

## Judge path — browser simulator

1. Serve this directory with any static server, for example `python -m http.server 8000`.
2. Open `http://localhost:8000`.
3. Run each scenario before approving write-adjacent steps and observe the blocked actions.
4. Approve a draft/preview step and rerun to observe policy-controlled execution.
5. Switch scenarios to demonstrate session memory.
6. Export the audit receipt and inspect the structured event log.

## Judge path — MCP server

Requires Node.js 22+ and no package installation.

```bash
node mcp_server.js
# MCP endpoint: http://127.0.0.1:8788/mcp
# health:       http://127.0.0.1:8788/health
```

The server supports the minimum hackathon protocol revision `2025-11-25`, JSON-RPC over POST, JSON response mode, `initialize`, `notifications/initialized`, `ping`, `tools/list`, and `tools/call`. GET explicitly returns `405` because the server does not offer a standalone SSE stream. Session IDs are intentionally not used; the transport is stateless. Incoming foreign browser origins are rejected to protect a local server from DNS-rebinding-style access.

### MCP tools

- `remember_context`
- `recall_context`
- `plan_mission`
- `approve_step`
- `execute_mission`
- `get_audit_receipt`

## Demonstrated capabilities

- Four distinct Alexa+-style browser scenarios: morning planning, travel disruption recovery, family coordination, and untrusted-content defense.
- Multi-service orchestration across calendar, weather/travel, tasks, messages, shopping preview, and local security inspection surfaces.
- Session state and memory.
- Tool-level scope labels.
- Explicit allow / approval / deny policy states.
- Scenario-scoped and workflow-step-scoped approval gating for write or purchase-adjacent operations.
- Hard-denied no-secret-egress behavior for untrusted instructions.
- No-purchase and draft-only boundaries.
- Structured execution/block/approval receipts with blocked-reason persistence.
- MCP `2025-11-25` initialization and tool discovery/call surface.
- Streamable HTTP transport checks for Accept negotiation, protocol version, notification `202`, GET `405`, and Origin rejection.
- No external API keys or network calls required.

## Test

From this directory:

```bash
node test_contract.js
node test_mcp_server.js
```

Fresh deterministic browser contract execution on 2026-09-08 returned `20 passed, 0 failed`.

Fresh deterministic MCP transport/tool execution on 2026-09-24 returned `24 passed, 0 failed`. It covers protocol negotiation, response headers, notification handling, six tool schemas, memory, plan construction, approval gates, no-purchase behavior, secret-egress denial, audit receipts, invalid version rejection, Accept enforcement, Origin rejection, GET behavior, and ping.

The GitHub Actions workflow at `.github/workflows/amazon-buildfest-alexa-plus.yml` now runs both suites on eligible branch/PR changes. The local results above are the canonical evidence until a hosted workflow run is visible.

## Evidence boundary

This project does not claim Alexa certification, a deployed Amazon Agent Skill, live third-party service calls, message delivery, purchases, contest registration, Amazon judging results, placement, or payout. The browser scenarios and MCP tools use local/simulated service adapters. The self-hosted MCP transport itself is runnable and testable; external side effects remain intentionally simulated so the zero-spend and approval boundaries stay truthful.

## Zero-spend rule

Do not add paid API dependencies, paid hosting, advertisements, purchases, developer fees, or other out-of-pocket participation costs. If a required integration cannot be completed with sponsor-provided, genuinely free-tier, or local resources, keep the local/simulated path rather than spend.

## Open-source note

The containing SpeakMCP repository is licensed AGPL-3.0. This hackathon work is contributed under the same repository license unless a later project-level license file explicitly states otherwise.
