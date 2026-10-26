'use strict';

/* global document, EventSource, window, navigator */

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
const appState = {
  snapshot: null, selectedAgentKey: null, squad: 'all', host: 'all', status: 'all',
  search: '', view: 'rooms', connected: false, executive: false, stream: null, retry: null, showAllRooms: false,
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
      marker.title = agent.name + ' · ' + STATUS_LABELS[state] + (agent.task ? ' · ' + agent.task : '');
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
  const resolveRoom = (identity) => {
    const target = agents().find((agent) => [agent.key, agent.id, agent.name].includes(identity));
    return ARCHITECTURAL_ROOMS.find((room) => room[0] === target?.squadId);
  };
  const ttl = appState.snapshot?.heartbeatTtlMs || 30000;
  const links = appState.connected ? (appState.snapshot?.messages || [])
    .filter((event) => event.collaborationMessage && Date.now() - event.timestamp <= ttl)
    .slice(0, 12).flatMap((event) => {
      const from = resolveRoom(event.sender || event.agentKey || event.agentId);
      const to = resolveRoom(event.recipient);
      if (!from || !to || from[0] === to[0]) return [];
      return [{ id: event.id || 'observed-message', from, to }];
    }) : [];
  const signature = JSON.stringify(links);
  if (signature === communicationSignature) return;
  communicationSignature = signature;
  svg.replaceChildren();
  links.forEach(({ id, from, to }) => {
    const startX = from[2] - REFERENCE_IMAGE.cropX + from[4] / 2;
    const endX = to[2] - REFERENCE_IMAGE.cropX + to[4] / 2;
    const startY = from[3] - 34;
    const endY = to[3] - 34;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M ' + startX + ' ' + startY + ' Q 758 440 ' + endX + ' ' + endY);
    path.setAttribute('class', 'observed-link');
    path.setAttribute('data-message-id', id);
    svg.append(path);
  });
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
  detailField(fields, 'Task', agent.task);
  detailField(fields, 'Story', agent.storyId);
  detailField(fields, 'Tool', agent.toolName || agent.command);
  detailField(fields, 'Last signal', timestamp(agent.lastSeen));
  detail.append(fields);
  const sessions = sessionsFor(agent);
  detail.append(node('p', 'detail-note', sessions.length ? `${sessions.length} observed session${sessions.length === 1 ? '' : 's'}. Host observations do not certify provider execution.` : 'No session observed. This agent is registered; its host has not reported work.'));
  sessions.forEach((session) => {
    const card = node('div', 'session-card');
    card.append(node('strong', '', `${HOST_LABELS[session.host] || session.host || 'Unknown host'} · ${appState.connected ? STATUS_LABELS[session.state] || session.state : 'Connection lost'}`));
    card.append(node('p', '', `Session: ${session.sessionId || 'Not reported'}`), node('p', '', `Run: ${session.runId || 'Not reported'}`));
    if (session.task) card.append(node('p', '', session.task));
    if (Number.isFinite(session.progress)) card.append(node('p', '', `Reported progress: ${session.progress}%`));
    card.append(node('p', '', `Evidence: ${session.evidence || 'Not reported'} · ${timestamp(session.lastSeen)}`));
    detail.append(card);
  });
  const collectorPort = String(window.location?.port || '');
  const portArgument = /^\d{1,5}$/.test(collectorPort) && Number(collectorPort) > 0 && Number(collectorPort) <= 65535 ? ` --port ${Number(collectorPort)}` : '';
  const command = `npx @aexos/core office status --json${portArgument}`;
  detail.append(button('Copy CLI status command', async (event) => {
    const target = event.currentTarget;
    try {
      await navigator.clipboard.writeText(command);
      target.textContent = 'Copied to clipboard';
    } catch {
      element('live-announcer').textContent = `Clipboard unavailable. Command: ${command}`;
      target.textContent = command;
    }
  }, 'copy-command'));
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
    item.append(node('p', '', event.toolName || event.task || event.message || event.state || 'Signal received'));
    const time = node('time', '', `${timestamp(event.timestamp)}${event.host ? ` · ${HOST_LABELS[event.host] || event.host}` : ''}${event.evidence ? ` · ${event.evidence}` : ''}`);
    item.append(time);
    if (event.ignoredReason) item.append(node('p', '', `Ignored: ${event.ignoredReason}`));
    list.append(item);
  });
  if (!events.length) list.append(node('li', 'empty-state', 'No activity observed in this view.'));
  const messages = (appState.snapshot?.messages || appState.snapshot?.events?.filter((event) => event.collaborationMessage) || []).filter(eventMatches).slice(0, 12);
  const transcript = element('message-timeline');
  transcript.replaceChildren();
  messages.forEach((event) => {
    const item = node('li', 'message-card');
    item.append(node('strong', '', `${event.sender || event.agentName || event.agentId || 'Unknown sender'} → ${event.recipient || 'Recipient not reported'}`));
    item.append(node('p', '', event.collaborationMessage));
    item.append(node('small', '', `${timestamp(event.timestamp)} · ${event.deliveryStatus || 'observed-only'} · ${event.evidence || 'Evidence not reported'}`));
    if (event.runId || event.correlationId) item.append(node('p', 'subtle', `Run: ${event.runId || 'Not reported'} · Correlation: ${event.correlationId || 'Not reported'}`));
    transcript.append(item);
  });
  if (!messages.length) transcript.append(node('li', 'empty-state', 'No public messages observed. Private or unavailable conversations are not shown.'));
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
  element('project-name').textContent = appState.snapshot.project || 'Local project';
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

function applyDelta(delta) {
  if (!appState.snapshot) return;
  (delta.changed || []).forEach((agent) => {
    appState.snapshot.squads.forEach((squad) => {
      const index = squad.agents.findIndex((item) => item.key === agent.key);
      if (index !== -1) squad.agents[index] = agent;
    });
  });
  ['hosts', 'sessions', 'messages', 'counts'].forEach((field) => {
    if (delta[field]) appState.snapshot[field] = delta[field];
  });
  if (delta.event) {
    appState.snapshot.events = [delta.event, ...(appState.snapshot.events || []).filter((event) => event.id !== delta.event.id)].slice(0, 200);
    appState.snapshot.generatedAt = Date.now();
    element('live-announcer').textContent = `${delta.event.agentName || 'System'}: ${delta.event.type}`;
  }
  render();
}

function setConnection(connected, text) {
  appState.connected = connected;
  element('connection-status').textContent = text;
  element('connection-dot').className = `dot ${connected ? 'connected' : 'disconnected'}`;
  element('connection-notice').hidden = connected;
  if (!connected && appState.snapshot) {
    element('notice-title').textContent = 'Live connection interrupted';
    element('notice-copy').textContent = 'Showing the last snapshot. Active work cannot be confirmed. Reconnecting automatically; start npx @aexos/core office if the collector stopped.';
  }
  render();
}

function connectStream() {
  appState.stream?.close();
  const stream = new EventSource('/api/events');
  appState.stream = stream;
  stream.addEventListener('snapshot', (message) => {
    try {
      const snapshot = JSON.parse(message.data);
      renderSnapshot(snapshot);
      setConnection(true, 'Local stream connected');
    } catch {
      setConnection(false, 'Invalid stream data');
    }
  });
  stream.addEventListener('delta', (message) => {
    try { applyDelta(JSON.parse(message.data)); } catch { setConnection(false, 'Invalid stream data'); }
  });
  stream.addEventListener('error', () => setConnection(false, 'Reconnecting…'));
}

async function startOfficeConnection() {
  window.clearTimeout(appState.retry);
  appState.stream?.close();
  element('connection-status').textContent = 'Connecting…';
  try {
    const response = await fetch('/api/snapshot', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Snapshot request failed: ${response.status}`);
    renderSnapshot(await response.json());
    connectStream();
  } catch {
    setConnection(false, 'Collector unavailable');
    const loading = element('office-loading');
    if (loading) loading.textContent = 'Cannot load the registry. Start npx @aexos/core office, then retry the connection.';
    appState.retry = window.setTimeout(startOfficeConnection, 3000);
  }
}

element('agent-search').addEventListener('input', (event) => { appState.search = event.target.value.trim().toLowerCase(); render(); element('signals-panel').hidden = false; });
element('status-filter').addEventListener('change', (event) => { appState.status = event.target.value; render(); element('signals-panel').hidden = false; });
element('reset-view').addEventListener('click', () => {
  appState.search = ''; appState.squad = 'all'; appState.host = 'all'; appState.status = 'all';
  element('agent-search').value = ''; element('status-filter').value = 'all'; render();
});
document.querySelectorAll('[data-view]').forEach((item) => item.addEventListener('click', () => { spatialViewChosen = true; appState.view = item.dataset.view; render(); }));
element('retry-connection').addEventListener('click', startOfficeConnection);
element('ceo-presence').addEventListener('click', () => {
  appState.executive = true; openInspector(); element('signals-panel').classList.add('has-selection'); renderDetail();
  element('signals-panel').scrollIntoView({ block: 'nearest' });
  element('inspector-title').setAttribute('tabindex', '-1');
  element('inspector-title').focus({ preventScroll: true });
});
window.addEventListener('beforeunload', () => { spatialController?.dispose(); appState.stream?.close(); window.clearTimeout(appState.retry); window.clearInterval(communicationRefreshTimer); });
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
startOfficeConnection();
element('spatial-home').addEventListener('click', () => { spatialController?.home(); syncSpatialMode('overview'); focusSpatialCanvas(); });
document.querySelectorAll('[data-spatial-mode]').forEach((item) => item.addEventListener('click', () => {
  spatialController?.setMode(item.dataset.spatialMode);
  syncSpatialMode(item.dataset.spatialMode);
  focusSpatialCanvas();
}));
startSpatialOffice();
