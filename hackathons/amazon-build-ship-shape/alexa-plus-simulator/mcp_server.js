'use strict';

const http = require('http');
const crypto = require('crypto');

const PROTOCOL_VERSION = '2025-11-25';
const DEFAULT_PORT = Number(process.env.PORT || 8788);

function nowIso() { return new Date().toISOString(); }
function newId(prefix) { return `${prefix}_${crypto.randomBytes(6).toString('hex')}`; }

class AgenticDayMcp {
  constructor() {
    this.memories = [];
    this.workflows = [];
    this.audit = [];
  }

  toolDefinitions() {
    return [
      {
        name: 'remember_context',
        description: 'Store user-owned context for later planning. Remembered context never constitutes authorization.',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } },
          required: ['text'], additionalProperties: false
        }
      },
      {
        name: 'recall_context',
        description: 'Retrieve relevant remembered context by simple local relevance scoring.',
        inputSchema: {
          type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 20 } },
          required: ['query'], additionalProperties: false
        }
      },
      {
        name: 'plan_mission',
        description: 'Turn a natural-language goal into a bounded multi-service plan with explicit approval and deny boundaries.',
        inputSchema: { type: 'object', properties: { goal: { type: 'string' } }, required: ['goal'], additionalProperties: false }
      },
      {
        name: 'approve_step',
        description: 'Approve or reject one approval-gated step in one workflow. Approval is scoped to that workflow and step only.',
        inputSchema: {
          type: 'object', properties: { workflowId: { type: 'string' }, stepId: { type: 'string' }, approved: { type: 'boolean' } },
          required: ['workflowId', 'stepId', 'approved'], additionalProperties: false
        }
      },
      {
        name: 'execute_mission',
        description: 'Execute local/simulated low-risk steps and fail closed on gated or forbidden actions.',
        inputSchema: { type: 'object', properties: { workflowId: { type: 'string' } }, required: ['workflowId'], additionalProperties: false }
      },
      {
        name: 'get_audit_receipt',
        description: 'Return structured audit events for a workflow.',
        inputSchema: { type: 'object', properties: { workflowId: { type: 'string' } }, required: ['workflowId'], additionalProperties: false }
      }
    ];
  }

  rememberContext(args) {
    const text = typeof args.text === 'string' ? args.text.trim() : '';
    if (!text) throw new Error('text is required');
    const memory = { id: newId('mem'), text, tags: Array.isArray(args.tags) ? args.tags.slice(0, 20) : [], createdAt: nowIso() };
    this.memories.push(memory);
    this.audit.push({ at: nowIso(), type: 'memory.remembered', memoryId: memory.id });
    return memory;
  }

  recallContext(args) {
    const terms = String(args.query || '').toLowerCase().split(/\s+/).filter(Boolean);
    const limit = Math.max(1, Math.min(20, Number(args.limit || 5)));
    return this.memories.map(memory => {
      const hay = `${memory.text} ${(memory.tags || []).join(' ')}`.toLowerCase();
      const score = terms.reduce((n, term) => n + (hay.includes(term) ? 1 : 0), 0);
      return { ...memory, score };
    }).sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  classifyGoal(goal) {
    const lower = goal.toLowerCase();
    const steps = [{ kind: 'context.recall', risk: 'low', policy: 'allow', boundary: 'read-only', label: 'Recall relevant context' }];
    if (/calendar|meeting|schedule|day/.test(lower)) steps.push({ kind: 'calendar.read', risk: 'low', policy: 'allow', boundary: 'read-only', label: 'Check schedule constraints' });
    if (/weather|travel|flight|commute/.test(lower)) steps.push({ kind: 'travel.status', risk: 'low', policy: 'allow', boundary: 'read-only', label: 'Check travel context' });
    if (/message|email|send|contact|follow[- ]?up/.test(lower)) steps.push({ kind: 'messages.draft', risk: 'medium', policy: 'approval', boundary: 'draft-only', label: 'Draft communication' });
    if (/buy|purchase|order|book|reserve|pay/.test(lower)) steps.push({ kind: 'shopping.preview', risk: 'high', policy: 'approval', boundary: 'no-purchase', label: 'Prepare purchase or booking preview' });
    if (/password|secret|token|credential|exfiltrate/.test(lower)) steps.push({ kind: 'secrets.exfiltrate', risk: 'forbidden', policy: 'deny', boundary: 'no-secret-egress', label: 'Blocked secret access request' });
    steps.push({ kind: 'summary', risk: 'low', policy: 'allow', boundary: 'local-only', label: 'Summarize plan and unresolved decisions' });
    return steps;
  }

  planMission(args) {
    const goal = typeof args.goal === 'string' ? args.goal.trim() : '';
    if (!goal) throw new Error('goal is required');
    const context = this.recallContext({ query: goal, limit: 3 });
    const workflow = {
      id: newId('wf'), goal, status: 'proposed', createdAt: nowIso(),
      context: context.map(x => ({ id: x.id, text: x.text, score: x.score })),
      steps: this.classifyGoal(goal).map((step, i) => ({ id: `s${i + 1}`, status: 'pending', ...step }))
    };
    this.workflows.push(workflow);
    this.audit.push({ at: nowIso(), type: 'workflow.planned', workflowId: workflow.id, goal });
    return workflow;
  }

  approveStep(args) {
    const workflow = this.workflows.find(x => x.id === args.workflowId);
    if (!workflow) throw new Error('workflow not found');
    const step = workflow.steps.find(x => x.id === args.stepId);
    if (!step) throw new Error('step not found');
    if (step.policy !== 'approval') throw new Error('step is not approval-gated');
    step.approved = args.approved === true;
    step.approvalAt = nowIso();
    this.audit.push({ at: nowIso(), type: 'step.approval', workflowId: workflow.id, stepId: step.id, approved: step.approved });
    return step;
  }

  executeMission(args) {
    const workflow = this.workflows.find(x => x.id === args.workflowId);
    if (!workflow) throw new Error('workflow not found');
    const results = [];
    for (const step of workflow.steps) {
      if (step.policy === 'deny') {
        step.status = 'denied';
        results.push({ stepId: step.id, status: 'denied', reason: 'policy_denied', boundary: step.boundary });
        continue;
      }
      if (step.policy === 'approval' && step.approved !== true) {
        step.status = 'blocked';
        results.push({ stepId: step.id, status: 'blocked', reason: 'owner_approval_required', boundary: step.boundary });
        continue;
      }
      step.status = 'completed';
      step.completedAt = nowIso();
      results.push({ stepId: step.id, status: 'completed', boundary: step.boundary, output: this.simulate(step, workflow) });
    }
    workflow.status = results.some(x => x.status === 'denied') ? 'denied' : results.some(x => x.status === 'blocked') ? 'blocked' : 'completed';
    workflow.updatedAt = nowIso();
    this.audit.push({ at: nowIso(), type: 'workflow.executed', workflowId: workflow.id, status: workflow.status });
    return { workflow, results };
  }

  simulate(step, workflow) {
    if (step.kind === 'messages.draft') return `Draft-only communication prepared for: ${workflow.goal}`;
    if (step.kind === 'shopping.preview') return `Purchase/booking preview prepared for: ${workflow.goal}; no purchase was made.`;
    if (step.kind === 'calendar.read') return 'Calendar constraints simulated locally; no calendar mutation occurred.';
    if (step.kind === 'travel.status') return 'Travel context simulated locally; no external network request occurred.';
    if (step.kind === 'context.recall') return workflow.context;
    return `Local summary prepared for: ${workflow.goal}`;
  }

  getAuditReceipt(args) {
    const workflow = this.workflows.find(x => x.id === args.workflowId);
    if (!workflow) throw new Error('workflow not found');
    return {
      workflowId: workflow.id, status: workflow.status,
      boundaries: workflow.steps.map(x => ({ stepId: x.id, kind: x.kind, policy: x.policy, boundary: x.boundary, status: x.status })),
      events: this.audit.filter(x => x.workflowId === workflow.id)
    };
  }

  call(name, args = {}) {
    if (name === 'remember_context') return this.rememberContext(args);
    if (name === 'recall_context') return this.recallContext(args);
    if (name === 'plan_mission') return this.planMission(args);
    if (name === 'approve_step') return this.approveStep(args);
    if (name === 'execute_mission') return this.executeMission(args);
    if (name === 'get_audit_receipt') return this.getAuditReceipt(args);
    throw new Error(`unknown tool: ${name}`);
  }
}

function isRequest(message) { return message && message.jsonrpc === '2.0' && message.id !== undefined && typeof message.method === 'string'; }
function isNotification(message) { return message && message.jsonrpc === '2.0' && message.id === undefined && typeof message.method === 'string'; }
function rpcResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }; }

function createMcpHandler(engine = new AgenticDayMcp()) {
  return async function handler(req, res) {
    const origin = req.headers.origin;
    if (origin) {
      let ok = false;
      try { const url = new URL(origin); ok = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname); } catch (_) {}
      if (!ok) {
        res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(rpcError(null, -32000, 'Forbidden origin')));
      }
    }

    if (req.method === 'GET') {
      res.writeHead(405, { 'allow': 'POST, GET', 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(rpcError(null, -32000, 'SSE stream not offered; use POST JSON responses')));
    }
    if (req.method !== 'POST') { res.writeHead(405, { 'allow': 'POST, GET' }); return res.end(); }

    const accept = String(req.headers.accept || '');
    if (!accept.includes('application/json') || !accept.includes('text/event-stream')) {
      res.writeHead(406, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(rpcError(null, -32000, 'Accept must include application/json and text/event-stream')));
    }

    let raw = '';
    for await (const chunk of req) raw += chunk;
    let message;
    try { message = JSON.parse(raw); }
    catch (_) {
      res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(rpcError(null, -32700, 'Parse error')));
    }

    if (isNotification(message)) { res.writeHead(202); return res.end(); }
    if (!isRequest(message)) {
      res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(rpcError(message?.id, -32600, 'Invalid Request')));
    }

    const method = message.method;
    const headerVersion = req.headers['mcp-protocol-version'];
    if (method !== 'initialize' && headerVersion && headerVersion !== PROTOCOL_VERSION) {
      res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(rpcError(message.id, -32600, 'Unsupported MCP-Protocol-Version')));
    }

    let response;
    try {
      if (method === 'initialize') {
        response = rpcResult(message.id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'agentic-day-alexa-plus', version: '1.1.0' },
          instructions: 'Local zero-spend mission planner. All external actions are simulated; approvals are explicit and step-scoped.'
        });
      } else if (method === 'ping') response = rpcResult(message.id, {});
      else if (method === 'tools/list') response = rpcResult(message.id, { tools: engine.toolDefinitions() });
      else if (method === 'tools/call') {
        const value = engine.call(message.params?.name, message.params?.arguments || {});
        response = rpcResult(message.id, { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value, isError: false });
      } else response = rpcError(message.id, -32601, 'Method not found');
    } catch (error) {
      response = rpcResult(message.id, { content: [{ type: 'text', text: error.message }], isError: true });
    }

    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'mcp-protocol-version': PROTOCOL_VERSION });
    res.end(JSON.stringify(response));
  };
}

function createServer(engine = new AgenticDayMcp()) {
  const mcp = createMcpHandler(engine);
  return http.createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: true, protocolVersion: PROTOCOL_VERSION, mode: 'stateless-json-streamable-http' }));
    }
    if (req.url === '/mcp') return mcp(req, res);
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(DEFAULT_PORT, '127.0.0.1', () => console.log(`Agentic Day MCP server listening at http://127.0.0.1:${DEFAULT_PORT}/mcp`));
}

module.exports = { PROTOCOL_VERSION, AgenticDayMcp, createMcpHandler, createServer };
