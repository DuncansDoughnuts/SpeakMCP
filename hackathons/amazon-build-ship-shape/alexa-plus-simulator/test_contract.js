const fs = require('fs');
const app = fs.readFileSync('app.js','utf8');
const html = fs.readFileSync('index.html','utf8');
const css = fs.readFileSync('styles.css','utf8');
const checks = [
  ['three scenarios', ['morning:', 'travel:', 'family:'].every(x => app.includes(x))],
  ['multi-service tools', ['calendar.read','weather.read','tasks.plan','messages.draft','travel.status','shopping.preview'].every(x => app.includes(x))],
  ['approval gate', app.includes("reason: 'approval_required'") && app.includes('state.approvals.has(tool)')],
  ['no-purchase boundary', app.includes("boundary: 'no-purchase'")],
  ['session memory', app.includes('state.memory.push')],
  ['structured receipts', app.includes('state.events.push') && app.includes('exportReceipt')],
  ['simulation disclosure', html.includes('Simulation only')],
  ['zero-spend badge', html.includes('Zero-spend demo')],
  ['no external api keys', html.includes('No external API keys')],
  ['responsive CSS', css.includes('repeat(auto-fit')],
  ['accessibility label', html.includes('label for="scenario"')],
  ['no network calls', !/(fetch\(|XMLHttpRequest|WebSocket)/.test(app)],
];
const failed = checks.filter(([,ok]) => !ok);
console.log(JSON.stringify({passed: checks.length-failed.length, failed: failed.length, checks: checks.map(([name,ok])=>({name,ok}))}, null, 2));
if (failed.length) process.exit(1);
