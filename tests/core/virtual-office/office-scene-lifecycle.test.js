'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const publicRoot = path.resolve(process.cwd(), '.aexos-core/core/virtual-office/public');
const manifest = require(path.join(publicRoot, 'scene-manifest'));
const navigation = require(path.join(publicRoot, 'office-navigation'));
const presence = require(path.join(publicRoot, 'office-presence'));

// Canvas, image loading and scheduling are boundaries; controller, projection,
// collision routing and presence are the actual shipped implementations.
function harness({ missingContext = false, imageFailure = false, sceneManifest = manifest } = {}) {
  function target() {
    const listeners = new Map();
    return {
      style: {}, dataset: {},
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
      removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
      fire(type, event = {}) { const payload = { preventDefault: jest.fn(), ...event }; [...(listeners.get(type) || [])].forEach((fn) => fn(payload)); return payload; },
      listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 700 }),
      setAttribute: jest.fn(), focus: jest.fn(), setPointerCapture: jest.fn(), remove: jest.fn(),
    };
  }
  const context = { measureText: (text) => ({ width: text.length * 6 }) };
  for (const name of ['beginPath', 'moveTo', 'lineTo', 'closePath', 'save', 'restore', 'ellipse', 'fill', 'translate', 'scale', 'rotate', 'drawImage', 'stroke', 'setTransform', 'fillRect', 'strokeRect', 'fillText', 'setLineDash', 'clip']) context[name] = jest.fn();
  const canvas = { ...target(), getContext: () => missingContext ? null : context };
  const document = { ...target(), hidden: false, createElement: () => canvas };
  const queue = new Map(); let nextFrame = 0; let observer; let now = 0; let model;
  const timers = new Map(); let nextTimer = 0;
  const window = {
    setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout(id) { timers.delete(id); },
    devicePixelRatio: 1, performance: { now: () => now },
    requestAnimationFrame: jest.fn((fn) => { queue.set(++nextFrame, fn); return nextFrame; }),
    cancelAnimationFrame: jest.fn((id) => queue.delete(id)),
    ResizeObserver: class { constructor(fn) { observer = this; this.callback = fn; this.observe = jest.fn(); this.disconnect = jest.fn(); } },
    Image: class { set src(value) { this.source = value; if (imageFailure) this.onerror(); else this.onload(); } },
    AexosOfficeNavigation: navigation,
    AexosOfficePresence: { createModel(value) { model = presence.createModel(value); return model; } },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(publicRoot, 'office-scene.js'), 'utf8'), { window, document, module });
  const onFallback = jest.fn(); const onModeChange = jest.fn(); const onAgentSelect = jest.fn(); const onStatus = jest.fn();
  const container = { ...target(), append: jest.fn() };
  const options = { container, manifest: sceneManifest, onFallback, onModeChange, onAgentSelect, onStatus };
  const plate = { id: 'plate' }; const atlas = { id: 'atlas' }; const walkAtlas = { id: 'walk' };
  let controller;
  function create() { controller = module.exports.createController(options, plate, atlas, walkAtlas); return controller; }
  function frame(time) { now = time; const entry = queue.entries().next().value; expect(entry).toBeDefined(); queue.delete(entry[0]); entry[1](time); }
  return { timers, flushTimers() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((fn) => fn()); }, create, mount: () => module.exports.mount(options), get controller() { return controller; }, get model() { return model; }, get observer() { return observer; }, window, document, canvas, context, queue, frame, onFallback, onModeChange, onAgentSelect, onStatus, plate, atlas, walkAtlas, container };
}

function snapshot(state) {
  const agentKey = 'aexos-core/dev';
  return { squads: [{ id: 'aexos-core', agents: [{ key: agentKey, id: 'dev', name: 'Vulcan', observed: true, state }] }], sessions: [{ agentKey, host: 'cli', sessionId: 'one' }, { agentKey, host: 'codex', sessionId: 'two' }] };
}

describe('Layered canvas office lifecycle', () => {
  let h;
  afterEach(() => h?.controller?.dispose());

  it.each(['mouse', 'touch'])('cancels pending room selection when double %s targets a blocked pod', (pointerType) => {
    h = harness(); h.create(); h.frame(100);
    const projection = require(path.join(publicRoot, 'office-scene')).projectionFor(manifest);
    const obstacle = manifest.navigation.obstacles[0];
    const polygon = Array.isArray(obstacle) ? obstacle : obstacle.polygon;
    const point = projection.project({ x: polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length, z: polygon.reduce((sum, p) => sum + p.z, 0) / polygon.length });
    const fit = 1000 / manifest.plate.width;
    const event = { pointerId: 1, pointerType, clientX: (point.x - manifest.plate.width / 2) * fit + 500, clientY: (point.y - manifest.plate.height / 2) * fit + 350 };
    const camera = h.controller.getDiagnostics().camera;
    h.canvas.fire('pointerdown', event); h.canvas.fire('pointerup', event);
    expect(h.timers.size).toBe(1);
    h.canvas.fire('pointerdown', event); h.canvas.fire('pointerup', event);
    if (pointerType === 'mouse') h.canvas.fire('dblclick', event);
    h.flushTimers();
    expect(h.onStatus).toHaveBeenLastCalledWith(expect.stringContaining('blocked'));
    expect(h.controller.getDiagnostics().camera).toEqual(camera);
    expect(h.controller.getDiagnostics().routeLength).toBe(0);
  });

  it.each(['disable', 'loss', 'dispose'])('cancels pending single picks on %s', (action) => {
    h = harness(); h.create(); h.frame(100);
    const event = { pointerId: 1, pointerType: 'mouse', clientX: 500, clientY: 350 };
    h.canvas.fire('pointerdown', event); h.canvas.fire('pointerup', event);
    expect(h.timers.size).toBe(1);
    if (action === 'disable') h.controller.setEnabled(false);
    else if (action === 'loss') h.canvas.fire('contextlost');
    else h.controller.dispose();
    expect(h.timers.size).toBe(0);
  });

  it('fills portrait mobile canvases, permits horizontal panning and restores desktop contain fit on resize', () => {
    h = harness(); h.create(); h.frame(100);
    expect(h.context.scale).toHaveBeenCalledWith(1000 / manifest.plate.width, 1000 / manifest.plate.width);
    h.container.getBoundingClientRect = () => ({ width: 290, height: 590 });
    h.observer.callback(); h.context.scale.mockClear(); h.frame(200);
    expect(h.context.scale).toHaveBeenCalledWith(590 / manifest.plate.height, 590 / manifest.plate.height);
    const centered = h.controller.getDiagnostics().camera.x;
    h.canvas.fire('pointerdown', { pointerId: 1, clientX: 145, clientY: 295 });
    h.canvas.fire('pointermove', { pointerId: 1, clientX: 200, clientY: 295 });
    h.canvas.fire('pointerup', { pointerId: 1, clientX: 200, clientY: 295 });
    expect(h.controller.getDiagnostics().camera.x).toBeLessThan(centered);
    h.container.getBoundingClientRect = () => ({ width: 1000, height: 700 });
    h.observer.callback(); h.context.scale.mockClear(); h.frame(300);
    expect(h.context.scale).toHaveBeenCalledWith(1000 / manifest.plate.width, 1000 / manifest.plate.width);
    expect(h.controller.getDiagnostics().camera.x).toBe(manifest.plate.width / 2);
  });

  it('renders on invalidation only, suspends hidden/disabled views and cleans up idempotently', () => {
    h = harness(); h.create(); h.frame(100); const draws = h.context.drawImage.mock.calls.length;
    h.frame(200); expect(h.context.drawImage).toHaveBeenCalledTimes(draws);
    h.document.hidden = true; h.document.fire('visibilitychange'); h.frame(300);
    expect(h.queue.size).toBe(0); expect(h.controller.getDiagnostics().frames).toBe(1);
    h.document.hidden = false; h.document.fire('visibilitychange'); h.document.fire('visibilitychange'); expect(h.queue.size).toBe(1);
    h.controller.setEnabled(false); expect(h.queue.size).toBe(0);
    h.controller.setEnabled(true); h.controller.setEnabled(true); expect(h.queue.size).toBe(1);
    h.frame(400); expect(h.controller.getDiagnostics().frames).toBe(2);
    const late = [...h.queue.values()][0];
    h.controller.dispose(); h.controller.dispose(); late(500);
    expect(h.queue.size).toBe(0); expect(h.canvas.listenerCount()).toBe(0); expect(h.document.listenerCount()).toBe(0);
    expect(h.observer.disconnect).toHaveBeenCalledTimes(1); expect(h.canvas.remove).toHaveBeenCalledTimes(1);
    expect(h.model.records.size).toBe(0); expect(h.controller.getDiagnostics().frames).toBe(2);
    h.document.fire('visibilitychange'); h.controller.setEnabled(true); expect(h.queue.size).toBe(0);
  });

  it.each([{ missingContext: true }, { imageFailure: true }])('retains actionable list fallback when startup fails: %p', async (failure) => {
    h = harness(failure);
    await expect(h.mount()).rejects.toThrow();
    expect(h.onFallback).toHaveBeenCalledWith(expect.stringContaining('Live agent lists and inspection remain available'));
    expect(h.container.append).not.toHaveBeenCalled(); expect(h.queue.size).toBe(0);
  });

  it('cancels canvas drawing on context loss and retains presence for actionable fallback', () => {
    h = harness(); h.create(); h.frame(100); const late = [...h.queue.values()][0];
    h.canvas.fire('contextlost'); h.canvas.fire('contextlost');
    expect(h.onFallback).toHaveBeenCalledTimes(1); expect(h.queue.size).toBe(0);
    h.controller.updateSnapshot(snapshot('failed'), { connected: true });
    expect(h.model.records.get('aexos-core/dev').state).toBe('failed');
    late(200); h.document.fire('visibilitychange'); h.controller.setEnabled(true);
    expect(h.queue.size).toBe(0); expect(h.controller.getDiagnostics().frames).toBe(1);
  });

  it.each([false, true])('selects canonical sprite identity except when covered by a foreground occluder: %p', (covered) => {
    const occluders = covered ? [{ depth: 9999, polygon: [{ x: 0, y: 0 }, { x: 1586, y: 0 }, { x: 1586, y: 992 }, { x: 0, y: 992 }] }] : [];
    h = harness({ sceneManifest: { ...manifest, occluders } }); h.create(); h.controller.updateSnapshot(snapshot('running'), { connected: true }); h.frame(100);
    const anchor = manifest.rooms[0].desks[0];
    const sprite = manifest.atlas.frames[anchor.frame]; const spriteHeight = anchor.height || sprite.displayHeight || manifest.atlas.personHeight;
    const projection = require(path.join(publicRoot, 'office-scene')).projectionFor(manifest);
    const image = projection.project(anchor); const fit = Math.min(1000 / manifest.plate.width, 700 / manifest.plate.height);
    const event = { pointerId: 1, clientX: (image.x - manifest.plate.width / 2) * fit + 500,
      clientY: (image.y - spriteHeight / 2 - manifest.plate.height / 2) * fit + 350, pointerType: 'mouse' };
    h.canvas.fire('pointerdown', event); h.canvas.fire('pointerup', event); h.flushTimers();
    if (covered) { expect(h.context.clip).toHaveBeenCalled(); expect(h.onAgentSelect).not.toHaveBeenCalled(); }
    else expect(h.onAgentSelect).toHaveBeenCalledWith('aexos-core/dev');
  });

  it('preserves camera/visitor and updates selected status and multiple sessions across SSE/disconnect', () => {
    h = harness(); h.create(); h.controller.setMode('walk'); h.frame(100);
    h.canvas.fire('keydown', { key: 'D' }); h.frame(200); h.canvas.fire('keyup', { key: 'D' });
    h.canvas.fire('wheel', { clientX: 500, clientY: 350, deltaY: -100 });
    const before = h.controller.getDiagnostics(); const settings = { connected: true, selectedAgentKey: 'aexos-core/dev' };
    h.controller.updateSnapshot(snapshot('running'), settings); h.frame(300);
    expect(h.context.fillText.mock.calls.some(([text]) => text === 'Vulcan · running')).toBe(true);
    h.controller.updateSnapshot(snapshot('failed'), settings); h.frame(400);
    expect(h.context.fillText.mock.calls.at(-1)[0]).toBe('Vulcan · failed');
    h.controller.updateSnapshot(snapshot('running'), { ...settings, connected: false }); h.frame(500);
    expect(h.context.fillText.mock.calls.at(-1)[0]).toBe('Vulcan · stale');
    const after = h.controller.getDiagnostics(); expect(after.camera).toEqual(before.camera); expect(after.visitor).toEqual(before.visitor);
    expect(h.model.records.get('aexos-core/dev').sessions).toHaveLength(2);
    expect(h.model.records.get('aexos-core/dev').selected).toBe(true); expect(after.connected).toBe(false);
  });

  it('uses walking frames only while moving with motion enabled, preserving intentional movement under reduced motion', () => {
    h = harness(); h.create(); h.controller.updateSnapshot(snapshot('running'), { connected: true, motion: false });
    h.controller.setMode('walk'); h.frame(100); const start = h.controller.getDiagnostics().visitor;
    h.canvas.fire('keydown', { key: 'd' }); h.frame(200);
    expect(h.controller.getDiagnostics().visitor).not.toEqual(start);
    expect(h.context.drawImage.mock.calls.some(([image]) => image === h.walkAtlas)).toBe(false);
    h.controller.updateSnapshot(snapshot('running'), { connected: true, motion: true }); h.frame(400);
    expect(h.context.drawImage.mock.calls.some(([image]) => image === h.walkAtlas)).toBe(true);
    h.canvas.fire('keyup', { key: 'd' }); h.context.drawImage.mockClear(); h.frame(500);
    expect(h.context.drawImage.mock.calls.some(([image]) => image === h.walkAtlas)).toBe(false);
    h.controller.updateSnapshot(snapshot('running'), { connected: true, motion: false }); h.frame(550);
    const frames = h.controller.getDiagnostics().frames; h.frame(600); expect(h.controller.getDiagnostics().frames).toBe(frames);
    h.controller.home(); expect(h.controller.getDiagnostics().visitor).toEqual(manifest.navigation.start);
    expect(h.onModeChange).toHaveBeenLastCalledWith('overview');
  });

  it('pulses only observed running activity and keeps other state indicators steady without invented work', () => {
    h = harness(); h.create();
    const strokes = [];
    h.context.stroke.mockImplementation(() => strokes.push(h.context.strokeStyle));
    h.controller.updateSnapshot(snapshot('running'), { connected: true }); h.frame(100);
    expect(strokes).toContain('#56bfa8');
    let frames = h.controller.getDiagnostics().frames; h.frame(200);
    expect(h.controller.getDiagnostics().frames).toBe(frames + 1);
    for (const [state, color] of [['blocked', '#d4a760'], ['failed', '#d1847e'], ['assigned', '#789fae']]) {
      strokes.length = 0; h.controller.updateSnapshot(snapshot(state), { connected: true }); h.frame(300);
      expect(strokes).toContain(color);
      frames = h.controller.getDiagnostics().frames; h.frame(400); expect(h.controller.getDiagnostics().frames).toBe(frames);
    }
    for (const state of ['running', 'blocked', 'failed']) {
      strokes.length = 0; h.controller.updateSnapshot(snapshot(state), { connected: false }); h.frame(500);
      expect(strokes.some((color) => ['#56bfa8', '#d4a760', '#d1847e'].includes(color))).toBe(false);
      frames = h.controller.getDiagnostics().frames; h.frame(600); expect(h.controller.getDiagnostics().frames).toBe(frames);
    }
    strokes.length = 0;
    const unobserved = snapshot('running'); unobserved.squads[0].agents[0].observed = false;
    h.controller.updateSnapshot(unobserved, { connected: true }); h.frame(700);
    expect(strokes).not.toContain('#56bfa8');
    frames = h.controller.getDiagnostics().frames; h.frame(800); expect(h.controller.getDiagnostics().frames).toBe(frames);
    h.controller.updateSnapshot(snapshot('running'), { connected: true, motion: false }); h.frame(900);
    expect(strokes).toContain('#56bfa8');
    frames = h.controller.getDiagnostics().frames; h.frame(1000); expect(h.controller.getDiagnostics().frames).toBe(frames);
  });
});
