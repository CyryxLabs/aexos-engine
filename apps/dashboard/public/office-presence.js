'use strict';
/* global window */
(function registerPresence(root) {
  const ACTIVE = new Set(['running', 'assigned']);
  const STATES = new Set(['available', 'assigned', 'running', 'waiting', 'blocked', 'completed', 'failed', 'stale', 'offline']);
  function createModel(manifest) {
    const records = new Map();
    let messages = []; let connected = false; let ttl = 30000;
    return {
      records,
      update(snapshot, options = {}) {
        connected = Boolean(options.connected); ttl = snapshot.heartbeatTtlMs || 30000;
        const present = new Set(); const visible = options.visibleKeys ? new Set(options.visibleKeys) : null;
        (snapshot.squads || []).forEach((squad) => {
          const room = [...manifest.rooms, ...(manifest.supportRooms || [])].find((item) => item.id === squad.id);
          if (!room) return;
          const occupied = new Set(squad.agents.map((agent) => records.get(agent.key)).filter((agent) => agent?.roomId === room.id).map((agent) => agent.anchor));
          squad.agents.forEach((agent, index) => {
            if (present.size >= manifest.limits.agents || index >= room.desks.length) return;
            present.add(agent.key);
            const before = records.get(agent.key);
            const anchor = before?.roomId === room.id ? before.anchor : room.desks.find((desk) => !occupied.has(desk));
            if (!anchor) return;
            occupied.add(anchor);
            let state = !agent.lastSeen && !agent.observed ? 'unobserved' : STATES.has(agent.state) ? agent.state : 'offline';
            if (!connected && ACTIVE.has(state)) state = 'stale';
            records.set(agent.key, { ...agent, state, roomId: room.id, anchor,
              visible: !visible || visible.has(agent.key), selected: options.selectedAgentKey === agent.key,
              sessions: (snapshot.sessions || []).filter((session) => session.agentKey === agent.key),
            });
          });
        });
        for (const key of records.keys()) if (!present.has(key)) records.delete(key);
        messages = (snapshot.messages || []).slice(0, manifest.limits.links);
        return [...records.values()];
      },
      getLinks(now = Date.now()) {
        if (!connected) return [];
        const resolve = (value) => {
          if (records.has(value)) return records.get(value);
          const aliases = [...records.values()].filter((record) => [record.id, record.name].includes(value));
          return aliases.length === 1 ? aliases[0] : null;
        };
        return messages.filter((message) => message.collaborationMessage && Number.isFinite(message.timestamp) && now >= message.timestamp && now - message.timestamp <= ttl)
          .flatMap((message) => { const from = resolve(message.sender || message.agentKey || message.agentId); const to = resolve(message.recipient); return from?.visible && to?.visible ? [{ id: message.id, from: from.anchor, to: to.anchor, timestamp: message.timestamp }] : []; });
      },
    };
  }
  function createRenderer(THREE, scene, manifest) {
    const model = createModel(manifest); const capacity = manifest.limits.agents;
    const temp = new THREE.Object3D(); const color = new THREE.Color();
    const material = new THREE.MeshStandardMaterial({ roughness: .82, metalness: .05 });
    const parts = {
      torso: [new THREE.BoxGeometry(.43, .55, .27), 0, .99, 0],
      head: [new THREE.SphereGeometry(.16, 10, 8), 0, 1.46, 0],
      hair: [new THREE.SphereGeometry(.165, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, 1.49, 0],
      armLeft: [new THREE.BoxGeometry(.12, .47, .13), -.29, 1.02, .03],
      armRight: [new THREE.BoxGeometry(.12, .47, .13), .29, 1.02, .03],
      legLeft: [new THREE.BoxGeometry(.14, .54, .16), -.12, .47, .03],
      legRight: [new THREE.BoxGeometry(.14, .54, .16), .12, .47, .03],
    };
    const meshes = {};
    Object.entries(parts).forEach(([name, [geometry]]) => {
      const mesh = new THREE.InstancedMesh(geometry, material, capacity); mesh.count = 0; mesh.frustumCulled = false; scene.add(mesh); meshes[name] = mesh;
    });
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .8, side: THREE.DoubleSide });
    const ringGeometry = new THREE.RingGeometry(.35, .4, 24);
    const rings = new THREE.InstancedMesh(ringGeometry, ringMaterial, capacity); rings.count = 0; scene.add(rings);
    let figures = [];
    const suits = [0x1a414a, 0x303844, 0x624834, 0x46425b, 0x254b42, 0x646b70];
    const skins = [0xe1b494, 0xa87758, 0x6d4734, 0xc79675];
    const tones = { running: 0x19c7c0, assigned: 0x55b8ff, blocked: 0xf0bd58, waiting: 0xf0bd58, failed: 0xf06f62, completed: 0x56d9a2, stale: 0x9a895f };
    function paint(seconds = 0, motion = false) {
      figures.forEach((agent, index) => {
        const hash = [...agent.key].reduce((sum, char) => sum + char.charCodeAt(0), 0);
        Object.entries(parts).forEach(([name, [, x, y, z]]) => {
          temp.position.set(agent.anchor.x + x, agent.anchor.y + y, agent.anchor.z + .77 + z);
          temp.rotation.set(0, Math.PI, 0); temp.scale.setScalar(agent.visible ? .9 : 0);
          if (name.startsWith('arm')) temp.rotation.x = -.65 + (motion && ACTIVE.has(agent.state) ? Math.sin(seconds * 4 + index) * .12 : 0);
          temp.updateMatrix(); meshes[name].setMatrixAt(index, temp.matrix);
          const tone = name === 'head' ? skins[hash % skins.length] : name === 'hair' ? 0x251f1b : name.startsWith('leg') ? 0x172026 : suits[hash % suits.length];
          meshes[name].setColorAt(index, color.setHex(tone));
        });
        temp.position.set(agent.anchor.x, agent.anchor.y + .04, agent.anchor.z + .77);
        temp.rotation.set(-Math.PI / 2, 0, 0); temp.scale.setScalar(agent.visible ? agent.selected ? 1.4 : 1 : 0); temp.updateMatrix();
        rings.setMatrixAt(index, temp.matrix); rings.setColorAt(index, color.setHex(agent.selected ? 0xffffff : tones[agent.state] || 0x4e5c61));
      });
      Object.values(meshes).forEach((mesh) => { mesh.count = figures.length; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; });
      rings.count = figures.length; rings.instanceMatrix.needsUpdate = true; if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    }
    return {
      model, update(snapshot, options) { figures = model.update(snapshot, options); paint(); },
      animate: paint, getPickMeshes: () => [meshes.torso, meshes.head],
      keyForHit: (hit) => figures[hit.instanceId]?.key || null,
      getAgent: (key) => model.records.get(key),
      dispose() { Object.values(meshes).forEach((mesh) => { scene.remove(mesh); mesh.geometry.dispose(); mesh.dispose(); }); scene.remove(rings); rings.geometry.dispose(); rings.dispose(); material.dispose(); ringMaterial.dispose(); },
    };
  }
  const api = { createModel, createRenderer, ACTIVE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AexosOfficePresence = api;
}(typeof window !== 'undefined' ? window : null));
