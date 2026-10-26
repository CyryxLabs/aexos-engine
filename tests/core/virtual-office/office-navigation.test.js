'use strict';
const path = require('path');
const OFFICE_ROOT = path.resolve(process.cwd(), '.aexos-core/core/virtual-office/public');
const manifest = require(path.join(OFFICE_ROOT, 'scene-manifest.js'));
const navigation = require(path.join(OFFICE_ROOT, 'office-navigation.js'));
const presence = require(path.join(OFFICE_ROOT, 'office-presence.js'));
const scene = require(path.join(OFFICE_ROOT, 'office-scene.js'));

describe('Navigable Virtual Office', () => {
  it('uses one immutable 23-room manifest for pictured identities, floor polygons and presence', () => {
    expect(manifest.rooms).toHaveLength(23);
    expect(new Set(manifest.rooms.map((room) => room.id)).size).toBe(23);
    expect(Object.isFrozen(manifest.rooms[0].desks)).toBe(true);
    for (const room of manifest.rooms) {
      expect(room.imageTuple[0]).toBe(room.id);
      expect(room.desks.length).toBeGreaterThanOrEqual(6);
      expect(room.desks.every((desk) => desk.y === 0 && Number.isFinite(desk.x) && Number.isFinite(desk.z))).toBe(true);
      expect(room.footprint.length).toBeGreaterThanOrEqual(3);
    }
  });
  it('routes from reception to all 23 entrances without crossing furniture or floor boundaries', () => {
    for (const room of [...manifest.rooms, ...manifest.supportRooms]) {
      const route = navigation.planRoute(manifest, manifest.navigation.start, room.entrance);
      expect(route).not.toBeNull();
      expect(route.at(-1).y).toBe(room.y);
      for (let index = 1; index < route.length; index++) expect(navigation.segmentClear(manifest, route[index - 1], route[index])).toBe(true);
    }
  });
  it('rejects furniture footprints, floor edges and nonfinite destinations', () => {
    for (const room of manifest.rooms) expect(navigation.walkable(manifest, room.x, room.z)).toBeNull();
    const edge = manifest.navigation.walkable[0][0];
    expect(navigation.walkable(manifest, edge.x, edge.z)).toBeNull();
    expect(navigation.planRoute(manifest, manifest.navigation.start, { x: 100, z: 100 })).toBeNull();
    expect(navigation.planRoute(manifest, manifest.navigation.start, { x: Infinity, z: NaN })).toBeNull();
  });
  it('walks a routed destination on the single floor without teleporting or stepping through furniture', () => {
    const visitor = navigation.create(manifest);
    const destination = manifest.rooms[0].entrance;
    expect(visitor.navigate(destination)).toBe(true);
    let previous = visitor.getPosition();
    for (let index = 0; index < 1600 && visitor.getRoute().length; index++) {
      visitor.update(.05);
      const next = visitor.getPosition();
      expect(Math.hypot(next.x - previous.x, next.z - previous.z)).toBeLessThanOrEqual(.26);
      expect(navigation.walkable(manifest, next.x, next.z)).not.toBeNull();
      previous = next;
    }
    expect(visitor.getRoute()).toHaveLength(0);
    expect(visitor.getPosition().y).toBe(0);
    expect(Math.hypot(visitor.getPosition().x - destination.x, visitor.getPosition().z - destination.z)).toBeLessThan(.15);
  });
  it('bounds keyboard movement and leaves the visitor untouched after an invalid destination', () => {
    const visitor = navigation.create(manifest);
    for (let index = 0; index < 150; index++) visitor.move(1, 0, .1);
    expect(navigation.walkable(manifest, visitor.getPosition().x, visitor.getPosition().z)).not.toBeNull();
    const before = visitor.getPosition();
    expect(visitor.navigate({ x: NaN, z: 10 })).toBe(false);
    expect(visitor.getPosition()).toEqual(before);
    visitor.home(); expect(visitor.getPosition()).toEqual(manifest.navigation.start);
  });
  it('reports stationary rather than walking when a wall blocks movement or no time elapsed', () => {
    const bounded = { navigation: { start: { x: .839, z: 0, y: 0 }, radius: .16, speed: 3.2,
      walkable: [[{ x: -1, z: -1 }, { x: 1, z: -1 }, { x: 1, z: 1 }, { x: -1, z: 1 }]], obstacles: [] } };
    const visitor = navigation.create(bounded); const start = visitor.getPosition(); const direction = visitor.getDirection();
    visitor.move(1, 0, .1);
    expect(visitor.getPosition()).toEqual(start); expect(visitor.isMoving()).toBe(false); expect(visitor.getDirection()).toEqual(direction);
    visitor.move(-1, 0, 0); expect(visitor.isMoving()).toBe(false); expect(visitor.getPosition()).toEqual(start);
  });
  it('round-trips real floor anchors through the calibrated affine projection', () => {
    const projection = scene.projectionFor(manifest);
    for (const point of [manifest.navigation.start, ...manifest.rooms.flatMap((room) => [room.entrance, ...room.desks])]) {
      const result = projection.unproject(projection.project(point));
      expect(result.x).toBeCloseTo(point.x, 10); expect(result.z).toBeCloseTo(point.z, 10); expect(result.y).toBe(0);
    }
    expect(() => scene.projectionFor({ projection: { origin: { x: 0, y: 0 }, axisX: { x: 1, y: 1 }, axisZ: { x: 2, y: 2 } } })).toThrow('projection is invalid');
  });
  it('updates real identity/session state without resetting visitor or desk assignments', () => {
    const visitor = navigation.create(manifest); visitor.move(1, 0, .1); const before = visitor.getPosition();
    const model = presence.createModel(manifest);
    const agent = { key: 'aexos-core/dev', id: 'dev', name: 'Vulcan', state: 'running', observed: true, lastSeen: Date.now() };
    const data = { squads: [{ id: 'aexos-core', agents: [agent] }], sessions: [{ agentKey: agent.key, host: 'cli', sessionId: 'one' }, { agentKey: agent.key, host: 'gemini', sessionId: 'two' }] };
    model.update(data, { connected: true }); const anchor = model.records.get(agent.key).anchor;
    agent.state = 'blocked'; model.update(data, { connected: true, selectedAgentKey: agent.key });
    expect(model.records.get(agent.key).anchor).toBe(anchor);
    expect(model.records.get(agent.key).state).toBe('blocked');
    expect(model.records.get(agent.key).sessions).toHaveLength(2);
    expect(model.records.get(agent.key).selected).toBe(true);
    expect(visitor.getPosition()).toEqual(before);
    agent.state = 'running'; model.update(data, { connected: false });
    expect(model.records.get(agent.key).state).toBe('stale');
  });
  it('preserves registered versus observed truth and expires only actual public links', () => {
    const model = presence.createModel(manifest); const now = Date.now();
    const data = { heartbeatTtlMs: 1000, squads: [{ id: 'aexos-core', agents: [{ key: 'core/a', id: 'a', name: 'A' }, { key: 'core/b', id: 'b', name: 'B' }] }], messages: [{ id: 'one', sender: 'a', recipient: 'b', collaborationMessage: 'Public status', timestamp: now }] };
    model.update(data, { connected: true, visibleKeys: ['core/a'] });
    expect(model.records.get('core/a').state).toBe('unobserved');
    expect(model.records.get('core/b').visible).toBe(false);
    expect(model.getLinks(now)).toHaveLength(0);
    model.update(data, { connected: true });
    expect(model.getLinks(now)).toHaveLength(1);
    expect(model.getLinks(now + 1001)).toHaveLength(0);
    model.update(data, { connected: false }); expect(model.getLinks(now)).toHaveLength(0);
  });
  it('keeps surviving anchors while assigning new catalog identities to vacant desks', () => {
    const model = presence.createModel(manifest);
    const update = (ids) => model.update({ squads: [{ id: 'aexos-core', agents: ids.map((key) => ({ key, id: key })) }] }, { connected: true });
    update(['a', 'b', 'c']); const surviving = model.records.get('b').anchor;
    update(['b', 'new']);
    expect(model.records.get('b').anchor).toBe(surviving);
    expect(model.records.get('new').anchor).not.toBe(surviving);
  });
  it('does not invent a communication endpoint from ambiguous catalog aliases', () => {
    const model = presence.createModel(manifest); const now = Date.now();
    const data = { squads: [{ id: 'aexos-core', agents: [{ key: 'core/a', id: 'chief', name: 'Same' }, { key: 'core/b', id: 'chief', name: 'Same' }, { key: 'core/c', id: 'c', name: 'C' }] }], messages: [{ id: 'message', sender: 'chief', recipient: 'c', collaborationMessage: 'Public', timestamp: now }] };
    model.update(data, { connected: true }); expect(model.getLinks(now)).toHaveLength(0);
    data.messages[0].sender = 'Same'; model.update(data, { connected: true }); expect(model.getLinks(now)).toHaveLength(0);
    data.messages[0].sender = 'core/a'; model.update(data, { connected: true }); expect(model.getLinks(now)).toHaveLength(1);
  });
  it('exposes actionable module-load fallback without any execution operation', async () => {
    const scene = require(path.join(OFFICE_ROOT, 'office-scene.js')); const onFallback = jest.fn();
    await expect(scene.mount({ onFallback })).rejects.toBeDefined();
    expect(onFallback).toHaveBeenCalledWith(expect.stringContaining('Live agent lists and inspection remain available'));
  });
});
