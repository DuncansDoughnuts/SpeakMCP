# Continuity MCP — zero-spend reliability layer

Continuity MCP is the reliability/control-plane layer for the Amazon Build, Ship, Shape Alexa+ submission. It implements a local MCP `2025-11-25` Streamable HTTP server that makes assistant workflows resumable, approval-gated, auditable, and idempotent under retries and concurrent duplicate calls.

## Run

```bash
python -m unittest -v test_conformance.py
python server.py
# endpoint: http://127.0.0.1:8765/mcp
```

No cloud account, paid API, package install, or external service is required.

## Tool surface

- `continuity.status`
- `continuity.start`
- `continuity.checkpoint`
- `continuity.approve`
- `continuity.execute_irreversible`
- `continuity.resume`
- `continuity.ledger`

## Reliability properties

- secure server-issued session IDs;
- checkpoint/resume state continuity;
- approval consumed exactly once before an irreversible action;
- idempotency keys collapse duplicate requests onto the original result;
- concurrent duplicate calls share one execution identity;
- session isolation;
- structured ledger and digest;
- Origin rejection, Accept negotiation, protocol-version enforcement, request-size bounds, GET/405 behavior, notification/202 behavior, DELETE session termination, and stale-session 404 behavior.

## Evidence

Fresh local execution on 2026-09-24 returned **30/30 tests passing**. This is reproducible local evidence, not an Amazon judging result or independent MCP certification.
