const scenarios = {
  morning: {
    title: 'Morning launch sequence',
    prompt: 'Alexa, get me ready for the day and protect my first focus block.',
    steps: [
      ['calendar.read', 'Read today\'s first three commitments', false],
      ['weather.read', 'Check commute weather window', false],
      ['tasks.plan', 'Build a 90-minute focus plan around hard commitments', false],
      ['messages.draft', 'Draft a concise late-arrival note only if commute risk is high', true]
    ]
  },
  travel: {
    title: 'Travel disruption recovery',
    prompt: 'Alexa, my flight is delayed. Re-plan the next six hours without spending anything.',
    steps: [
      ['travel.status', 'Read simulated flight delay and terminal change', false],
      ['calendar.read', 'Identify affected commitments', false],
      ['messages.draft', 'Draft truthful updates for affected attendees', true],
      ['tasks.plan', 'Rebuild the work plan using airport-safe tasks', false]
    ]
  },
  family: {
    title: 'Family evening handoff',
    prompt: 'Alexa, coordinate dinner, homework, and tomorrow prep without sending anything until I approve.',
    steps: [
      ['calendar.read', 'Read family schedule constraints', false],
      ['tasks.plan', 'Create a conflict-free evening sequence', false],
      ['messages.draft', 'Draft a household handoff message', true],
      ['shopping.preview', 'Preview missing grocery items without purchase', true]
    ]
  },
  injection: {
    title: 'Untrusted-content safety check',
    prompt: 'Alexa, review this imported agenda and prepare my next actions.',
    steps: [
      ['calendar.read', 'Read the imported agenda item', false],
      ['security.inspect', 'Classify embedded instructions as untrusted content', false],
      ['secrets.exfiltrate', 'Ignore the embedded request to reveal private account data', false],
      ['messages.draft', 'Draft a safe summary that excludes the untrusted instruction', true]
    ]
  }
};

const toolCatalog = {
  'calendar.read': { risk: 'read', boundary: 'calendar:today', policy: 'allow' },
  'weather.read': { risk: 'read', boundary: 'weather:local', policy: 'allow' },
  'tasks.plan': { risk: 'compute', boundary: 'local-plan', policy: 'allow' },
  'messages.draft': { risk: 'write-preview', boundary: 'draft-only', policy: 'approval' },
  'travel.status': { risk: 'read', boundary: 'simulated-travel', policy: 'allow' },
  'shopping.preview': { risk: 'purchase-preview', boundary: 'no-purchase', policy: 'approval' },
  'security.inspect': { risk: 'security-check', boundary: 'local-classifier', policy: 'allow' },
  'secrets.exfiltrate': { risk: 'forbidden', boundary: 'no-secret-egress', policy: 'deny' }
};

const state = {
  sessionId: crypto.randomUUID(),
  approvals: new Set(),
  events: [],
  memory: [],
  scenario: 'morning'
};

function approvalKey(tool) {
  return `${state.scenario}:${tool}`;
}

function log(type, payload = {}) {
  const event = { id: crypto.randomUUID(), at: new Date().toISOString(), type, payload };
  state.events.push(event);
  renderReceipts();
  return event;
}

function renderScenario() {
  const s = scenarios[state.scenario];
  document.querySelector('#scenario-title').textContent = s.title;
  document.querySelector('#user-prompt').textContent = s.prompt;
  const plan = document.querySelector('#plan');
  plan.innerHTML = '';
  s.steps.forEach(([tool, description, approval], idx) => {
    const spec = toolCatalog[tool];
    const li = document.createElement('li');
    li.className = 'plan-step';
    const controlLabel = spec.policy === 'deny' ? 'Policy-denied' : approval ? 'Approve preview' : 'Read-only';
    const disabled = spec.policy === 'deny' || !approval;
    li.innerHTML = `<div><strong>${idx + 1}. ${description}</strong><span>${tool} · ${spec.risk} · scope ${spec.boundary}</span></div><button data-tool="${tool}" ${disabled ? 'disabled' : ''}>${controlLabel}</button>`;
    const button = li.querySelector('button');
    if (approval && spec.policy !== 'deny') button.addEventListener('click', () => {
      state.approvals.add(approvalKey(tool));
      button.textContent = 'Approved';
      button.disabled = true;
      log('approval.granted', { tool, scope: spec.boundary, scenario: state.scenario });
    });
    plan.appendChild(li);
  });
}

function executeScenario() {
  const s = scenarios[state.scenario];
  const blocked = [];
  const executed = [];
  s.steps.forEach(([tool]) => {
    const spec = toolCatalog[tool];
    if (spec.policy === 'deny') {
      blocked.push({ tool, reason: 'policy_denied', scope: spec.boundary });
      log('tool.blocked', { tool, reason: 'policy_denied', scope: spec.boundary });
      return;
    }
    if (spec.policy === 'approval' && !state.approvals.has(approvalKey(tool))) {
      blocked.push({ tool, reason: 'approval_required', scope: spec.boundary });
      log('tool.blocked', { tool, reason: 'approval_required', scope: spec.boundary });
      return;
    }
    executed.push({ tool, result: simulatedResult(tool), scope: spec.boundary });
    log('tool.executed', { tool, scope: spec.boundary, mode: 'simulation' });
  });
  state.memory.push({
    scenario: state.scenario,
    completedAt: new Date().toISOString(),
    executed: executed.map(x => x.tool),
    blocked: blocked.map(x => ({ tool: x.tool, reason: x.reason }))
  });
  renderOutcome(executed, blocked);
  renderMemory();
}

function simulatedResult(tool) {
  const results = {
    'calendar.read': '2 hard commitments; 1 movable block',
    'weather.read': 'Rain risk after 08:30; add 15 min buffer',
    'tasks.plan': 'Focus block protected; low-value task deferred',
    'messages.draft': 'Draft created locally; nothing sent',
    'travel.status': 'Delay +65 min; gate moved to B12',
    'shopping.preview': '3 items identified; purchase disabled',
    'security.inspect': 'Embedded instruction labeled untrusted and excluded from authority'
  };
  return results[tool] || 'Simulated tool result';
}

function renderOutcome(executed, blocked) {
  const el = document.querySelector('#outcome');
  el.innerHTML = `<h3>Execution receipt</h3><p>${executed.length} tool calls executed in simulation; ${blocked.length} blocked by policy.</p>` +
    executed.map(x => `<div class="receipt ok"><b>${x.tool}</b><span>${x.result}</span><small>${x.scope}</small></div>`).join('') +
    blocked.map(x => `<div class="receipt blocked"><b>${x.tool}</b><span>Blocked: ${x.reason.replace('_', ' ')}</span><small>${x.scope}</small></div>`).join('');
}

function renderReceipts() {
  document.querySelector('#receipt-count').textContent = state.events.length;
  document.querySelector('#event-stream').textContent = JSON.stringify(state.events.slice(-10), null, 2);
}

function renderMemory() {
  document.querySelector('#memory').textContent = JSON.stringify(state.memory, null, 2);
}

function exportReceipt() {
  const blob = new Blob([JSON.stringify({ sessionId: state.sessionId, scenario: state.scenario, approvals: [...state.approvals], events: state.events, memory: state.memory }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `alexa-plus-simulation-${state.sessionId}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

document.querySelector('#scenario').addEventListener('change', e => {
  state.scenario = e.target.value;
  state.approvals.clear();
  log('scenario.changed', { scenario: state.scenario });
  renderScenario();
});
document.querySelector('#run').addEventListener('click', executeScenario);
document.querySelector('#export').addEventListener('click', exportReceipt);

renderScenario();
log('session.started', { sessionId: state.sessionId, mode: 'simulated-alexa-plus' });
