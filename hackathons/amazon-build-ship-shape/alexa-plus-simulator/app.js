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
  }
};

const toolCatalog = {
  'calendar.read': { risk: 'read', boundary: 'calendar:today' },
  'weather.read': { risk: 'read', boundary: 'weather:local' },
  'tasks.plan': { risk: 'compute', boundary: 'local-plan' },
  'messages.draft': { risk: 'write-preview', boundary: 'draft-only' },
  'travel.status': { risk: 'read', boundary: 'simulated-travel' },
  'shopping.preview': { risk: 'purchase-preview', boundary: 'no-purchase' }
};

const state = {
  sessionId: crypto.randomUUID(),
  approvals: new Set(),
  events: [],
  memory: [],
  scenario: 'morning'
};

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
    li.innerHTML = `<div><strong>${idx + 1}. ${description}</strong><span>${tool} · ${spec.risk} · scope ${spec.boundary}</span></div><button data-tool="${tool}" ${approval ? '' : 'disabled'}>${approval ? 'Approve preview' : 'Read-only'}</button>`;
    const button = li.querySelector('button');
    if (approval) button.addEventListener('click', () => {
      state.approvals.add(tool);
      button.textContent = 'Approved';
      button.disabled = true;
      log('approval.granted', { tool, scope: spec.boundary });
    });
    plan.appendChild(li);
  });
}

function executeScenario() {
  const s = scenarios[state.scenario];
  const blocked = [];
  const executed = [];
  s.steps.forEach(([tool, description, approval]) => {
    const spec = toolCatalog[tool];
    if (approval && !state.approvals.has(tool)) {
      blocked.push({ tool, reason: 'approval_required', scope: spec.boundary });
      log('tool.blocked', { tool, reason: 'approval_required', scope: spec.boundary });
      return;
    }
    executed.push({ tool, result: simulatedResult(tool), scope: spec.boundary });
    log('tool.executed', { tool, scope: spec.boundary, mode: 'simulation' });
  });
  state.memory.push({ scenario: state.scenario, completedAt: new Date().toISOString(), executed: executed.map(x => x.tool) });
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
    'shopping.preview': '3 items identified; purchase disabled'
  };
  return results[tool] || 'Simulated tool result';
}

function renderOutcome(executed, blocked) {
  const el = document.querySelector('#outcome');
  el.innerHTML = `<h3>Execution receipt</h3><p>${executed.length} tool calls executed in simulation; ${blocked.length} blocked by policy.</p>` +
    executed.map(x => `<div class="receipt ok"><b>${x.tool}</b><span>${x.result}</span><small>${x.scope}</small></div>`).join('') +
    blocked.map(x => `<div class="receipt blocked"><b>${x.tool}</b><span>Blocked: approval required</span><small>${x.scope}</small></div>`).join('');
}

function renderReceipts() {
  document.querySelector('#receipt-count').textContent = state.events.length;
  document.querySelector('#event-stream').textContent = JSON.stringify(state.events.slice(-8), null, 2);
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
