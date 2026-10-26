'use strict';
/* global window, document */
(function registerOfficeScene(root) {
  function projectionFor(manifest) {
    const projection = manifest.projection;
    const origin = projection.origin;
    const axisX = projection.axisX; const axisZ = projection.axisZ;
    const determinant = axisX.x * axisZ.y - axisZ.x * axisX.y;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < .00001) throw new Error('Office floor projection is invalid');
    return {
      project(point) { return { x: origin.x + point.x * axisX.x + point.z * axisZ.x, y: origin.y + point.x * axisX.y + point.z * axisZ.y }; },
      unproject(point) { const x = point.x - origin.x; const y = point.y - origin.y; return { x: (x * axisZ.y - axisZ.x * y) / determinant, z: (axisX.x * y - x * axisX.y) / determinant, y: 0 }; },
      vector(x, y) { return { x: (x * axisZ.y - axisZ.x * y) / determinant, z: (axisX.x * y - x * axisX.y) / determinant }; },
    };
  }
  function imageInside(point, polygon) {
    let inside = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
      const a = polygon[index]; const b = polygon[previous];
      if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  async function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new root.Image(); image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('A packaged office image could not be loaded'));
      image.src = source;
    });
  }
  async function mount(options) {
    try {
      const manifest = options.manifest;
      const [plate, atlas, walkAtlas] = await Promise.all([loadImage(manifest.plate.src), loadImage(manifest.atlas.src), manifest.walkAtlas ? loadImage(manifest.walkAtlas.src) : null]);
      return createController(options, plate, atlas, walkAtlas);
    } catch (error) {
      options.onFallback?.('The isometric office could not start. Live agent lists and inspection remain available.');
      throw error;
    }
  }
  function createController(options, plate, atlas, walkAtlas) {
    const { container, manifest } = options;
    const projection = projectionFor(manifest);
    const navigation = root.AexosOfficeNavigation.create(manifest);
    const model = root.AexosOfficePresence.createModel(manifest);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas rendering is unavailable');
    canvas.tabIndex = 0; canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
    canvas.setAttribute('aria-label', 'Isometric office. Drag to pan, wheel or pinch to zoom. In Walk mode use WASD or arrows. Double-click an open corridor to move your local visitor.');
    container.append(canvas);
    const listeners = []; const keys = new Set(); const pointers = new Map();
    const camera = { x: manifest.plate.width / 2, y: manifest.plate.height / 2, zoom: 1 };
    const rooms = [...manifest.rooms, ...(manifest.supportRooms || [])];
    const minimumZoom = manifest.camera.minZoom || 1; const maximumZoom = manifest.camera.maxZoom || 2.4;
    let width = 1; let height = 1; let fit = 1; let ratio = 1; let mode = 'overview';
    let enabled = true; let disposed = false; let contextLost = false; let motion = true; let dirty = true;
    let request = null; let lastTime = 0; let frameCount = 0; let totalRenderMs = 0; let lastRenderMs = 0; let drawCalls = 0;
    let figures = []; let hitPeople = []; let selectedKey = null; let hoverKey = null; let pinchDistance = 0; let lastTap = null;
    let pendingPick = null;
    let currentSnapshot = null; let currentSettings = {}; let lastLinkStamp = '';
    const scale = () => fit * camera.zoom;
    const activityColors = { running: '#56bfa8', assigned: '#789fae', blocked: '#d4a760', failed: '#d1847e' };
    function hasActivity(agent) { return currentSettings.connected && (agent.observed || agent.lastSeen) && activityColors[agent.state]; }
    function listen(target, type, handler, settings) { target.addEventListener(type, handler, settings); listeners.push(() => target.removeEventListener(type, handler, settings)); }
    function getDiagnostics() { return { renderer: 'canvas2d-layered-isometric', webgl: false, disposed, enabled, contextLost, mode, frames: frameCount, averageRenderMs: frameCount ? totalRenderMs / frameCount : 0, lastRenderMs, drawCalls, triangles: 0, agents: model.records.size, visibleAgents: figures.filter((agent) => agent.visible).length, occluders: (manifest.occluders || []).length, visitor: navigation.getPosition(), routeLength: navigation.getRoute().length, camera: { ...camera, fixedProjection: true }, width: canvas.width, height: canvas.height, connected: Boolean(currentSettings.connected), hasSnapshot: Boolean(currentSnapshot) }; }
    function cancelPick() { if (pendingPick !== null) root.clearTimeout(pendingPick); pendingPick = null; lastTap = null; }
    function publishDiagnostics() { container.setAttribute('data-scene-diagnostics', JSON.stringify(getDiagnostics())); }
    listen(canvas, 'contextlost', () => {
      if (disposed || contextLost) return;
      contextLost = true; enabled = false; cancelPick(); keys.clear(); pointers.clear();
      if (request !== null) root.cancelAnimationFrame(request);
      request = null; publishDiagnostics();
      options.onFallback?.('The office canvas became unavailable. Live agent lists and inspection remain available.');
    });
    function clampCamera() {
      const halfWidth = width / (2 * scale()); const halfHeight = height / (2 * scale());
      camera.x = halfWidth >= manifest.plate.width / 2 ? manifest.plate.width / 2 : Math.max(halfWidth, Math.min(manifest.plate.width - halfWidth, camera.x));
      camera.y = halfHeight >= manifest.plate.height / 2 ? manifest.plate.height / 2 : Math.max(halfHeight, Math.min(manifest.plate.height - halfHeight, camera.y));
    }
    function toImage(point) { return { x: camera.x + (point.x - width / 2) / scale(), y: camera.y + (point.y - height / 2) / scale() }; }
    function pointer(event) { const bounds = canvas.getBoundingClientRect(); return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }; }
    function toScreen(point) { return { x: (point.x - camera.x) * scale() + width / 2, y: (point.y - camera.y) * scale() + height / 2 }; }
    function resize() {
      const bounds = container.getBoundingClientRect(); width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
      ratio = Math.min(root.devicePixelRatio || 1, manifest.limits.pixelRatio || 2);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      const fitDimension = width < 600 && height > width ? Math.max : Math.min;
      fit = fitDimension(width / manifest.plate.width, height / manifest.plate.height);
      clampCamera(); dirty = true;
    }
    function path(polygon) { context.beginPath(); polygon.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)); context.closePath(); }
    function frameFor(agent, visitor = false) {
      const frames = manifest.atlas.frames;
      const entries = Array.isArray(frames) ? frames : Object.values(frames);
      if (visitor) {
        if (walkAtlas && motion && navigation.isMoving()) {
          const walkingFrames = manifest.walkAtlas.frames;
          return walkingFrames[Math.floor(root.performance.now() / 140) % walkingFrames.length];
        }
        return frames[manifest.atlas.visitorFrame ?? 0] || entries[0];
      }
      if (agent.anchor.frame !== undefined) return frames[agent.anchor.frame] || entries[0];
      const pose = agent.anchor.pose || 'seated'; const choices = entries.filter((frame) => frame.pose === pose);
      const pool = choices.length ? choices : entries;
      const hash = [...agent.key].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);
      return pool[hash % pool.length];
    }
    function person(agent, visitor = false) {
      const point = projection.project(agent.anchor); const sprite = frameFor(agent, visitor);
      const spriteHeight = agent.anchor.height || sprite.displayHeight || manifest.atlas.personHeight || 52;
      const spriteWidth = spriteHeight * sprite.width / sprite.height;
      const anchorX = sprite.anchorX ?? .5; const anchorY = sprite.anchorY ?? 1;
      const left = point.x - spriteWidth * (anchorX <= 1 ? anchorX : anchorX / sprite.width);
      const bob = visitor && motion && navigation.isMoving() ? Math.sin(root.performance.now() / 110) * .45 : 0;
      const top = point.y - spriteHeight * (anchorY <= 1 ? anchorY : anchorY / sprite.height) - bob;
      context.save(); context.fillStyle = 'rgba(0,0,0,.28)'; context.beginPath();
      context.ellipse(point.x, point.y + 1, spriteWidth * .24, Math.max(1.5, spriteHeight * .045), -.25, 0, Math.PI * 2); context.fill();
      if (!visitor && hasActivity(agent)) {
        const pulse = motion && agent.state === 'running' ? (Math.sin(root.performance.now() / 600) + 1) / 2 : 0;
        context.save(); context.strokeStyle = activityColors[agent.state]; context.lineWidth = 1.2 / scale();
        context.globalAlpha = .65 + pulse * .2; context.beginPath();
        context.ellipse(point.x, point.y + 2, spriteWidth * .3 + pulse * 1.2, Math.max(2, spriteHeight * .055) + pulse * .4, -.25, 0, Math.PI * 2);
        context.stroke(); context.restore();
      }
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      context.save();
      const direction = navigation.getDirection();
      const visitorFacingLeft = projection.project(direction).x < projection.project({ x: 0, z: 0 }).x;
      if (agent.anchor.flip || (visitor && visitorFacingLeft)) { context.translate(point.x * 2, 0); context.scale(-1, 1); }
      const source = visitor && walkAtlas && motion && navigation.isMoving() ? walkAtlas : atlas;
      context.drawImage(source, sprite.x, sprite.y, sprite.width, sprite.height, left, top, spriteWidth, spriteHeight); drawCalls++;
      context.restore();
      if (visitor || agent.key === selectedKey) {
        context.strokeStyle = visitor ? '#d5b66f' : '#4ce0c6'; context.lineWidth = 1 / scale();
        context.beginPath(); context.moveTo(point.x - 5, point.y + 4); context.lineTo(point.x, point.y + 6); context.lineTo(point.x + 5, point.y + 4); context.stroke();
      }
      context.restore();
      if (!visitor) hitPeople.push({ key: agent.key, left, top, width: spriteWidth, height: spriteHeight, depth: point.y, point });
    }
    function labelFor(key) {
      const agent = model.records.get(key); if (!agent?.visible) return;
      const foot = projection.project(agent.anchor); const screen = toScreen(foot);
      const sprite = frameFor(agent); const spriteHeight = agent.anchor.height || sprite.displayHeight || manifest.atlas.personHeight || 52;
      const text = `${agent.name} · ${agent.state === 'unobserved' ? 'Not observed' : agent.state}`;
      context.save(); context.setTransform(ratio, 0, 0, ratio, 0, 0); context.font = '600 12px system-ui, sans-serif';
      const boxWidth = Math.min(width - 16, context.measureText(text).width + 20);
      const x = Math.max(8, Math.min(width - boxWidth - 8, screen.x - boxWidth / 2));
      const y = Math.max(8, Math.min(height - 30, screen.y - spriteHeight * scale() - 34));
      context.fillStyle = 'rgba(9,17,19,.94)'; context.fillRect(x, y, boxWidth, 26); context.strokeStyle = '#b79c62'; context.lineWidth = 1; context.strokeRect(x, y, boxWidth, 26);
      context.fillStyle = '#f6f4ec'; context.fillText(text, x + 10, y + 17, boxWidth - 20); context.restore();
    }
    function render(now) {
      const started = root.performance.now(); drawCalls = 0; hitPeople = [];
      context.setTransform(ratio, 0, 0, ratio, 0, 0); context.fillStyle = '#080d0e'; context.fillRect(0, 0, width, height);
      context.translate(width / 2, height / 2); context.scale(scale(), scale()); context.translate(-camera.x, -camera.y);
      context.drawImage(plate, 0, 0, manifest.plate.width, manifest.plate.height); drawCalls++;
      // Names belong to the physical sign locations; live status stays in the inspector.
      context.save(); context.font = '500 12px system-ui, sans-serif'; context.textBaseline = 'middle';
      context.fillStyle = '#f1efe6'; context.shadowColor = 'rgba(0,0,0,.7)'; context.shadowBlur = 2;
      rooms.forEach((room) => {
        if (!room.label) return;
        context.save(); context.translate(room.label.x, room.label.y); context.rotate(-.28);
        context.fillText(room.name, 0, 0, 140); context.restore();
      });
      context.restore();
      const route = navigation.getRoute();
      if (mode === 'walk' && route.length) {
        context.save(); context.lineWidth = 1.2 / scale(); context.strokeStyle = 'rgba(233,198,122,.7)'; context.setLineDash([3 / scale(), 5 / scale()]); context.beginPath();
        [navigation.getPosition(), ...route].map(projection.project).forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)); context.stroke(); context.restore();
      }
      const layers = (manifest.occluders || []).map((occluder) => ({ depth: occluder.depth, occluder }));
      figures.filter((agent) => agent.visible).forEach((agent) => layers.push({ depth: projection.project(agent.anchor).y + (agent.anchor.depthOffset || 0), agent }));
      if (mode === 'walk') layers.push({ depth: projection.project(navigation.getPosition()).y, visitor: true });
      layers.sort((a, b) => a.depth - b.depth || Number(Boolean(a.occluder)) - Number(Boolean(b.occluder)));
      for (const layer of layers) {
        if (layer.occluder) {
          context.save(); path(layer.occluder.polygon); context.clip(); context.drawImage(plate, 0, 0, manifest.plate.width, manifest.plate.height); context.restore(); drawCalls++;
        } else if (layer.visitor) person({ key: 'local-visitor', anchor: navigation.getPosition() }, true);
        else person(layer.agent);
      }
      const links = model.getLinks(now);
      context.save(); context.lineWidth = 1 / scale(); context.strokeStyle = 'rgba(72,206,182,.7)'; context.setLineDash([4 / scale(), 5 / scale()]);
      links.forEach((link) => { const from = projection.project(link.from); const to = projection.project(link.to); context.beginPath(); context.moveTo(from.x, from.y - 12); context.lineTo(to.x, to.y - 12); context.stroke(); }); context.restore();
      labelFor(hoverKey || selectedKey);
      lastRenderMs = root.performance.now() - started; totalRenderMs += lastRenderMs; frameCount++; dirty = false;
      publishDiagnostics();
    }
    function selectAgent(key) { selectedKey = key || null; dirty = true; }
    function pick(point) {
      const location = toImage(point);
      for (let index = hitPeople.length - 1; index >= 0; index--) {
        const person = hitPeople[index];
        if (location.x < person.left || location.x > person.left + person.width || location.y < person.top || location.y > person.top + person.height) continue;
        if ((manifest.occluders || []).some((layer) => layer.depth > person.depth && imageInside(location, layer.polygon))) continue;
        return { agent: person.key };
      }
      const floor = projection.unproject(location);
      const room = rooms.find((item) => item.imagePolygon ? imageInside(location, item.imagePolygon) : item.bounds && root.AexosOfficeNavigation.inside(floor, item.bounds));
      return room ? { room: room.id } : {};
    }
    function zoomAt(factor, point) {
      const before = toImage(point); camera.zoom = Math.max(minimumZoom, Math.min(maximumZoom, camera.zoom * factor));
      const after = toImage(point); camera.x += before.x - after.x; camera.y += before.y - after.y; clampCamera(); dirty = true;
    }
    function destination(point) {
      const target = projection.unproject(toImage(point));
      if (!navigation.navigate(target)) { options.onStatus?.('That destination is blocked. Choose an open corridor.'); return false; }
      mode = 'walk'; keys.clear(); options.onModeChange?.(mode); dirty = true;
      options.onStatus?.('Moving your local visitor. No agent work was dispatched.'); return true;
    }
    listen(canvas, 'pointerdown', (event) => {
      if (!enabled) return; canvas.focus({ preventScroll: true }); canvas.setPointerCapture(event.pointerId);
      const point = pointer(event); pointers.set(event.pointerId, { ...point, startX: point.x, startY: point.y, dragged: false });
      if (pointers.size === 2) { const values = [...pointers.values()]; pinchDistance = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y); }
    });
    listen(canvas, 'pointermove', (event) => {
      const point = pointer(event); const before = pointers.get(event.pointerId);
      if (!before) { const next = pick(point).agent || null; if (hoverKey !== next) { hoverKey = next; dirty = true; } canvas.style.cursor = next ? 'pointer' : 'grab'; return; }
      const deltaX = point.x - before.x; const deltaY = point.y - before.y;
      const dragged = before.dragged || Math.hypot(point.x - before.startX, point.y - before.startY) > 5;
      pointers.set(event.pointerId, { ...before, ...point, dragged });
      if (pointers.size === 2) {
        const values = [...pointers.values()]; const distance = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
        if (pinchDistance > 0) zoomAt(distance / pinchDistance, { x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 }); pinchDistance = distance;
        values.forEach((value) => { value.dragged = true; });
      } else if (dragged) { camera.x -= deltaX / scale(); camera.y -= deltaY / scale(); clampCamera(); dirty = true; canvas.style.cursor = 'grabbing'; }
    });
    listen(canvas, 'pointerup', (event) => {
      const before = pointers.get(event.pointerId); pointers.delete(event.pointerId); if (pointers.size < 2) pinchDistance = 0;
      if (!before || before.dragged) return;
      const point = pointer(event); const now = root.performance.now();
      if (event.pointerType === 'touch' && lastTap && now - lastTap.time < 350 && Math.hypot(point.x - lastTap.x, point.y - lastTap.y) < 24) { cancelPick(); destination(point); return; }
      cancelPick(); lastTap = { ...point, time: now }; const hit = pick(point);
      pendingPick = root.setTimeout(() => {
        pendingPick = null; lastTap = null; if (!enabled || disposed || contextLost) return;
        if (hit.agent) { selectAgent(hit.agent); options.onAgentSelect?.(hit.agent); } else if (hit.room) options.onRoomSelect?.(hit.room);
      }, 350);
    });
    listen(canvas, 'pointercancel', (event) => { pointers.delete(event.pointerId); pinchDistance = 0; });
    listen(canvas, 'pointerleave', () => { hoverKey = null; dirty = true; });
    listen(canvas, 'dblclick', (event) => { event.preventDefault(); cancelPick(); if (enabled) destination(pointer(event)); });
    listen(canvas, 'wheel', (event) => { event.preventDefault(); zoomAt(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * .003), pointer(event)); }, { passive: false });
    listen(canvas, 'keydown', (event) => {
      const key = event.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) { event.preventDefault(); if (mode === 'walk') keys.add(key); else options.onStatus?.('Choose Walk mode to move your local visitor.'); }
      if (key === 'escape' || key === 'home') { event.preventDefault(); home(); }
      if (key === '+' || key === '=') zoomAt(1.15, { x: width / 2, y: height / 2 });
      if (key === '-') zoomAt(1 / 1.15, { x: width / 2, y: height / 2 });
    });
    listen(canvas, 'keyup', (event) => keys.delete(event.key.toLowerCase()));
    listen(canvas, 'blur', () => keys.clear());
    function home() { navigation.home(); camera.x = manifest.plate.width / 2; camera.y = manifest.plate.height / 2; camera.zoom = Math.max(minimumZoom, Math.min(maximumZoom, manifest.camera.initialZoom || 1)); mode = 'overview'; keys.clear(); dirty = true; options.onModeChange?.(mode); options.onStatus?.('Isometric overview restored. Drag to pan, wheel or pinch to zoom.'); }
    function frame(time) {
      request = null; if (!enabled || disposed || document.hidden) return;
      const delta = lastTime ? Math.min((time - lastTime) / 1000, .1) : 0; lastTime = time;
      if (mode === 'walk') {
        const wasMoving = navigation.isMoving();
        const x = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
        const y = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
        if (x || y) { const movement = projection.vector(x, y); navigation.move(movement.x, movement.z, delta); } else navigation.update(delta);
        if (navigation.isMoving() || wasMoving) dirty = true;
      }
      const stamp = model.getLinks(Date.now()).map((link) => link.id).join(':'); if (stamp !== lastLinkStamp) { lastLinkStamp = stamp; dirty = true; }
      if (motion && figures.some((agent) => agent.visible && agent.state === 'running' && hasActivity(agent))) dirty = true;
      if (dirty) render(Date.now());
      if (enabled && !disposed && !contextLost) request = root.requestAnimationFrame(frame);
    }
    listen(document, 'visibilitychange', () => { keys.clear(); if (!document.hidden && enabled && !disposed && !request) { lastTime = 0; request = root.requestAnimationFrame(frame); } });
    const observer = new root.ResizeObserver(resize); observer.observe(container);
    resize(); home(); request = root.requestAnimationFrame(frame);
    options.onStatus?.('Layered isometric office ready. Drag to pan; pinch or wheel to zoom. Walk mode controls a local visitor.');
    return {
      updateSnapshot(snapshot, settings = {}) { if (disposed) return; currentSnapshot = snapshot; currentSettings = { ...settings }; motion = settings.motion !== false; figures = model.update(snapshot, settings); selectAgent(settings.selectedAgentKey); dirty = true; },
      setMode(value) { mode = value === 'walk' ? 'walk' : 'overview'; keys.clear(); dirty = true; options.onModeChange?.(mode); options.onStatus?.(mode === 'walk' ? 'WASD/arrows move your local visitor; double-click an open corridor to route there.' : 'Isometric overview. Drag to pan; wheel or pinch to zoom.'); },
      home, selectAgent, resize,
      focusRoom(id) { const room = rooms.find((item) => item.id === id); if (!room) return false; const point = projection.project(room); camera.x = point.x; camera.y = point.y; camera.zoom = Math.min(maximumZoom, manifest.camera.focusZoom || 1.9); clampCamera(); dirty = true; options.onStatus?.('Inspecting ' + room.name + '.'); return true; },
      setEnabled(value) { enabled = Boolean(value) && !contextLost && !disposed; if (!enabled) cancelPick(); keys.clear(); if (!enabled && request !== null) { root.cancelAnimationFrame(request); request = null; } if (enabled && request === null) { resize(); lastTime = 0; request = root.requestAnimationFrame(frame); } publishDiagnostics(); },
      getDiagnostics,
      dispose() { if (disposed) return; disposed = true; enabled = false; cancelPick(); if (request) root.cancelAnimationFrame(request); observer.disconnect(); listeners.forEach((remove) => remove()); keys.clear(); pointers.clear(); model.records.clear(); figures = []; hitPeople = []; canvas.remove(); },
    };
  }
  const api = { mount, projectionFor, imageInside, createController };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AexosOfficeScene = api;
}(typeof window !== 'undefined' ? window : null));
