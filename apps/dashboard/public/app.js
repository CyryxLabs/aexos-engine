'use strict';

/* global document, window, navigator */

const HOST_LABELS = Object.freeze({
  cli: 'AEXOS CLI', codex: 'Codex', 'claude-code': 'Claude Code',
  gemini: 'Gemini', grok: 'Grok Bot', chatgpt: 'ChatGPT',
});
const STATUS_LABELS = Object.freeze({
  unobserved: 'Not observed', offline: 'Offline', available: 'Idle', assigned: 'Assigned',
  running: 'Running', waiting: 'Waiting', blocked: 'Blocked', completed: 'Completed',
  failed: 'Failed', stale: 'Stale signal',
});
const ACTIVE_STATES = new Set(['running', 'assigned']);
const POLL_INTERVAL_MS = 5000;
function consumeActivationFragment(fragment, clearFragment) {
  if (!fragment || fragment[0] !== '#') return { requested: false, accessToken: '' };
  const values = new URLSearchParams(fragment.slice(1));
  const type = values.get('type');
  const authFragment = values.has('access_token') || values.has('refresh_token') || values.has('type');
  if (authFragment) clearFragment();
  if (type !== 'invite' && type !== 'recovery') return { requested: false, accessToken: '' };
  const accessToken = values.get('access_token') || '';
  return { requested: true, type, accessToken: accessToken.length < 8000 && /^[A-Za-z0-9_.-]+$/.test(accessToken) ? accessToken : '' };
}
function createActivationFlow(request, complete, fail, pendingChanged, abortIdle) {
  let pending = false;
  return Object.freeze({
    async submit(payload) {
      if (pending) return false;
      pending = true;
      pendingChanged(true);
      try {
        await request(payload);
        await complete();
        return true;
      } catch {
        fail();
        return false;
      } finally {
        pending = false;
        pendingChanged(false);
      }
    },
    abort() {
      if (pending) return false;
      abortIdle();
      return true;
    },
    isPending() { return pending; },
  });
}
let initialActivation = consumeActivationFragment(window.location.hash, () => {
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
});
const dashboardState = window.AexosDashboardState;
const tokenMemory = dashboardState.tokenMemory();
let connectCommand = '';
let baseConnectCommand = '';
const appState = {
  snapshot: null, selectedAgentKey: null, squad: 'all', host: 'all', status: 'all',
  search: '', view: 'rooms', connected: false, executive: false, retry: null, showAllRooms: false,
  session: null, projects: [], projectId: null, catalog: null, pollInFlight: false, generation: 0,
};
const element = (id) => document.getElementById(id);

const ARCHITECTURAL_ROOMS = Object.freeze((window.AEXOS_OFFICE_SCENE?.rooms || []).map((room) => room.imageTuple).filter(Boolean));
const SPATIAL_ROOMS = [...(window.AEXOS_OFFICE_SCENE?.rooms || []), ...(window.AEXOS_OFFICE_SCENE?.supportRooms || [])];
const roomNumber = (id, fallback) => SPATIAL_ROOMS.find((room) => room.id === id)?.number || fallback;
const REFERENCE_IMAGE = window.AEXOS_OFFICE_SCENE.image;
const REFERENCE_WIDTH = REFERENCE_IMAGE.width - REFERENCE_IMAGE.cropX;
const REFERENCE_HEIGHT = REFERENCE_IMAGE.height - REFERENCE_IMAGE.cropY;
let spatialController = null;
let spatialViewChosen = false;
let drawerReturnKey = null;
let communicationRefreshTimer = null;
let communicationSignature = '';
const activationRequested = initialActivation.requested;
let activationType = initialActivation.type || '';
let activationAccessToken = initialActivation.accessToken;
initialActivation.accessToken = '';
initialActivation = null;

const MOTION_STORAGE_KEY = 'aexos-office-motion';
const MAX_SCENE_MARKERS = 42;
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let motionPreference = 'on';
try { motionPreference = window.localStorage?.getItem(MOTION_STORAGE_KEY) === 'off' ? 'off' : 'on'; } catch { /* Storage restrictions must not prevent observation. */ }

function updateMotionPreference() {
  const enabled = motionPreference === 'on' && !motionQuery.matches;
  element('architectural-scene').dataset.motion = enabled ? 'on' : 'off';
  const toggle = element('motion-toggle');
  toggle.textContent = motionQuery.matches ? 'Motion: reduced' : enabled ? 'Motion: on' : 'Motion: off';
  toggle.setAttribute('aria-pressed', String(enabled));
  toggle.setAttribute('aria-label', motionQuery.matches ? 'Motion disabled by your system reduced-motion preference' : 'Toggle decorative and observed activity animation');
  toggle.disabled = motionQuery.matches;
  element('ambience-caption').textContent = enabled ? 'Lighting ambience · decorative only' : 'Still scene · motion disabled';
  updateSpatialSnapshot();
}

function toggleMotion() {
  motionPreference = motionPreference === 'on' ? 'off' : 'on';
  try { window.localStorage?.setItem(MOTION_STORAGE_KEY, motionPreference); } catch { /* The preference still applies for this page. */ }
  updateMotionPreference();
}

function renderAgentMarkers() {
  const layer = element('live-agent-markers');
  layer.replaceChildren();
  let count = 0;
  ARCHITECTURAL_ROOMS.forEach(([id, , x, y, width]) => {
    const squad = appState.snapshot?.squads.find((item) => item.id === id);
    const candidates = (squad?.agents || []).filter(matches).sort((left, right) => {
      const rank = (agent) => ACTIVE_STATES.has(displayState(agent)) ? 3 : agent.lastSeen ? 2 : 1;
      return rank(right) - rank(left);
    });
    const selected = candidates.find((agent) => agent.key === appState.selectedAgentKey);
    const visible = candidates.slice(0, width >= 110 ? 2 : 1);
    if (selected && !visible.includes(selected)) visible[visible.length - 1] = selected;
    visible.forEach((agent, index) => {
      if (count >= MAX_SCENE_MARKERS) return;
      count += 1;
      const state = displayState(agent);
      const marker = button('', () => { drawerReturnKey = 'marker:' + agent.key; selectAgent(agent.key); }, 'scene-agent-marker');
      marker.dataset.focusKey = 'marker:' + agent.key;
      marker.dataset.agentKey = agent.key;
      marker.dataset.state = state;
      marker.dataset.squadId = id;
      marker.style.left = ((x - REFERENCE_IMAGE.cropX + width / 2 + (index - (visible.length - 1) / 2) * 40) / REFERENCE_WIDTH * 100) + '%';
      marker.style.top = ((y - REFERENCE_IMAGE.cropY + 70) / REFERENCE_HEIGHT * 100) + '%';
      marker.setAttribute('aria-label', agent.name + ', ' + (agent.title || agent.role || agent.id) + ', ' + STATUS_LABELS[state] + '. Inspect actual agent.');
      marker.title = agent.name + ' · ' + STATUS_LABELS[state];
      marker.setAttribute('aria-pressed', String(appState.selectedAgentKey === agent.key));
      marker.append(node('span', 'marker-identity', initials(agent.name)), node('span', 'marker-status', STATUS_LABELS[state]));
      layer.append(marker);
    });
  });
  layer.setAttribute('aria-label', count + ' representative agent markers. Open a room or Agent list for every agent.');
}


function openRoom(id) {
  const selected = agents().find((agent) => agent.key === appState.selectedAgentKey);
  if (selected && id !== 'all' && selected.squadId !== id) appState.selectedAgentKey = null;
  appState.squad = id;
  appState.executive = false;
  if (id === 'all') {
    render();
    closeInspector();
    spatialController?.home();
    syncSpatialMode('overview');
    return;
  }
  spatialController?.focusRoom(id);
  drawerReturnKey = document.activeElement?.dataset?.focusKey || null;
  render();
  openInspector();
}

function openInspector() {
  element('signals-panel').hidden = false;
  element('close-inspector').focus({ preventScroll: true });
}

function closeInspector() {
  element('signals-panel').hidden = true;
  if (drawerReturnKey) [...document.querySelectorAll('[data-focus-key]')].find((item) => item.dataset.focusKey === drawerReturnKey)?.focus({ preventScroll: true });
}

function renderArchitecture() {
  const layer = element('room-hotspots');
  layer.replaceChildren();
  const roomMode = appState.view === 'rooms';
  element('scene-viewport').hidden = !roomMode;
  element('office-world').hidden = appState.view !== 'list';
  element('spatial-viewport').hidden = appState.view !== 'spatial';
  spatialController?.setEnabled(appState.view === 'spatial');
  ARCHITECTURAL_ROOMS.forEach(([id, label, x, y, width], index) => {
    const squad = appState.snapshot?.squads.find((item) => item.id === id);
    if (!squad) return;
    const members = squad.agents || [];
    const active = members.filter((agent) => ACTIVE_STATES.has(displayState(agent))).length;
    const matchesFilter = members.some(matches);
    const item = button('', () => openRoom(id), 'room-hotspot');
    item.dataset.focusKey = 'room:' + id;
    item.dataset.squadId = id;
    item.style.left = ((x - REFERENCE_IMAGE.cropX) / REFERENCE_WIDTH * 100) + '%';
    item.style.top = ((y - REFERENCE_IMAGE.cropY) / REFERENCE_HEIGHT * 100) + '%';
    item.style.width = (width / REFERENCE_WIDTH * 100) + '%';
    item.classList.toggle('is-working', active > 0);
    item.classList.toggle('is-filtered', !matchesFilter);
    item.setAttribute('aria-pressed', String(appState.squad === id));
    item.setAttribute('aria-label', label + ': ' + members.length + ' registered agents, ' + active + ' working. Open room.');
    item.append(node('strong', '', String(index + 1).padStart(2, '0') + ' ' + label), node('span', '', members.length + ' agents · ' + active + ' active'));
    layer.append(item);
  });
  const roster = element('room-roster');
  roster.replaceChildren();
  const current = appState.snapshot?.squads.find((item) => item.id === appState.squad);
  element('room-roster-title').textContent = current?.name || 'All agents';
  agents().filter(matches).forEach((agent) => {
    const card = agentCard(agent);
    card.dataset.focusKey = 'roster:' + agent.key;
    roster.append(card);
  });
  if (!roster.children.length) roster.append(node('p', 'detail-note', 'No agents match the current filters. Clear filters or choose another team.'));
  const workingCount = agents().filter((agent) => ACTIVE_STATES.has(displayState(agent))).length;
  element('bridge-status').textContent = appState.connected ? `${workingCount} ${workingCount === 1 ? 'agent' : 'agents'} working · inspect signals` : 'Local stream disconnected';
  renderAgentMarkers();
  renderCommunicationLinks();
}

function renderCommunicationLinks() {
  const svg = element('communication-links');
  if (communicationSignature === 'private') return;
  communicationSignature = 'private';
  svg.replaceChildren();
}


function node(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined && text !== null) result.textContent = String(text);
  return result;
}

function button(text, action, className = '') {
  const result = node('button', className, text);
  result.type = 'button';
  result.addEventListener('click', action);
  return result;
}

function initials(name) {
  return String(name || 'AX').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/)
    .slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'AX';
}

function avatar(agent, size = '') {
  const hash = [...String(agent.key || agent.name)].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const result = node('span', `avatar tone-${hash % 4} ${size}`, initials(agent.name));
  result.setAttribute('aria-hidden', 'true');
  return result;
}

function agents() {
  return (appState.snapshot?.squads || []).flatMap((squad) => squad.agents || []);
}

function sessionsFor(agent) {
  return (appState.snapshot?.sessions || []).filter((session) => session.agentKey === agent.key);
}

function displayState(agent) {
  if (!agent.lastSeen && !agent.observed) return 'unobserved';
  if (!appState.connected && ACTIVE_STATES.has(agent.state)) return 'stale';
  return Object.hasOwn(STATUS_LABELS, agent.state) ? agent.state : 'offline';
}

function matches(agent) {
  return (appState.squad === 'all' || agent.squadId === appState.squad)
    && (appState.status === 'all' || displayState(agent) === appState.status)
    && (appState.host === 'all' || sessionsFor(agent).some((session) => session.host === appState.host))
    && `${agent.name} ${agent.id} ${agent.role || agent.title || ''} ${agent.squadName || ''}`
      .toLowerCase().includes(appState.search);
}

function timestamp(value) {
  if (!value) return 'Never observed';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function stateLabel(agent) {
  const state = displayState(agent);
  return node('span', `agent-state state-${state}`, STATUS_LABELS[state]);
}

function preserveFocus(render) {
  const focused = document.activeElement;
  const focusKey = focused?.dataset?.focusKey;
  render();
  if (focusKey && !document.contains(focused)) {
    [...document.querySelectorAll('[data-focus-key]')].find((item) => item.dataset.focusKey === focusKey)?.focus({ preventScroll: true });
  }
}

function renderNavigation() {
  const nav = element('squad-navigation');
  const orderedSquads = [...(appState.snapshot?.squads || [])].sort((a, b) => roomNumber(a.id, 999) - roomNumber(b.id, 999));
  const allSquads = [{ id: 'all', name: 'All teams', agents: agents() }, ...orderedSquads];
  // Telemetry must not detach a button between pointer-down and click.
  const signature = JSON.stringify([appState.squad, allSquads.map((squad) => [squad.id, squad.name, squad.agents.length])]);
  if (nav.dataset.navigationSignature === signature) return;
  nav.dataset.navigationSignature = signature;
  nav.replaceChildren();
  allSquads.forEach((squad, index) => {
    const item = button('', () => openRoom(squad.id), 'squad-link');
    item.dataset.focusKey = `squad:${squad.id}`;
    item.setAttribute('aria-label', squad.name + ', ' + squad.agents.length + ' agents. Open team.');
    item.title = squad.name;
    item.setAttribute('aria-pressed', String(appState.squad === squad.id));
    item.append(node('span', 'squad-monogram', index ? String(roomNumber(squad.id, index)).padStart(2, '0') : 'AX'), node('span', 'nav-name', squad.name), node('span', 'nav-number', squad.agents.length));
    nav.append(item);
  });
}

function renderHosts() {
  const strip = element('host-strip');
  strip.replaceChildren();
  let live = 0;
  Object.entries(HOST_LABELS).forEach(([id, label]) => {
    const host = (appState.snapshot?.hosts || []).find((item) => item.id === id);
    const status = appState.connected ? host?.status || 'disconnected' : 'disconnected';
    if (status === 'connected') live += 1;
    const item = button('', () => { appState.host = appState.host === id ? 'all' : id; render(); openInspector(); }, `host-card ${status === 'connected' ? 'is-live' : ''}`);
    item.dataset.focusKey = `host:${id}`;
    item.setAttribute('aria-pressed', String(appState.host === id));
    const caption = status === 'connected' ? 'Bridge observed' : status === 'stale' ? 'Stale signal' : 'Disconnected';
    item.setAttribute('aria-label', `${label}: ${caption}. Filter agents by this host.`);
    item.title = `${label} · Last signal: ${timestamp(host?.lastSeen)}. Native integration ${host?.nativeVerified ? 'verified' : 'not verified'}.`;
    const state = node('span', '', caption);
    state.prepend(node('span', `dot ${status === 'connected' ? 'connected' : 'muted'}`));
    item.append(node('strong', '', label), state);
    strip.append(item);
  });
  element('host-summary').textContent = `${live} of 6 hosts observed live`;
}

function agentCard(agent) {
  const item = button('', () => selectAgent(agent.key), 'agent-card');
  item.dataset.focusKey = `agent:${agent.key}`;
  item.dataset.agentKey = agent.key;
  item.setAttribute('aria-pressed', String(appState.selectedAgentKey === agent.key && !appState.executive));
  item.setAttribute('aria-label', `${agent.name}, ${agent.role || agent.title || agent.id}, ${STATUS_LABELS[displayState(agent)]}. Inspect agent.`);
  const copy = node('span', 'agent-copy');
  copy.append(node('strong', 'agent-name', agent.name), node('span', 'agent-role', agent.role || agent.title || agent.id), stateLabel(agent));
  item.append(avatar(agent), copy);
  return item;
}

function renderFloor() {
  const world = element('office-world');
  world.className = `office-world ${appState.view === 'list' ? 'list-view' : ''}`;
  world.replaceChildren();
  const visible = agents().filter(matches);
  const selectedSquad = appState.snapshot?.squads.find((squad) => squad.id === appState.squad);
  element('floor-title').textContent = selectedSquad?.name || 'All teams';
  const filterHost = appState.host === 'all' ? '' : ` · ${HOST_LABELS[appState.host]}`;
  element('result-count').textContent = `${visible.length} of ${agents().length} agents${filterHost}`;
  const overview = appState.view === 'rooms' && appState.squad === 'all' && appState.host === 'all' && appState.status === 'all' && !appState.search;
  let shownRooms = 0;
  (appState.snapshot?.squads || []).forEach((squad, index) => {
    const members = visible.filter((agent) => agent.squadId === squad.id);
    if (overview && !appState.showAllRooms && shownRooms >= 6) return;
    if (!members.length) return;
    shownRooms += 1;
    const room = node('section', 'room');
    const headingId = `room-title-${index}`;
    room.setAttribute('aria-labelledby', headingId);
    const header = node('header', 'room-header');
    const title = node('h3', '', squad.name);
    title.id = headingId;
    const titleGroup = node('div');
    const active = members.filter((agent) => ACTIVE_STATES.has(displayState(agent))).length;
    titleGroup.append(title, node('p', '', `${members.length} agents · ${active ? `${active} working` : 'No active work observed'}`));
    header.append(node('span', 'room-number', String(roomNumber(squad.id, index + 1)).padStart(2, '0')), titleGroup);
    const roster = node('div', 'room-agents');
    const displayed = overview ? [...members].sort((a, b) => Number(ACTIVE_STATES.has(displayState(b))) - Number(ACTIVE_STATES.has(displayState(a)))).slice(0, 4) : members;
    displayed.forEach((agent) => roster.append(agentCard(agent)));
    room.append(header, roster);
    if (displayed.length < members.length) {
      const expand = button(`View all ${members.length} agents`, () => { appState.squad = squad.id; render(); element('floor-title').scrollIntoView({ block: 'start' }); }, 'room-expand');
      expand.dataset.focusKey = `expand:${squad.id}`;
      room.append(expand);
    }
    world.append(room);
  });
  if (overview && appState.snapshot.squads.length > 6) {
    const expand = button(appState.showAllRooms ? 'Show team overview' : `Explore all ${appState.snapshot.squads.length} teams`, () => { appState.showAllRooms = !appState.showAllRooms; render(); }, 'all-rooms');
    expand.dataset.focusKey = 'all-rooms';
    world.append(expand);
  }
  if (!visible.length) {
    const empty = node('div', 'empty-state');
    empty.append(node('h3', '', agents().length ? 'No agents match this view' : 'Your organization is not loaded yet'), node('p', '', agents().length ? 'Try another host, state or search term.' : 'Check the project registry and local collector.'));
    world.append(empty);
  }
}

function detailField(container, label, value) {
  const row = node('div');
  row.append(node('dt', '', label), node('dd', '', value || 'Not reported'));
  container.append(row);
}

function renderDetail() {
  const detail = element('agent-detail');
  if (appState.executive) {
    detail.replaceChildren();
    const profile = window.AEXOS_OFFICE_SCENE?.executive?.profile || { name: 'CEO', title: 'Chief Executive Officer', company: 'Cyryx Labs' };
    const identity = node('div', 'detail-identity');
    const copy = node('div');
    copy.append(node('h3', '', profile.name), node('p', '', profile.title));
    identity.append(avatar({ name: 'Chief Executive', key: 'ceo' }, 'large'), copy);
    detail.append(identity, node('p', 'detail-note', `${profile.company} · Executive profile. This identity is not a connected agent or an observed execution session.`));
    return;
  }
  const agent = agents().find((item) => item.key === appState.selectedAgentKey);
  if (!agent) {
    detail.replaceChildren(node('p', 'detail-note', 'Select an agent in this room to inspect observed work and sessions.'));
    return;
  }
  detail.replaceChildren();
  const identity = node('div', 'detail-identity');
  const copy = node('div');
  copy.append(node('h3', '', agent.name), node('p', '', agent.role || agent.title || agent.id));
  identity.append(avatar(agent, 'large'), copy);
  detail.append(identity, stateLabel(agent));
  const fields = node('dl', 'detail-fields');
  detailField(fields, 'Team', agent.squadName || agent.squadId);
  detailField(fields, 'Story', agent.storyId);
  detailField(fields, 'Last signal', timestamp(agent.lastSeen));
  detail.append(fields);
  const sessions = sessionsFor(agent);
  detail.append(node('p', 'detail-note', sessions.length ? `${sessions.length} observed session${sessions.length === 1 ? '' : 's'}. Host observations do not certify provider execution.` : 'No session observed. This agent is registered; its host has not reported work.'));
  sessions.forEach((session) => {
    const card = node('div', 'session-card');
    card.append(node('strong', '', `${HOST_LABELS[session.host] || session.host || 'Unknown host'} · ${appState.connected ? STATUS_LABELS[session.state] || session.state : 'Connection lost'}`));
    card.append(node('p', '', `Session: ${session.sessionId || 'Not reported'}`), node('p', '', `Run: ${session.runId || 'Not reported'}`));
    if (Number.isFinite(session.progress)) card.append(node('p', '', `Reported progress: ${session.progress}%`));
    card.append(node('p', '', `Evidence: ${session.evidence || 'Not reported'} · ${timestamp(session.lastSeen)}`));
    detail.append(card);
  });
}

function selectAgent(key) {
  appState.selectedAgentKey = key;
  spatialController?.selectAgent(key);
  appState.executive = false;
  render();
  element('live-announcer').textContent = `${agents().find((agent) => agent.key === key)?.name || 'Agent'} selected. Details updated.`;
  openInspector();
  if (window.matchMedia('(max-width: 760px)').matches) {
    element('signals-panel').scrollIntoView({ block: 'start' });
    element('inspector-title').setAttribute('tabindex', '-1');
    element('inspector-title').focus({ preventScroll: true });
  }
}

function eventMatches(event) {
  return (appState.squad === 'all' || event.squadId === appState.squad)
    && (appState.host === 'all' || event.host === appState.host);
}

function renderTimeline() {
  const events = (appState.snapshot?.events || []).filter(eventMatches).slice(0, 20);
  const list = element('event-timeline');
  list.replaceChildren();
  element('event-count').textContent = String(events.length);
  events.forEach((event) => {
    const item = node('li', 'event-item');
    item.append(node('strong', '', `${event.agentName || event.agentId || 'System'} · ${event.type}`));
    item.append(node('p', '', event.state || 'Signal received'));
    const time = node('time', '', `${timestamp(event.timestamp)}${event.host ? ` · ${HOST_LABELS[event.host] || event.host}` : ''}${event.evidence ? ` · ${event.evidence}` : ''}`);
    item.append(time);
    list.append(item);
  });
  if (!events.length) list.append(node('li', 'empty-state', 'No activity observed in this view.'));
  const transcript = element('message-timeline');
  transcript.replaceChildren(node('li', 'empty-state', 'Private message content remains on the local project.'));
}

function render() {
  if (!appState.snapshot) return;
  preserveFocus(() => {
    renderNavigation();
    renderHosts();
    renderFloor();
    renderArchitecture();
    renderDetail();
    renderTimeline();
  });
  element('signals-panel').classList.toggle('has-selection', Boolean(appState.selectedAgentKey || appState.executive));
  element('metric-squads').textContent = String(appState.snapshot.squads.length);
  element('metric-agents').textContent = String(agents().length);
  element('metric-active').textContent = String(agents().filter((agent) => ACTIVE_STATES.has(displayState(agent))).length);
  element('project-name').textContent = appState.projects.find((project) => project.id === appState.projectId)?.label || 'Connected project';
  element('snapshot-time').textContent = `Snapshot ${timestamp(appState.snapshot.generatedAt)}`;
  document.querySelectorAll('[data-view]').forEach((item) => item.setAttribute('aria-pressed', String(item.dataset.view === appState.view)));
  updateSpatialSnapshot();
}

function updateSpatialSnapshot() {
  if (!spatialController || !appState.snapshot) return;
  spatialController.updateSnapshot(appState.snapshot, {
    connected: appState.connected, motion: motionPreference === 'on' && !motionQuery.matches,
    selectedAgentKey: appState.selectedAgentKey, visibleKeys: agents().filter(matches).map((agent) => agent.key),
  });
}

function spatialFallback(reason) {
  element('spatial-fallback').hidden = false;
  element('spatial-fallback-copy').textContent = `${reason || 'Visual office is unavailable.'} Live agents and activity remain available in Agent list.`;
  element('spatial-view-button').disabled = true;
  appState.view = 'list';
  render();
}

function syncSpatialMode(mode) {
  document.querySelectorAll('[data-spatial-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.spatialMode === mode)));
}

function focusSpatialCanvas() {
  const host = element('spatial-canvas-host');
  (host.querySelector?.('canvas') || host).focus({ preventScroll: true });
}

async function startSpatialOffice() {
  if (!window.AexosOfficeScene) return;
  try {
    spatialController = await window.AexosOfficeScene.mount({
      container: element('spatial-canvas-host'), manifest: window.AEXOS_OFFICE_SCENE,
      onAgentSelect: selectAgent, onRoomSelect: openRoom,
      onModeChange: syncSpatialMode,
      onStatus: (text) => { element('spatial-status').textContent = text; }, onFallback: spatialFallback,
    });
    element('spatial-view-button').disabled = false;
    if (!spatialViewChosen) appState.view = 'spatial';
    render();
  } catch (error) {
    console.error('Virtual Office scene initialization failed:', error.message);
    spatialFallback('This browser could not initialize the office scene.');
  }
}

function renderSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.squads)) throw new Error('Invalid office snapshot');
  appState.snapshot = snapshot;
  render();
}

function setConnection(connected, text) {
  appState.connected = connected;
  element('connection-status').textContent = text;
  element('connection-dot').className = `dot ${connected ? 'connected' : 'disconnected'}`;
  element('connection-notice').hidden = connected;
  if (!connected && appState.snapshot) {
    element('notice-title').textContent = 'Live connection interrupted';
    element('notice-copy').textContent = 'Showing the last accepted observation. Active work cannot be confirmed. Reconnecting automatically.';
  }
  render();
}

async function requestJson(url, options = {}) {
  const response = await window.fetch(url, {
    ...options, credentials: 'include', cache: 'no-store',
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  let body = null;
  try { body = await response.json(); } catch { /* Error responses need not expose internals. */ }
  if (!response.ok) {
    const error = new Error(`Request failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function clearPrivateState() {
  window.clearTimeout(appState.retry);
  appState.generation += 1;
  appState.snapshot = null; appState.projects = []; appState.projectId = null;
  appState.session = null; appState.catalog = null; appState.pollInFlight = false;
  appState.selectedAgentKey = null; appState.executive = false;
  tokenMemory.clear(); connectCommand = ''; baseConnectCommand = ''; element('ingest-token').textContent = ''; element('connect-command').textContent = '';
  element('observe-codex').checked = false;
  element('token-reveal').hidden = true; setupDialog.close(false);
  element('cloud-controls').hidden = true; setConnection(false, 'Signed out');
  ['squad-navigation', 'host-strip', 'live-agent-markers', 'room-hotspots', 'room-roster', 'event-timeline', 'message-timeline', 'office-world'].forEach((id) => element(id).replaceChildren());
  element('communication-links').replaceChildren(); element('signals-panel').hidden = true;
  element('agent-detail').replaceChildren(node('p', 'empty-detail', 'Sign in to inspect observed agent metadata.'));
  element('project-name').textContent = 'Private workspace'; element('snapshot-time').textContent = 'Signed out';
  ['metric-squads', 'metric-agents', 'metric-active'].forEach((id) => { element(id).textContent = '—'; });
  spatialController?.updateSnapshot({ squads: [], sessions: [], messages: [], events: [], heartbeatTtlMs: 30000 }, { connected: false, motion: false, visibleKeys: [] });
}

function setOfficeAvailable(available) {
  const surface = element('office-surface');
  surface.inert = !available;
  if (available) surface.removeAttribute('aria-hidden');
  else surface.setAttribute('aria-hidden', 'true');
}

const setupDialog = dashboardState.createSetupDialog({
  dialog: element('project-setup'), document, setOfficeAvailable,
  canRestore: () => Boolean(appState.session && document.body.dataset.authState === 'authenticated' && element('auth-gate').hidden),
  fallback: () => element('project-select'),
});

function showLogin(message = '') {
  clearActivationState();
  clearPrivateState();
  setOfficeAvailable(false);
  document.body.dataset.authState = 'unauthenticated';
  element('auth-gate').hidden = false; element('login-form').hidden = false;
  element('auth-copy').textContent = 'Sign in to view private execution metadata from your connected projects.';
  element('auth-error').hidden = !message; element('auth-error').textContent = message;
  element('login-password').value = '';
  element('login-email').focus();
}

function clearActivationState() {
  activationAccessToken = '';
  activationType = '';
  element('activation-password').value = '';
  element('activation-confirm').value = '';
  element('activation-form').hidden = true;
}

function showActivation() {
  clearPrivateState();
  setOfficeAvailable(false);
  document.body.dataset.authState = 'activation';
  element('auth-gate').hidden = false;
  element('login-form').hidden = true;
  element('activation-form').hidden = false;
  element('auth-copy').textContent = activationType === 'invite'
    ? 'Define a password to activate your invited private access.'
    : 'Define a new password to recover your private access.';
  element('auth-error').hidden = true;
  element('auth-error').textContent = '';
  element('activation-password').focus();
}

const activationFlow = createActivationFlow(
  ({ accessToken, password }) => requestJson('/api/activate', { method: 'POST', body: JSON.stringify({ accessToken, password }) }),
  async () => { clearActivationState(); await bootstrapSession(); },
  () => showLogin('This activation link is invalid or expired. Request a new link.'),
  (pending) => {
    element('activation-form').querySelector('button[type="submit"]').disabled = pending;
    element('activation-abort').disabled = pending;
    if (pending) element('auth-copy').textContent = 'Activating private access… Keep this page open.';
  },
  () => showLogin(),
);

function renderProjects() {
  const select = element('project-select'); select.replaceChildren();
  appState.projects.forEach((project) => {
    const option = node('option', '', `${project.label} · ${project.connected ? 'connected' : 'awaiting bridge'}`); option.value = project.id;
    option.selected = project.id === appState.projectId; select.append(option);
  });
  element('cloud-controls').hidden = false;
  element('close-setup').hidden = appState.projects.length === 0;
}

function clearTokenReveal() {
  tokenMemory.clear(); connectCommand = ''; baseConnectCommand = ''; element('ingest-token').textContent = ''; element('connect-command').textContent = '';
  element('observe-codex').checked = false;
  element('copy-status').textContent = ''; element('token-reveal').hidden = true;
  element('project-form').hidden = appState.projects.length > 0;
  if (appState.projects.length) setupDialog.close();
  else setupDialog.open(element('project-label'));
}

function revealBinding(body, trigger) {
  const binding = dashboardState.binding(body);
  tokenMemory.set(binding.ingestToken); baseConnectCommand = binding.command;
  element('observe-codex').checked = false;
  connectCommand = dashboardState.observationCommand(baseConnectCommand, false);
  element('ingest-token').textContent = tokenMemory.read(); element('connect-command').textContent = connectCommand;
  element('project-form').hidden = true; element('token-reveal').hidden = false;
  element('copy-status').textContent = '';
  setupDialog.open(element('project-setup').querySelector('.setup-card'), trigger);
}

element('observe-codex').addEventListener('change', () => {
  if (!baseConnectCommand) return;
  connectCommand = dashboardState.observationCommand(baseConnectCommand, element('observe-codex').checked);
  element('connect-command').textContent = connectCommand;
  element('copy-status').textContent = '';
});

function schedulePoll(delay = POLL_INTERVAL_MS) {
  window.clearTimeout(appState.retry);
  if (appState.session && appState.projectId) appState.retry = window.setTimeout(pollSnapshot, delay);
}

async function pollSnapshot() {
  if (!appState.projectId || appState.pollInFlight) return;
  const generation = appState.generation; const projectId = appState.projectId;
  window.clearTimeout(appState.retry); appState.pollInFlight = true;
  try {
    const snapshot = dashboardState.snapshot(await requestJson(`/api/snapshot?projectId=${encodeURIComponent(projectId)}`), projectId);
    if (generation !== appState.generation || projectId !== appState.projectId) return;
    renderSnapshot(snapshot);
    const connection = dashboardState.connection(snapshot); setConnection(connection.live, connection.label);
    if (!connection.live) {
      element('notice-title').textContent = connection.title;
      element('notice-copy').textContent = connection.setup
        ? 'This project has not connected yet. Issue a one-time token, then start the local bridge.'
        : 'Showing the last accepted observation. Historical metadata does not prove continuing activity.';
    }
  } catch (error) {
    if (error.status === 401) return showLogin('Your session ended. Sign in again.');
    setConnection(false, navigator.onLine === false ? 'Browser offline' : 'Dashboard unavailable');
    const loading = element('office-loading');
    if (loading && !appState.snapshot) loading.textContent = 'No observation is available yet. The dashboard will retry automatically.';
  } finally {
    appState.pollInFlight = false; schedulePoll();
  }
}

async function loadAuthenticatedWorkspace() {
  const [projectsBody, catalog] = await Promise.all([requestJson('/api/projects'), requestJson('/api/catalog')]);
  appState.projects = dashboardState.projects(projectsBody);
  appState.catalog = catalog; appState.projectId = appState.projects[0]?.id || null;
  document.body.dataset.authState = 'authenticated'; element('auth-gate').hidden = true; setOfficeAvailable(true);
  renderProjects();
  if (!appState.projectId) {
    element('project-form').hidden = false; setupDialog.open(element('project-label'));
    setConnection(false, 'No project connected');
  } else {
    startOfficeConnection();
  }
}

async function bootstrapSession() {
  try {
    const session = await requestJson('/api/session');
    if (!session?.authenticated || !session.user?.id || !session.user?.email) return showLogin();
    appState.session = session.user; await loadAuthenticatedWorkspace();
  } catch { showLogin('The private dashboard could not be loaded. Try again.'); }
}

function startOfficeConnection() {
  element('connection-status').textContent = 'Connecting…'; schedulePoll(0);
}

element('agent-search').addEventListener('input', (event) => { appState.search = event.target.value.trim().toLowerCase(); render(); element('signals-panel').hidden = false; });
element('status-filter').addEventListener('change', (event) => { appState.status = event.target.value; render(); element('signals-panel').hidden = false; });
element('reset-view').addEventListener('click', () => {
  appState.search = ''; appState.squad = 'all'; appState.host = 'all'; appState.status = 'all';
  element('agent-search').value = ''; element('status-filter').value = 'all'; render();
});
document.querySelectorAll('[data-view]').forEach((item) => item.addEventListener('click', () => { spatialViewChosen = true; appState.view = item.dataset.view; render(); }));
element('retry-connection').addEventListener('click', startOfficeConnection);
element('login-form').addEventListener('submit', async (event) => {
  event.preventDefault(); element('auth-error').hidden = true;
  const submit = event.currentTarget.querySelector('button[type="submit"]'); submit.disabled = true;
  try {
    await requestJson('/api/login', { method: 'POST', body: JSON.stringify({ email: element('login-email').value.trim(), password: element('login-password').value }) });
    await bootstrapSession();
  } catch { showLogin('Email or password was not accepted.'); }
  finally { submit.disabled = false; }
});
element('activation-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = element('activation-password').value;
  const confirmation = element('activation-confirm').value;
  element('auth-error').hidden = true;
  if (!activationAccessToken) return showLogin('This activation link is invalid or expired. Request a new link.');
  if (password.length < 12 || password.length > 1024 || password !== confirmation) {
    element('auth-error').textContent = password !== confirmation ? 'Passwords must match.' : 'Use a password between 12 and 1024 characters.';
    element('auth-error').hidden = false;
    return;
  }
  await activationFlow.submit({ accessToken: activationAccessToken, password });
});
element('activation-abort').addEventListener('click', () => activationFlow.abort());
element('logout').addEventListener('click', async () => {
  let warning = '';
  try { await requestJson('/api/logout', { method: 'POST', body: '{}' }); }
  catch { warning = 'Signed out locally. A connection failure prevented confirmation that the server revoked this session.'; }
  showLogin(warning);
});
element('project-select').addEventListener('change', (event) => {
  clearTokenReveal();
  appState.generation += 1; appState.projectId = event.target.value; appState.snapshot = null; setConnection(false, 'Connecting…'); startOfficeConnection();
});
element('project-form').addEventListener('submit', async (event) => {
  event.preventDefault(); element('setup-error').hidden = true;
  const submit = event.currentTarget.querySelector('button[type="submit"]'); submit.disabled = true;
  const generation = appState.generation;
  try {
    const body = await requestJson('/api/projects', { method: 'POST', body: JSON.stringify({ label: element('project-label').value.trim() }) });
    if (generation !== appState.generation) return;
    if (!body?.project?.id || !body.project.label) throw new Error('Invalid project response');
    appState.projects.push(body.project); appState.projectId = body.project.id; renderProjects(); revealBinding(body); startOfficeConnection();
  } catch { element('setup-error').textContent = 'The project could not be created. Check the label and try again.'; element('setup-error').hidden = false; element('setup-error').focus(); }
  finally { submit.disabled = false; }
});
element('rotate-token').addEventListener('click', async (event) => {
  if (!appState.projectId) return;
  const trigger = event.currentTarget;
  const generation = appState.generation;
  element('setup-error').hidden = true;
  try {
    const body = await requestJson(`/api/projects/${encodeURIComponent(appState.projectId)}/token`, { method: 'POST', body: '{}' });
    if (generation !== appState.generation) return;
    revealBinding(body, trigger);
  } catch { element('setup-error').textContent = 'A new token could not be issued. Try again.'; element('setup-error').hidden = false; setupDialog.open(element('setup-error'), trigger); }
});
element('copy-token').addEventListener('click', async () => {
  if (!tokenMemory.read()) return;
  try { await navigator.clipboard.writeText(tokenMemory.read()); element('copy-status').textContent = 'Token copied. Run the non-secret command, paste into the hidden CLI prompt, then clear this screen.'; }
  catch { element('copy-status').textContent = 'Copy was blocked. Select the token text and copy it manually.'; }
});
element('copy-command').addEventListener('click', async () => {
  if (!connectCommand) return;
  try { await navigator.clipboard.writeText(connectCommand); element('copy-status').textContent = 'Connection command copied. It contains no ingest token.'; }
  catch { element('copy-status').textContent = 'Copy was blocked. Select the connection command and copy it manually.'; }
});
element('clear-token').addEventListener('click', clearTokenReveal);
element('close-setup').addEventListener('click', () => { if (appState.projects.length) clearTokenReveal(); });
element('project-setup').addEventListener('keydown', (event) => {
  setupDialog.handleKeyDown(event, () => { if (appState.projects.length) clearTokenReveal(); });
});
element('ceo-presence').addEventListener('click', () => {
  appState.executive = true; openInspector(); element('signals-panel').classList.add('has-selection'); renderDetail();
  element('signals-panel').scrollIntoView({ block: 'nearest' });
  element('inspector-title').setAttribute('tabindex', '-1');
  element('inspector-title').focus({ preventScroll: true });
});
window.addEventListener('offline', () => setConnection(false, 'Browser offline'));
window.addEventListener('online', startOfficeConnection);
window.addEventListener('beforeunload', () => { spatialController?.dispose(); window.clearTimeout(appState.retry); window.clearInterval(communicationRefreshTimer); tokenMemory.clear(); connectCommand = ''; baseConnectCommand = ''; });
element('signals-panel').hidden = true;
element('motion-toggle').addEventListener('click', toggleMotion);
motionQuery.addEventListener?.('change', updateMotionPreference);
updateMotionPreference();
element('close-inspector').addEventListener('click', closeInspector);
element('command-bridge').addEventListener('click', () => { appState.squad = 'all'; render(); openInspector(); element('timeline-title').scrollIntoView({ block: 'nearest' }); });
element('open-activity').addEventListener('click', () => { openInspector(); element('timeline-title').scrollIntoView({ block: 'nearest' }); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeInspector(); });
// Expire observed links even when the stream is otherwise quiet. This never invents activity.
communicationRefreshTimer = window.setInterval(renderCommunicationLinks, 1000);
renderHosts();
if (activationRequested && activationAccessToken) showActivation();
else if (activationRequested) showLogin('This activation link is invalid or expired. Request a new link.');
else bootstrapSession();
element('spatial-home').addEventListener('click', () => { spatialController?.home(); syncSpatialMode('overview'); focusSpatialCanvas(); });
document.querySelectorAll('[data-spatial-mode]').forEach((item) => item.addEventListener('click', () => {
  spatialController?.setMode(item.dataset.spatialMode);
  syncSpatialMode(item.dataset.spatialMode);
  focusSpatialCanvas();
}));
startSpatialOffice();
