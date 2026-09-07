# Amazon Build, Ship, Shape — Friction Log

This log records genuine development friction for the Alexa+ submission path. It should remain factual because contest materials state friction logs may affect judging.

## 2026-09-07 — Choosing a zero-spend Alexa+ route

**Friction:** The existing SpeakMCP product can connect to paid or credentialed model/services, but the opportunity engine has a hard zero-spend rule and must not imply that judges have access to private API keys.

**Resolution:** Use the contest-permitted simulated Alexa+ path first. Build a self-contained browser demo with no network calls and no external API keys. Preserve a clean adapter boundary for later free/sponsor integrations.

**Product implication:** The simulation became a strength rather than a fallback: it lets judges directly inspect planning, scopes, approval gates, blocked actions, session memory, and receipts.

## 2026-09-07 — Separating agent autonomy from user authority

**Friction:** A multi-service agent can appear impressive while hiding consequential writes behind a single natural-language request.

**Resolution:** Classify tool calls by risk. Read/compute actions may proceed in simulation; message drafting and purchase-adjacent actions require explicit approval. Shopping is preview-only and cannot purchase.

**Product implication:** The judge surface now demonstrates both orchestration and trustworthy control instead of treating safety as documentation-only.

## 2026-09-07 — Making a simulation auditable

**Friction:** A polished UI alone does not prove what an agent attempted, what was blocked, or what state carried across interactions.

**Resolution:** Add structured local event receipts for session start, scenario changes, approvals, blocked calls, and executed simulated calls. Add receipt export and visible session memory.

**Product implication:** The demo can be evaluated as a system with observable behavior rather than as a prerecorded concept.

## Current unresolved friction

- A public hosted URL still needs to be created using genuinely free infrastructure.
- A sub-3-minute public demo video still needs owner-approved publication.
- Devpost registration/terms acceptance and final submission remain owner-only actions.

No paid workaround should be used for any of these items.
