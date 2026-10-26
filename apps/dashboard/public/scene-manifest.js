'use strict';
/* global window */
(function registerOfficeManifest(root) {
  // Calibrated design coordinates; furniture is not a runtime location signal.
  const PROJECTION = { origin: { x: 793, y: 500 }, axisX: { x: 24, y: 12 }, axisZ: { x: -24, y: 12 } };
  const floor = (x, y) => ({ x: ((x - 793) / 24 + (y - 500) / 12) / 2, z: ((y - 500) / 12 - (x - 793) / 24) / 2, y: 0 });
  const points = (values) => values.map(([x, y]) => ({ x, y }));
  const floorPolygon = (values) => values.map(([x, y]) => floor(x, y));
  const definitions = [
    ['aexos-core', 'AEXOS Core', 820, 140, 12], ['apex', 'Apex', 494, 232, 15],
    ['board', 'Board', 1234, 174, 5], ['brand', 'Brand', 593, 313, 7],
    ['business-admin', 'Business Administration', 988, 780, 5], ['ceo', 'CEO', 1459, 277, 5],
    ['claude-code-mastery', 'Claude Code Mastery', 143, 247, 8], ['curator', 'Curator', 170, 499, 12],
    ['customer-success', 'Customer Success', 723, 431, 5], ['deep-research', 'Deep Research', 166, 359, 11],
    ['dispatch', 'Dispatch', 1230, 425, 4], ['education', 'Education', 1080, 515, 16],
    ['kaizen', 'Kaizen', 848, 557, 7], ['kaizen-v2', 'Kaizen v2', 447, 539, 8],
    ['legal-analyst', 'Legal Analyst', 1218, 653, 15], ['marketing', 'Marketing', 427, 393, 7],
    ['ops', 'Operations', 249, 658, 5], ['products', 'Products', 1022, 336, 7],
    ['sales', 'Sales', 1250, 883, 5], ['seo', 'SEO', 355, 280, 8],
    ['squad-creator', 'Squad Creator', 641, 676, 1], ['security', 'Security', 438, 809, 6],
    ['workflow-engineering', 'Workflow Engineering', 594, 919, 6],
  ];
  const rooms = definitions.map(([id, name, cx, cy, capacity], index) => {
    const scale = .7 + cy / 2500;
    const outline = [[cx - 96, cy - 16], [cx + 15, cy - 58], [cx + 96, cy - 14], [cx - 10, cy + 46]];
    // Only the three near-side chairs match the supplied seated poses.
    // Far-side stations use floor positions; front-facing sprites cannot sit backwards.
    const slots = [[-38, 62], [3, 49], [44, 36],
      [-91, 68], [-58, 86], [-21, 98], [20, 92], [62, 77], [102, 57],
      [-111, 32], [-120, -1], [109, -29], [78, -51], [115, 13], [121, 86], [-123, 68]];
    const desks = slots.slice(0, Math.max(capacity, 6)).map(([dx, dy], slot) => ({
      id: id + '/station-' + slot, ...floor(cx + dx * scale, cy + dy * scale),
      image: { x: cx + dx * scale, y: cy + dy * scale },
      frame: slot < 3 ? 4 + slot % 2 : [0, 3, 6, 7, 8, 9, 10, 11][(slot - 3) % 8],
      pose: slot < 3 ? 'seated' : 'standing', height: (slot < 3 ? 53 : 61) * scale,
      flip: slot < 3,
    }));
    return { id, name, number: index + 1, ...floor(cx, cy), desks, imagePolygon: points(outline),
      imageTuple: [id, name, cx - 60, cy - 80, 120], label: { x: cx - 20, y: cy - 58 },
      entrance: id === 'claude-code-mastery' ? floor(127.14, 317.96) : id === 'workflow-engineering' ? floor(576.34, 985.34) : floor(cx - 12, cy + 72), footprint: floorPolygon(outline),
    };
  });
  const occluders = definitions.flatMap(([, , cx, cy], index) => [
    { id: 'pod-' + index + '-front', depth: cy + 33, polygon: points([[cx - 87, cy - 1], [cx - 33, cy + 23], [cx - 33, cy + 50], [cx - 87, cy + 24]]) },
    { id: 'pod-' + index + '-desk', depth: cy + 26, polygon: points([[cx - 32, cy + 24], [cx + 83, cy - 13], [cx + 83, cy + 3], [cx - 32, cy + 41]]) },
  ]);
  occluders.push({ id: 'command-screen', depth: 306, polygon: points([[717, 94], [992, 182], [992, 302], [717, 207]]) });
  const frameRects = [[184, 11, 104, 326], [516, 15, 134, 317], [858, 12, 133, 321], [1171, 12, 161, 325],
    [120, 346, 173, 297], [507, 346, 119, 298], [839, 347, 132, 310], [1227, 351, 115, 301],
    [119, 659, 173, 341], [461, 661, 169, 337], [867, 657, 92, 341], [1217, 661, 104, 338]];
  const manifest = {
    id: 'cyryx-isometric-office-v6', version: 6,
    plate: { src: '/assets/cyryx-office-isometric-empty-v1.png', width: 1586, height: 992 },
    image: { width: 1586, height: 992, cropX: 0, cropY: 0 },
    world: { width: 1586, height: 992, minZoom: .65, maxZoom: 2.2, defaultZoom: 1 },
    projection: PROJECTION, rooms, supportRooms: [], occluders,
    atlas: { src: '/assets/cyryx-agent-atlas-clean-v3.png', width: 1536, height: 1024, personHeight: 61,
      frames: frameRects.map(([x, y, width, height], index) => ({ x, y, width, height, anchorX: .5, anchorY: 1, pose: index === 4 || index === 5 ? 'seated' : 'standing' })),
      visitorFrame: 1,
    },
    walkAtlas: { src: '/assets/cyryx-walk-cycle-v1.png', frames: [[79, 11, 170, 367], [321, 11, 154, 366], [563, 11, 174, 366], [806, 11, 163, 367]].map(([x, y, width, height]) => ({ x, y, width, height, anchorX: .5, anchorY: 1, pose: 'walk' })) },
    executive: { profile: { id: 'cyryx-ceo', name: 'Paulo Petruff', title: 'Chief Executive Officer', company: 'Cyryx Labs', standingAsset: '/assets/paulo-petruff-ceo-standing-v1.png', workstationAsset: '/assets/paulo-petruff-ceo-workstation-v1.png' } },
    navigation: { start: floor(784, 856), radius: .16, step: .5, speed: 3.2,
      walkable: [floorPolygon([[0, 245], [650, 55], [1562, 198], [1580, 825], [1180, 985], [447, 989], [5, 658]])],
      obstacles: rooms.map((room) => ({ id: room.id, polygon: room.footprint })),
    },
    camera: { minZoom: .45, maxZoom: 2.2, initialZoom: 1 },
    limits: { pixelRatio: 1.5, agents: 300, links: 12, deltaSeconds: .05 },
  };
  function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  if (typeof module !== 'undefined' && module.exports) module.exports = freeze(manifest);
  else root.AEXOS_OFFICE_SCENE = freeze(manifest);
}(typeof window !== 'undefined' ? window : null));
