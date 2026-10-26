'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUBLIC_ROOT = path.join(process.cwd(), '.aexos-core/core/virtual-office/public');

// Small DOM boundary: exercise client behavior without adding a browser dependency.
// Actual responsive rendering, focus geometry and accessibility are browser QA gates.
function clientHarness(options = {}) {
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag;
      this.children = [];
      this.dataset = {};
      this.attributes = {};
      this.listeners = {};
      this.text = '';
      this.value = '';
      this.style = {};
      this.classList = { toggle() {}, add() {} };
    }
    set textContent(value) { this.text = String(value); this.children = []; }
    get textContent() { return this.text + this.children.map((child) => child.textContent).join(' '); }
    append(...children) { this.children.push(...children); }
    prepend(...children) { this.children.unshift(...children); }
    replaceChildren(...children) { this.text = ''; this.children = children; }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(type, handler) { this.listeners[type] = handler; }
    focus() { document.activeElement = this; }
    scrollIntoView() {}
  }
  const ids = new Map();
  const walk = (item) => [item, ...item.children.flatMap(walk)];
  const document = {
    activeElement: null,
    getElementById(id) { if (!ids.has(id)) ids.set(id, new Element()); return ids.get(id); },
    createElement(tag) { return new Element(tag); },
    createElementNS(namespace, tag) { return new Element(tag); },
    addEventListener() {},
    querySelectorAll(selector) { return selector === '[data-focus-key]' ? [...ids.values()].flatMap(walk).filter((item) => item.dataset.focusKey) : []; },
    contains(element) { return [...ids.values()].flatMap(walk).includes(element); },
  };
  const stream = { listeners: {}, addEventListener(type, listener) { this.listeners[type] = listener; }, close: jest.fn() };
  const timers = [];
  const stored = new Map(options.savedMotion ? [['aexos-office-motion', options.savedMotion]] : []);
  const motionQuery = { matches: Boolean(options.reducedMotion), addEventListener: jest.fn() };
  const localStorage = { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value) };
  const clipboard = { writeText: jest.fn().mockResolvedValue(undefined) };
  const context = vm.createContext({
    document,
    EventSource: function EventSource() { return stream; },
    window: { AexosOfficeScene: options.sceneApi, clearTimeout() {}, setTimeout() {}, clearInterval() {}, setInterval(callback) { timers.push(callback); return timers.length; }, addEventListener() {}, localStorage, matchMedia: (query) => query.includes('prefers-reduced-motion') ? motionQuery : { matches: false } },
    navigator: { clipboard },
    fetch: () => new Promise(() => {}),
    console,
  });
  vm.runInContext(fs.readFileSync(path.join(PUBLIC_ROOT, 'scene-manifest.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(PUBLIC_ROOT, 'app.js'), 'utf8'), context);
  return { run: (script) => vm.runInContext(script, context), document, ids, stream, timers, clipboard, stored };
}

function snapshot() {
  return {
    project: 'UI test project', generatedAt: Date.now(),
    squads: [{ id: 'core', name: 'Core', agents: [
      { key: 'core/dev', id: 'dev', name: 'Dex', role: 'Developer', squadId: 'core', state: 'offline', observed: false, lastSeen: null },
      { key: 'core/qa', id: 'qa', name: 'Quinn', role: 'Quality', squadId: 'core', state: 'running', observed: true, lastSeen: Date.now() },
    ] }],
    hosts: [{ id: 'cli', status: 'connected', lastSeen: Date.now(), nativeVerified: false }],
    sessions: [{ key: 'one', agentKey: 'core/qa', host: 'cli', sessionId: 'cli-1', runId: 'run-1', state: 'running', evidence: 'test' }],
    events: [], messages: [],
  };
}

function load(harness, value = snapshot()) {
  harness.run(`renderSnapshot(${JSON.stringify(value)}); setConnection(true, 'Connected');`);
}

describe('Virtual Office workspace behavior', () => {
  it('returns All teams to the office overview with the inspector closed', async () => {
    const controller = { updateSnapshot: jest.fn(), setEnabled: jest.fn(), focusRoom: jest.fn(), home: jest.fn() };
    const harness = clientHarness({ sceneApi: { mount: jest.fn().mockResolvedValue(controller) } });
    load(harness);
    await new Promise(setImmediate);
    const nav = harness.document.getElementById('squad-navigation');
    nav.children.find((item) => item.dataset.focusKey === 'squad:core').listeners.click();
    expect(harness.document.getElementById('signals-panel').hidden).toBe(false);
    expect(controller.focusRoom).toHaveBeenCalledWith('core');
    nav.children.find((item) => item.dataset.focusKey === 'squad:all').listeners.click();
    expect(harness.run('appState.squad')).toBe('all');
    expect(harness.run('appState.view')).toBe('spatial');
    expect(harness.document.getElementById('signals-panel').hidden).toBe(true);
    expect(controller.home).toHaveBeenCalledTimes(1);
    expect(controller.focusRoom).not.toHaveBeenCalledWith('all');
  });

  it('keeps squad buttons attached across telemetry but refreshes selection and registry changes', () => {
    const harness = clientHarness();
    load(harness);
    const nav = harness.document.getElementById('squad-navigation');
    const original = [...nav.children];
    original[1].focus();
    const delta = { changed: [{ ...snapshot().squads[0].agents[1], state: 'completed' }] };
    harness.run(`applyDelta(${JSON.stringify(delta)});`);
    expect(nav.children[0]).toBe(original[0]);
    expect(nav.children[1]).toBe(original[1]);
    expect(harness.document.activeElement).toBe(original[1]);
    original[1].listeners.click();
    expect(harness.run('appState.squad')).toBe('core');
    expect(nav.children[1].attributes['aria-pressed']).toBe('true');
    expect(nav.children[0].attributes['aria-pressed']).toBe('false');
    const changed = snapshot();
    changed.squads[0].name = 'Engineering';
    changed.squads[0].agents.pop();
    changed.squads.push({ id: 'apex', name: 'Apex', agents: [] });
    load(harness, changed);
    expect(nav.children).toHaveLength(3);
    expect(nav.children.find((item) => item.dataset.focusKey === 'squad:core').attributes['aria-label']).toBe('Engineering, 1 agents. Open team.');
    expect(nav.children.find((item) => item.dataset.focusKey === 'squad:all').textContent).toContain('1');
    changed.squads.pop();
    load(harness, changed);
    expect(nav.children).toHaveLength(2);
  });

  it('updates an existing spatial controller without remounting or resetting navigation', async () => {
    const controller = { updateSnapshot: jest.fn(), setEnabled: jest.fn(), selectAgent: jest.fn(), focusRoom: jest.fn() };
    const sceneApi = { mount: jest.fn().mockResolvedValue(controller) };
    const harness = clientHarness({ sceneApi });
    load(harness);
    await new Promise(setImmediate);
    harness.run("selectAgent('core/qa'); applyDelta({changed:[], hosts:[]});");
    expect(sceneApi.mount).toHaveBeenCalledTimes(1);
    expect(controller.selectAgent).toHaveBeenCalledWith('core/qa');
    expect(controller.updateSnapshot).toHaveBeenLastCalledWith(expect.any(Object), expect.objectContaining({ selectedAgentKey: 'core/qa', visibleKeys: ['core/dev', 'core/qa'] }));
    expect(harness.run('appState.connected')).toBe(true);
  });

  it('retains live roster inspection when the visual renderer cannot initialize', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const harness = clientHarness({ sceneApi: { mount: jest.fn().mockRejectedValue(new Error('Canvas unavailable')) } });
      load(harness);
      await new Promise(setImmediate);
      expect(harness.run('appState.view')).toBe('list');
      expect(harness.run('appState.connected')).toBe(true);
      expect(harness.ids.get('spatial-fallback-copy').textContent).toContain('Agent list');
      harness.run("selectAgent('core/qa');");
      expect(harness.ids.get('agent-detail').textContent).toContain('Quinn');
    } finally { log.mockRestore(); }
  });
  it('renders all agents in room and list views without converting registration to liveness', () => {
    const harness = clientHarness();
    load(harness);
    expect(harness.document.getElementById('office-world').textContent).toContain('Dex');
    expect(harness.document.getElementById('office-world').textContent).toContain('Not observed');
    expect(harness.document.getElementById('office-world').textContent).toContain('Quinn');
    harness.run("appState.view = 'list'; render();");
    expect(harness.document.getElementById('office-world').textContent).toContain('Dex');
    expect(harness.document.getElementById('office-world').textContent).toContain('Quinn');
    expect(harness.document.getElementById('metric-active').textContent).toBe('1');
    expect(harness.document.getElementById('host-summary').textContent).toBe('1 of 6 hosts observed live');
  });

  it('filters by search, status and actual host sessions', () => {
    const harness = clientHarness();
    load(harness);
    harness.run("appState.search = 'developer'; render();");
    expect(harness.document.getElementById('result-count').textContent).toBe('1 of 2 agents');
    harness.run("appState.search = ''; appState.host = 'chatgpt'; render();");
    expect(harness.document.getElementById('office-world').textContent).toContain('No agents match');
    harness.run("appState.host = 'cli'; render();");
    expect(harness.document.getElementById('office-world').textContent).toContain('Quinn');
    expect(harness.document.getElementById('office-world').textContent).not.toContain('Dex');
    harness.run("appState.host = 'all'; appState.status = 'unobserved'; render();");
    expect(harness.document.getElementById('office-world').textContent).toContain('Dex');
    expect(harness.document.getElementById('office-world').textContent).not.toContain('Quinn');
  });

  it('shows concurrent sessions and never treats a broken stream as fresh activity', () => {
    const harness = clientHarness();
    const value = snapshot();
    value.sessions.push({ agentKey: 'core/qa', host: 'gemini', sessionId: 'gemini-2', runId: 'run-2', state: 'waiting', evidence: 'manual' });
    load(harness, value);
    harness.run("selectAgent('core/qa');");
    const detail = harness.document.getElementById('agent-detail').textContent;
    expect(detail).toContain('cli-1');
    expect(detail).toContain('gemini-2');
    harness.run("setConnection(false, 'Disconnected');");
    expect(harness.document.getElementById('office-world').textContent).toContain('Stale signal');
    expect(harness.document.getElementById('metric-active').textContent).toBe('0');
    expect(harness.document.getElementById('host-summary').textContent).toBe('0 of 6 hosts observed live');
    expect(harness.document.getElementById('connection-notice').hidden).toBe(false);
  });

  it('updates lifecycle deltas and deduplicates stream events', () => {
    const harness = clientHarness();
    load(harness);
    const delta = { changed: [{ ...snapshot().squads[0].agents[1], state: 'completed' }], event: { id: 'event-1', agentName: 'Quinn', type: 'AgentCompleted', timestamp: Date.now(), host: 'cli' } };
    harness.run(`applyDelta(${JSON.stringify(delta)}); applyDelta(${JSON.stringify(delta)});`);
    expect(harness.document.getElementById('office-world').textContent).toContain('Completed');
    expect(harness.document.getElementById('event-count').textContent).toBe('1');
  });

  it('renders public communication as text with sender, recipient and honest delivery state', () => {
    const harness = clientHarness();
    const value = snapshot();
    value.messages = [{ sender: 'Dex', recipient: 'Quinn', collaborationMessage: '<img src=x onerror=alert(1)>', deliveryStatus: 'observed-only', correlationId: 'review-1', runId: 'run-1', evidence: 'manual' }];
    load(harness, value);
    const transcript = harness.document.getElementById('message-timeline');
    expect(transcript.textContent).toContain('Dex → Quinn');
    expect(transcript.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(transcript.textContent).toContain('observed-only');
    expect(transcript.textContent).toContain('review-1');
    expect(transcript.children[0].children.every((child) => child.tagName !== 'img')).toBe(true);
  });

  it('restores a full snapshot before reporting a reconnected stream', () => {
    const harness = clientHarness();
    load(harness);
    harness.run('connectStream();');
    harness.stream.listeners.error();
    expect(harness.document.getElementById('host-summary').textContent).toBe('0 of 6 hosts observed live');
    harness.stream.listeners.snapshot({ data: JSON.stringify(snapshot()) });
    expect(harness.document.getElementById('connection-notice').hidden).toBe(true);
    expect(harness.document.getElementById('host-summary').textContent).toBe('1 of 6 hosts observed live');
  });

  it('restores the keyboard focus to the same agent after a live render', () => {
    const harness = clientHarness();
    load(harness);
    const focused = harness.document.querySelectorAll('[data-focus-key]').find((item) => item.dataset.focusKey === 'agent:core/qa');
    focused.focus();
    harness.run('applyDelta({ changed: [] });');
    expect(harness.document.activeElement).not.toBe(focused);
    expect(harness.document.activeElement.dataset.focusKey).toBe('agent:core/qa');
  });

  it('keeps the complete roster accessible beyond the bounded room overview', () => {
    const harness = clientHarness();
    const value = snapshot();
    value.squads = Array.from({ length: 8 }, (_, index) => ({
      id: 'team-' + index, name: 'Team ' + index,
      agents: Array.from({ length: 6 }, (_, member) => ({ key: index + '/' + member, id: 'agent-' + member, name: 'Agent ' + index + '-' + member, squadId: 'team-' + index, state: 'offline' })),
    }));
    load(harness, value);
    expect(harness.document.getElementById('office-world').textContent).toContain('Explore all 8 teams');
    expect(harness.document.getElementById('office-world').textContent).not.toContain('Agent 7-5');
    harness.run("appState.view = 'list'; render();");
    expect(harness.document.getElementById('office-world').textContent).toContain('Agent 7-5');
    harness.run("appState.view = 'rooms'; appState.search = 'agent 7-5'; render();");
    expect(harness.document.getElementById('office-world').textContent).toContain('Agent 7-5');
  });

  it('maps architectural room hotspots to actual squads and opens the live roster drawer', () => {
    const harness = clientHarness();
    const value = snapshot();
    value.squads[0].id = 'aexos-core';
    value.squads[0].agents.forEach((agent) => { agent.squadId = 'aexos-core'; });
    load(harness, value);
    const room = harness.document.getElementById('room-hotspots').children[0];
    expect(room.dataset.squadId).toBe('aexos-core');
    expect(room.attributes['aria-label']).toContain('2 registered agents, 1 working');
    room.listeners.click();
    expect(harness.document.getElementById('signals-panel').hidden).toBe(false);
    expect(harness.document.getElementById('room-roster').textContent).toContain('Dex');
    harness.run('closeInspector();');
    expect(harness.document.getElementById('signals-panel').hidden).toBe(true);
  });

  it('draws inter-room connections only for fresh observed messages with resolvable endpoints', () => {
    const harness = clientHarness();
    const value = snapshot();
    value.squads[0].id = 'aexos-core';
    value.squads[0].agents.forEach((agent) => { agent.squadId = 'aexos-core'; });
    value.squads.push({ id: 'apex', name: 'Apex', agents: [{ key: 'apex/lead', id: 'lead', name: 'Lead', squadId: 'apex', state: 'offline' }] });
    load(harness, value);
    expect(harness.document.getElementById('communication-links').children).toHaveLength(0);
    value.messages = [{ id: 'public-one', sender: 'Dex', recipient: 'Lead', collaborationMessage: 'Review ready', timestamp: Date.now() }];
    load(harness, value);
    expect(harness.document.getElementById('communication-links').children).toHaveLength(1);
    harness.run('appState.snapshot.messages[0].timestamp = Date.now() - 60000;');
    harness.timers.forEach((callback) => callback());
    expect(harness.document.getElementById('communication-links').children).toHaveLength(0);
  });

  it('clears an unrelated selected identity when switching rooms', () => {
    const harness = clientHarness();
    const value = snapshot();
    value.squads.push({ id: 'apex', name: 'Apex', agents: [] });
    load(harness, value);
    harness.run('selectAgent("core/qa"); openRoom("apex");');
    expect(harness.document.getElementById('agent-detail').textContent).not.toContain('Quinn');
    expect(harness.document.getElementById('agent-detail').textContent).toContain('Select an agent in this room');
  });

  it.each([['4026', ' --port 4026'], ['', '']])('copies a CLI status command for collector port %s', async (port, suffix) => {
    const harness = clientHarness();
    load(harness);
    harness.run('window.location = ' + JSON.stringify({ port }) + '; selectAgent("core/qa");');
    const copy = harness.document.getElementById('agent-detail').children.find((child) => child.className === 'copy-command');
    await copy.listeners.click({ currentTarget: copy });
    expect(harness.clipboard.writeText).toHaveBeenCalledWith('npx @aexos/core office status --json' + suffix);
  });

  it('applies and persists motion controls while honoring system reduced motion', () => {
    const harness = clientHarness({ savedMotion: 'off' });
    expect(harness.document.getElementById('architectural-scene').dataset.motion).toBe('off');
    harness.run('toggleMotion();');
    expect(harness.document.getElementById('architectural-scene').dataset.motion).toBe('on');
    expect(harness.stored.get('aexos-office-motion')).toBe('on');
    const reduced = clientHarness({ savedMotion: 'on', reducedMotion: true });
    expect(reduced.document.getElementById('architectural-scene').dataset.motion).toBe('off');
    expect(reduced.document.getElementById('motion-toggle').disabled).toBe(true);
  });

  it.each(['running', 'assigned', 'waiting', 'blocked', 'completed', 'failed'])('binds room markers to actual %s state and removes active motion eligibility on disconnect', (state) => {
    const harness = clientHarness();
    const value = snapshot();
    value.squads[0].id = 'aexos-core';
    value.squads[0].agents.forEach((agent) => { agent.squadId = 'aexos-core'; });
    value.squads[0].agents[1].state = state;
    load(harness, value);
    const layer = harness.document.getElementById('live-agent-markers');
    const marker = layer.children.find((item) => item.dataset.agentKey === 'core/qa');
    expect(marker.dataset.state).toBe(state);
    expect(marker.attributes['aria-label']).toContain('Quinn');
    expect(layer.children.find((item) => item.dataset.agentKey === 'core/dev').dataset.state).toBe('unobserved');
    harness.run("setConnection(false, 'Offline');");
    const disconnected = layer.children.find((item) => item.dataset.agentKey === 'core/qa');
    expect(disconnected.dataset.state).toBe(['running', 'assigned'].includes(state) ? 'stale' : state);
  });

  it('caps scene markers independently of registry size', () => {
    const harness = clientHarness();
    const value = snapshot();
    value.squads = harness.run('ARCHITECTURAL_ROOMS.map(([id]) => ({ id, name: id, agents: Array.from({ length: 100 }, (_, index) => ({ key: id + index, name: "Agent " + index, squadId: id, state: "offline" })) }))');
    load(harness, value);
    expect(harness.document.getElementById('live-agent-markers').children.length).toBeLessThanOrEqual(42);
  });

  it('rejects malformed snapshots without claiming a connected stream', () => {
    const harness = clientHarness();
    harness.run('connectStream();');
    harness.stream.listeners.snapshot({ data: '{invalid' });
    expect(harness.document.getElementById('connection-status').textContent).toBe('Invalid stream data');
    expect(harness.document.getElementById('connection-notice').hidden).toBe(false);
  });
});
