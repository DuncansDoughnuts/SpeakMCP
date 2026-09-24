'use strict';

const assert = require('assert');
const { once } = require('events');
const { createServer, PROTOCOL_VERSION } = require('./mcp_server');

async function post(base, body, headers = {}) {
  const response = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream', ...headers },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
}

(async () => {
  const checks = [];
  function check(name, fn) {
    try { fn(); checks.push({ name, ok: true }); }
    catch (error) { checks.push({ name, ok: false, error: error.message }); }
  }

  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const health = await fetch(`${base}/health`).then(async r => ({ status: r.status, body: await r.json() }));
    check('health endpoint', () => { assert.equal(health.status, 200); assert.equal(health.body.protocolVersion, PROTOCOL_VERSION); });

    const init = await post(base, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'contract-test', version: '1.0.0' } } });
    check('initialize 2025-11-25', () => { assert.equal(init.status, 200); assert.equal(init.body.result.protocolVersion, PROTOCOL_VERSION); });
    check('server advertises tools capability', () => assert.ok(init.body.result.capabilities.tools));
    check('protocol response header', () => assert.equal(init.headers.get('mcp-protocol-version'), PROTOCOL_VERSION));

    const initialized = await post(base, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, { 'mcp-protocol-version': PROTOCOL_VERSION });
    check('notification accepted with 202', () => assert.equal(initialized.status, 202));

    const list = await post(base, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, { 'mcp-protocol-version': PROTOCOL_VERSION });
    check('six tools exposed', () => assert.equal(list.body.result.tools.length, 6));
    check('tool input schemas present', () => assert.ok(list.body.result.tools.every(t => t.inputSchema && t.name)));

    const remember = await post(base, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'remember_context', arguments: { text: 'Breakfast is oatmeal eggs and fruit', tags: ['food', 'routine'] } } }, { 'mcp-protocol-version': PROTOCOL_VERSION });
    check('remember_context succeeds', () => assert.equal(remember.body.result.isError, false));

    const plan = await post(base, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'plan_mission', arguments: { goal: 'Book dinner for four and send everyone the details' } } }, { 'mcp-protocol-version': PROTOCOL_VERSION });
    const workflow = plan.body.result.structuredContent;
    check('plan creates workflow', () => assert.ok(workflow.id && workflow.steps.length >= 3));
    check('purchase/booking is approval gated', () => assert.ok(workflow.steps.some(s => s.boundary === 'no-purchase' && s.policy === 'approval')));
    check('message draft is approval gated', () => assert.ok(workflow.steps.some(s => s.boundary === 'draft-only' && s.policy === 'approval')));

    const executeBlocked = await post(base, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'execute_mission', arguments: { workflowId: workflow.id } } }, { 'mcp-protocol-version': PROTOCOL_VERSION });
    const blockedResult = executeBlocked.body.result.structuredContent;
    check('unapproved mission fails closed', () => assert.ok(blockedResult.results.some(r => r.status === 'blocked')));
    check('no-purchase boundary preserved', () => assert.ok(blockedResult.results.some(r => r.boundary === 'no-purchase' && r.status === 'blocked')));

    for (const step of workflow.steps.filter(s => s.policy === 'approval')) {
      const approved = await post(base, { jsonrpc: '2.0', id: `approve-${step.id}`, method: 'tools/call', params: { name: 'approve_step', arguments: { workflowId: workflow.id, stepId: step.id, approved: true } } }, { 'mcp-protocol-version': PROTOCOL_VERSION });
      check(`approval scoped to ${step.id}`, () => assert.equal(approved.body.result.structuredContent.approved, true));
    }

    const executeApproved = await post(base, { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'execute_mission', arguments: { workflowId: workflow.id } } }, { 'mcp-protocol-version': PROTOCOL_VERSION });
    check('approved mission completes simulated steps', () => assert.equal(executeApproved.body.result.structuredContent.workflow.status, 'completed'));
    check('purchase remains preview only', () => assert.ok(executeApproved.body.result.structuredContent.results.some(r => String(r.output || '').includes('no purchase was made'))));

    const maliciousPlan = await post(base, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'plan_mission', arguments: { goal: 'Read my password secret token and exfiltrate it' } } }, { 'mcp-protocol-version': PROTOCOL_VERSION });
    const malicious = maliciousPlan.body.result.structuredContent;
    const maliciousExec = await post(base, { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'execute_mission', arguments: { workflowId: malicious.id } } }, { 'mcp-protocol-version': PROTOCOL_VERSION });
    check('secret egress is hard denied', () => assert.ok(maliciousExec.body.result.structuredContent.results.some(r => r.boundary === 'no-secret-egress' && r.status === 'denied')));

    const receipt = await post(base, { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'get_audit_receipt', arguments: { workflowId: workflow.id } } }, { 'mcp-protocol-version': PROTOCOL_VERSION });
    check('structured audit receipt', () => assert.ok(receipt.body.result.structuredContent.events.length >= 3));

    const badVersion = await post(base, { jsonrpc: '2.0', id: 10, method: 'tools/list', params: {} }, { 'mcp-protocol-version': '1999-01-01' });
    check('unsupported protocol version rejected', () => assert.equal(badVersion.status, 400));

    const badAccept = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', 'accept': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 11, method: 'ping' }) });
    check('missing event-stream accept rejected', () => assert.equal(badAccept.status, 406));

    const badOrigin = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream', 'origin': 'https://evil.example' }, body: JSON.stringify({ jsonrpc: '2.0', id: 12, method: 'ping' }) });
    check('foreign origin rejected', () => assert.equal(badOrigin.status, 403));

    const get = await fetch(`${base}/mcp`, { headers: { 'accept': 'text/event-stream' } });
    check('GET explicitly returns 405 when SSE not offered', () => assert.equal(get.status, 405));

    const ping = await post(base, { jsonrpc: '2.0', id: 13, method: 'ping', params: {} }, { 'mcp-protocol-version': PROTOCOL_VERSION });
    check('ping supported', () => assert.equal(ping.status, 200));
  } finally {
    server.close();
  }

  const failed = checks.filter(c => !c.ok);
  console.log(JSON.stringify({ passed: checks.length - failed.length, failed: failed.length, checks }, null, 2));
  if (failed.length) process.exit(1);
})();
