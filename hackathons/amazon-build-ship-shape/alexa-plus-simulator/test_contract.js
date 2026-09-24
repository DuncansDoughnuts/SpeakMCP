const fs = require('fs');
const app = fs.readFileSync('app.js','utf8');
const html = fs.readFileSync('index.html','utf8');
const css = fs.readFileSync('styles.css','utf8');
const checks = [
  ['four scenarios', ['morning:', 'travel:', 'family:', 'injection:'].every(x => app.includes(x))],
  ['multi-service tools', ['calendar.read','weather.read','tasks.plan','messages.draft','travel.status','shopping.preview','security.inspect'].every(x => app.includes(x))],
  ['approval gate', app.includes("policy: 'approval'") && app.includes('state.approvals.has(approvalKey(tool))')],
  ['scenario-scoped approvals', app.includes('function approvalKey(tool)') && app.includes('`${state.scenario}:${tool}`')],
  ['explicit deny policy', app.includes("policy: 'deny'") && app.includes("reason: 'policy_denied'")],
  ['secret exfiltration denied', app.includes("'secrets.exfiltrate': { risk: 'forbidden', boundary: 'no-secret-egress', policy: 'deny' }")],
  ['untrusted content classifier', app.includes("'security.inspect'") && app.includes('labeled untrusted')],
  ['no-purchase boundary', app.includes("boundary: 'no-purchase'")],
  ['draft-only boundary', app.includes("boundary: 'draft-only'")],
  ['session memory', app.includes('state.memory.push')],
  ['blocked reason persisted', app.includes('blocked: blocked.map')],
  ['structured receipts', app.includes('state.events.push') && app.includes('exportReceipt')],
  ['simulation disclosure', html.includes('Simulation only')],
  ['zero-spend badge', html.includes('Zero-spend demo')],
  ['untrusted-content badge', html.includes('Untrusted-content defense')],
  ['no external api keys', html.includes('No external API keys')],
  ['responsive CSS', css.includes('repeat(auto-fit')],
  ['accessibility label', html.includes('label for="scenario"')],
  ['no network calls', !/(fetch\(|XMLHttpRequest|WebSocket)/.test(app)],
  ['no real-world mutation claim', html.includes('real-world service mutation is claimed')],
];
const failed = checks.filter(([,ok]) => !ok);
console.log(JSON.stringify({passed: checks.length-failed.length, failed: failed.length, checks: checks.map(([name,ok])=>({name,ok}))}, null, 2));
if (failed.length) process.exit(1);
