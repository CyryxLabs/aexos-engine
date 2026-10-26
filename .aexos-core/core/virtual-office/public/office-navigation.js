'use strict';
/* global window */
(function registerNavigation(root) {
  // Manifest geometry is immutable for the lifetime of a mounted office.
  const geometryCache = new WeakMap();
  const inside = (point, bounds, margin = 0) => point.x >= bounds.minX + margin && point.x <= bounds.maxX - margin && point.z >= bounds.minZ + margin && point.z <= bounds.maxZ - margin;
  function distanceToSegment(point, from, to) {
    const dx = to.x - from.x; const dz = to.z - from.z;
    const ratio = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.z - from.z) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(point.x - from.x - dx * ratio, point.z - from.z - dz * ratio);
  }
  function pointInPolygon(point, polygon) {
    let result = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
      const a = polygon[index]; const b = polygon[previous];
      if (distanceToSegment(point, a, b) < .00001) return true;
      if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) result = !result;
    }
    return result;
  }
  function edgeDistance(point, polygon) {
    return Math.min(...polygon.map((vertex, index) => distanceToSegment(point, vertex, polygon[(index + 1) % polygon.length])));
  }
  function polygonOf(item) {
    if (Array.isArray(item)) return item;
    if (item.polygon) return item.polygon;
    return [{ x: item.minX, z: item.minZ }, { x: item.maxX, z: item.minZ }, { x: item.maxX, z: item.maxZ }, { x: item.minX, z: item.maxZ }];
  }
  function geometryFor(manifest) {
    let geometry = geometryCache.get(manifest);
    if (geometry) return geometry;
    function prepare(item) {
      const polygon = polygonOf(item);
      const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
      polygon.forEach((point) => {
        bounds.minX = Math.min(bounds.minX, point.x); bounds.maxX = Math.max(bounds.maxX, point.x);
        bounds.minZ = Math.min(bounds.minZ, point.z); bounds.maxZ = Math.max(bounds.maxZ, point.z);
      });
      return { item, polygon, bounds };
    }
    geometry = {
      regions: (manifest.navigation.walkable || manifest.navigation.polygons || manifest.navigation.surfaces || []).map(prepare),
      obstacles: (manifest.navigation.obstacles || []).map(prepare),
    };
    geometryCache.set(manifest, geometry);
    return geometry;
  }
  function surfaceAt(manifest, x, z) {
    const point = { x, z };
    const region = geometryFor(manifest).regions.find(({ polygon, bounds }) => inside(point, bounds, -.00001) && pointInPolygon(point, polygon));
    const surface = region?.item;
    return surface ? { y: surface.y || 0, id: surface.id || 'office-floor', stair: false } : null;
  }
  function walkable(manifest, x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const surface = surfaceAt(manifest, x, z);
    if (!surface) return null;
    const point = { x, z }; const radius = manifest.navigation.radius || .2;
    const { regions, obstacles } = geometryFor(manifest);
    if (!regions.some(({ polygon, bounds }) => inside(point, bounds, -.00001) && pointInPolygon(point, polygon) && edgeDistance(point, polygon) >= radius)) return null;
    if (obstacles.some(({ polygon, bounds }) => inside(point, bounds, -Math.max(radius, .00001)) && (pointInPolygon(point, polygon) || edgeDistance(point, polygon) < radius))) return null;
    return { x, z, y: surface.y };
  }
  function segmentClear(manifest, from, to) {
    const distance = Math.hypot(to.x - from.x, to.z - from.z);
    const count = Math.max(1, Math.ceil(distance / Math.max(.05, (manifest.navigation.radius || .2) / 2)));
    if (count > 10000) return false;
    for (let index = 1; index <= count; index++) {
      if (!walkable(manifest, from.x + (to.x - from.x) * index / count, from.z + (to.z - from.z) * index / count)) return false;
    }
    return true;
  }
  function planRoute(manifest, from, target) {
    const startPoint = walkable(manifest, from.x, from.z); const targetPoint = walkable(manifest, target.x, target.z);
    if (!startPoint || !targetPoint) return null;
    if (segmentClear(manifest, startPoint, targetPoint)) return [startPoint, targetPoint];
    const step = manifest.navigation.step || .5;
    const grid = (point) => ({ x: Math.round(point.x / step), z: Math.round(point.z / step) });
    const key = (point) => `${point.x},${point.z}`;
    const start = grid(from); const end = grid(target); const heap = [];
    const records = new Map([[key(start), { point: startPoint, parent: null, cost: 0 }]]);
    function push(item) {
      heap.push(item); let index = heap.length - 1;
      while (index > 0) { const parent = (index - 1) >> 1; if (heap[parent].score <= item.score) break; heap[index] = heap[parent]; index = parent; }
      heap[index] = item;
    }
    function pop() {
      const first = heap[0]; const last = heap.pop();
      if (heap.length) {
        let index = 0;
        while (index * 2 + 1 < heap.length) {
          let child = index * 2 + 1;
          if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++;
          if (heap[child].score >= last.score) break;
          heap[index] = heap[child]; index = child;
        }
        heap[index] = last;
      }
      return first;
    }
    push({ ...start, score: 0, cost: 0 });
    let visited = 0;
    while (heap.length && visited++ < 22000) {
      const current = pop(); const record = records.get(key(current));
      if (current.cost !== record.cost) continue;
      if (Math.hypot(record.point.x - targetPoint.x, record.point.z - targetPoint.z) <= step * 1.5 && segmentClear(manifest, record.point, targetPoint)) {
        const route = [targetPoint]; let lookup = key(current);
        while (lookup) { const item = records.get(lookup); route.unshift(item.point); lookup = item.parent; }
        return route;
      }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const next = { x: current.x + dx, z: current.z + dz }; const cost = record.cost + Math.hypot(dx, dz);
        if (records.has(key(next)) && records.get(key(next)).cost <= cost) continue;
        const point = walkable(manifest, next.x * step, next.z * step);
        if (!point || !segmentClear(manifest, record.point, point)) continue;
        records.set(key(next), { point, cost, parent: key(current) });
        push({ ...next, cost, score: cost + Math.hypot(end.x - next.x, end.z - next.z) });
      }
    }
    return null;
  }
  function create(manifest) {
    let position = { ...manifest.navigation.start }; let route = []; let moved = false; let direction = { x: 0, z: 1 };
    const speed = manifest.navigation.speed || 4;
    function step(dx, dz) {
      if (!Number.isFinite(dx) || !Number.isFinite(dz) || Math.hypot(dx, dz) < .000001) return false;
      const target = { x: position.x + dx, z: position.z + dz };
      if (!segmentClear(manifest, position, target)) return false;
      position = walkable(manifest, target.x, target.z); direction = { x: dx, z: dz }; return true;
    }
    return {
      getPosition: () => ({ ...position }), getDirection: () => ({ ...direction }),
      getRoute: () => route.map((point) => ({ ...point })), isMoving: () => moved,
      home() { position = { ...manifest.navigation.start }; route = []; moved = false; },
      navigate(target) { const planned = planRoute(manifest, position, target); if (!planned) return false; route = planned.slice(1); return true; },
      move(dx, dz, delta) {
        route = []; moved = false; const length = Math.hypot(dx, dz); if (!length) return;
        const distance = Math.max(0, Math.min(delta, .1)) * speed; const pieces = Math.max(1, Math.ceil(distance / .1));
        for (let index = 0; index < pieces; index++) {
          const x = dx / length * distance / pieces; const z = dz / length * distance / pieces;
          moved = step(x, z) || step(x, 0) || step(0, z) || moved;
        }
      },
      update(delta) {
        moved = false; let remaining = Math.max(0, Math.min(delta, .1)) * speed;
        while (route.length && remaining > 0) {
          const next = route[0]; const dx = next.x - position.x; const dz = next.z - position.z; const distance = Math.hypot(dx, dz);
          if (distance < .001) { route.shift(); continue; }
          const amount = Math.min(.1, remaining, distance);
          if (!step(dx / distance * amount, dz / distance * amount)) { route = []; break; }
          moved = true; remaining -= amount;
        }
      },
    };
  }
  const api = { create, surfaceAt, walkable, planRoute, inside, pointInPolygon, segmentClear };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AexosOfficeNavigation = api;
}(typeof window !== 'undefined' ? window : null));
