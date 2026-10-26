# ADR-AEX-013: Navigable Virtual Office

- Status: Revised after user rejection of procedural 3D; prior visual decision superseded
- Date: 2026-09-07
- Story: AEX-4.9
- Authority: AEXOS Master coordinates; CLI remains the execution interface

## Superseding visual decision: continuous isometric office

The user rejected the procedural 3D result and supplied `C:/Users/ppetr/OneDrive/Desktop/Cyryx Labs/03_Brandboard/Avatares Office/exec-2a906e9a-62b2-49e2-a1ba-948599dd919c.png` as the new visual authority. This section supersedes all conflicting tiered-campus geometry, 21-room reference ordering, arbitrary orbit and mandatory real-3D criteria below. The remaining telemetry, CLI authority, accessibility, local packaging and evidence requirements continue to apply. Story AEX-4.9 requires corresponding acceptance updates by its owner; earlier mechanical test passes do not constitute acceptance of the rejected visual direction.

The new reference depicts a single continuous isometric floor with dense workstation pods, dark premium materials, warm gold edge lighting, glass perimeter, integrated plants, a command-center wall and realistic seated/standing people. It does not depict the prior stepped wings and circular bridge. Its UI and text are illustrative; real roster identities and live data remain authoritative.

### Selected rendering approach

Deliver a **layered 2.5D navigable office**: a high-resolution pre-rendered empty office plate, explicit foreground occluder layers, coherent human sprite assets and an independent floor-space navigation/collision model. This gives a feasible path to the requested visual fidelity. It must be described honestly as 2.5D; displaying a photograph on a Three.js plane is not proof of a reconstructed 3D environment.

The existing procedural renderer constructs four staggered levels with simple boxes/spheres. Improving its lighting alone cannot resolve the topology and human-asset mismatch. Full photorealistic 3D would require modeled assets, UV/material work, coherent lighting and substantial asset QA. It is therefore not the selected repair path. Three.js may remain as the locally packaged compositor, but is optional to the visual result; a Canvas renderer can satisfy the same contract. No new rendering dependency is necessary.

### Asset contract

- Generate an empty office environment preserving the reference's single-floor composition, pod density, materials and lighting. Remove all embedded people, interface chrome, illegible generated signage and fake online/status information. Preserve structural furniture and natural contact shadows.
- Deliver the environment at sufficient native resolution for the agreed maximum zoom; do not promise unlimited zoom into a finite raster image. Record dimensions and safe zoom limits in the manifest.
- Produce matching foreground cutouts/masks for desk fronts, partitions, planters and other occluding furniture. They must align exactly with the approved environment plate. A single flattened plate is insufficient for agents who must walk behind furniture.
- Produce consistent full-body human assets at the same camera elevation, illumination and scale: standing, seated and directional walk frames where movement is enabled. Each frame declares its ground/seat anchor. Avoid mixing portraits, floating initials, toy-like procedural figures and photorealistic furniture.
- Keep a neutral contact-shadow layer associated with each human asset. Match floor direction and softness without making shadows look like status rings. Identity/status labels appear on focus/selection and in DOM, rather than obscuring every person with chips.
- Generated visual fixtures and geometry are design approximations. No generated person or monitor screen is evidence of an active agent or host connection.

### Revised manifest and integration contract

Retain the accepted `office-scene` controller API and existing `app.js` SSE/selection integration. Replace the procedural topology with a versioned manifest containing: plate dimensions; fixed projection; floor-to-image transform; walkable polygons; obstacles; desk/seat anchors; pod-to-squad IDs; foreground layer bounds and depth; sprite atlas metadata; and camera pan/zoom bounds.

Keep navigation coordinates independent from image pixels. Use one calibrated fixed isometric/affine floor projection and its inverse for pointer targeting. Do not infer walkability from painted floor color. Define explicit connected paths between pod approaches, reception and command center, with blocked furniture footprints. Match the rendered scene to that calibration rather than pretending an inconsistent generated perspective is exact geometry.

Camera interaction is pan/zoom and recenter with a fixed view angle. Remove orbit controls that would expose the flat assets. The local visitor moves through verified corridors; live agents use stable seat anchors. Runtime activity does not imply physical walking. Standing/seated presentation follows assigned scene placement; work status remains separate telemetry.

Depth ordering uses foot-point floor depth plus explicit foreground occluders; sorting sprites by screen Y alone cannot hide a person correctly behind the desk already baked into the background. Seated agents require a seat anchor and desk-front occluder. Masks/cutouts must avoid duplicate painted furniture. Transparent edges, shadows and collision are acceptance-critical.

### Revised visual acceptance

- [ ] The first viewport resembles the new reference's continuous isometric office, with dark workstation pods and warm gold edges; the rejected stepped/circular campus is absent.
- [ ] A clean environment contains no embedded people or fabricated runtime UI. Every rendered live person resolves to an actual catalog identity; the local visitor is separately identified.
- [ ] Humans have consistent scale, grounding, light direction and clean transparency at normal and maximum supported zoom. No floating chips substitute for in-world humans.
- [ ] Walking agents/visitor pass behind desk fronts, partitions and plants correctly; seated bodies fit their chairs/desks and do not visibly float or intersect furniture.
- [ ] Pointer destination selection maps to walkable floor; collision prevents passage through pods, walls and unavailable gaps. Blocked destinations fail gracefully without teleporting.
- [ ] Pan/zoom/recenter, keyboard navigation and selection preserve the fixed projection. No arbitrary orbit presents the 2.5D scene as reconstructed 3D.
- [ ] Real telemetry changes state without replacing assets, resetting the camera or inventing movement; DOM inspector, host rail, full roster and fallback remain usable.
- [ ] Browser evidence includes the first viewport, two zoomed human/desk inspections, one foreground-occlusion crossing, blocked-path behavior, and actual live telemetry. Functional tests alone cannot accept visual fidelity.

Performance targets below remain proposed budgets, adapted to this compositor. Native plate/atlas memory and visible sprite count must be measured. No benchmark superiority or photorealistic fidelity claim is accepted without the corresponding visual evidence.

## Prior decision record (superseded where conflicting)

## Context

The user requests a Gather-like, navigable office retaining the supplied architectural reference and representing actual project telemetry. The current office already provides local collection, snapshots, SSE, host/session projection and a DOM inspector. Its visual floor is an image with positioned markers. `public/app.js` defines room coordinates independently of the older `public/scene-manifest.js`, creating competing layout definitions.

The reference shows 21 departmental rooms arranged across tiers around a circular command bridge, connected wings, stairs and reception. It does not reveal complete geometry, dimensions or every connection. The implementation preserves visible topology and composition; hidden geometry is an explicit approximation, not an exact reconstruction.

## Decision

Use Three.js **0.185.1**, pinned exactly, as the user-authorized rendering dependency. Ship a minified local vendor artifact with its MIT license and version/provenance information. No CDN or runtime package download is required to open the office. Preserve CommonJS for the CLI/server/build loader. The browser may dynamically import the locally bundled vendor; do not convert the framework to ESM or introduce a frontend framework to host the scene.

Build real room, floor, desk, railing and portal geometry. A flat texture carrying the reference image does not satisfy navigable-scene acceptance. Preserve the reference's tiered wings, central circular bridge, room ordering, reception and dark metallic/cyan visual language. Treat background people and screenshot controls as reference imagery, never observed runtime identities.

Use one canonical scene manifest for geometry, room-to-squad identity, seats, camera anchors, collision surfaces and inter-floor portals. Preserve the 21 reference rooms. Additional catalog squads appear in a clearly identified annex with stable identities and navigation; do not silently omit them or move an existing squad because catalog ordering changed.

## Module integration contract

All paths below are relative to `.aexos-core/core/virtual-office/` unless stated otherwise. Implementation may consolidate private helpers, but must preserve these responsibility boundaries.

| Module | Responsibility and interface |
|---|---|
| `public/scene-manifest.js` | Canonical versioned floors, rooms, squad IDs, desks, portals, collision bounds and initial camera configuration. Remove competing layout authority from `app.js`. |
| `public/office-scene.js` | Own renderer lifecycle through `mount(container, callbacks)`, `updateSnapshot(snapshot)`, `selectAgent(key)`, `focusRoom(id)`, `resize()` and `dispose()`. Initialization can be asynchronous while the DOM remains usable. |
| `public/office-navigation.js` | Camera/map/walk mode, local visitor position, bounded movement, collision, floor transitions and recovery to overview. No telemetry publishing or execution calls. |
| `public/office-presence.js` | Reconcile catalog agents and host sessions into stable visual entities; status, selection and message effects derive from the supplied projection. |
| `public/app.js` | Retain existing snapshot/delta ownership, SSE connection, host filters, search, roster and DOM inspector. After updating its snapshot, pass it to the scene. Scene callbacks call existing agent/room selection functions. |
| `public/index.html`, `public/styles.css` | Canvas mount, accessible scene controls, loading/fallback states and existing DOM observation surfaces. |
| `server.js` | Explicit same-origin allowlist for renderer/vendor assets, correct MIME types and existing security headers. Preserve collector endpoints and authentication. |
| Root build/package tooling | Produce or verify the pinned local vendor artifact and license, include assets in the published package, verify packed installation without CDN access. Keep build entrypoints CommonJS. |

The scene consumes the existing snapshot contract: squads/agents, hosts, sessions, messages, counts and events. It must not open a second event connection, introduce a second state projector or interpret a failed connection as empty successful work. SSE reconnect remains owned by the existing application. Selection callbacks return stable agent or room IDs, never a command to execute.

Persistent GPU objects are reconciled by identity. A telemetry delta must not rebuild the whole scene, reset the camera, move the visitor or discard selection. DOM selection and scene selection resolve to the same agent. Unknown/unmapped identities remain visible in the roster with an honest unmapped state.

## Interaction and authority

Provide an elevated architectural overview with bounded camera controls and an optional orthographic map. Visitor exploration supports keyboard walking, destination selection and routes through defined portals. Drag/pinch/zoom and a visible overview/home control make recovery straightforward. Collision prevents walking through walls or across absent floors.

Visitor movement is local browser presentation state, distinct from agent execution state. An agent's desk is an assigned visualization location, not measured physical movement. Multiple sessions on different hosts remain inspectable under one catalog identity. Standing near an agent does not dispatch work, communicate with a provider or change its state.

The command bridge opens observational details. The scene has no task-dispatch, approval, cancellation or message-delivery controller. A visual communication effect references an observed event and expires; delivery/acknowledgement appears only when evidenced by the existing transport data. Master remains the sole global orchestrator and all execution remains operable through CLI.

## Acceptance criteria

- [ ] Visible composition preserves the reference's room ordering, tiered wings, bridge and reception; hidden geometry approximations are documented.
- [ ] One scene manifest controls layout, collision and room identities; every catalog squad is reachable in a reference room or annex.
- [ ] Camera pan/zoom, local visitor movement, destination navigation, collision, floor transitions and overview recovery work on the tested desktop viewport.
- [ ] Touch navigation and a complete DOM roster/inspector work at the tested mobile viewport; no horizontal document overflow or inaccessible control is required for observation.
- [ ] Movement keys act only when the scene owns focus. Text entry, browser controls and inspector scrolling keep their normal behavior.
- [ ] Scene picking, search and keyboard roster selection identify the same agent and open the existing inspector; escape/close restores meaningful focus.
- [ ] Concurrent host sessions, stale states and disconnect/reconnect updates remain truthful without camera reset or fabricated activity.
- [ ] Visitor movement and all scene interactions cause no execution mutation or event submission; CLI observation works without the renderer.
- [ ] Communication effects have evidence identity and bounded lifetime; decorative motion is distinguishable from observed work.
- [ ] Reduced motion disables ambient animation and camera tweening; necessary direct navigation remains available.
- [ ] Unsupported WebGL, initialization failure and context loss show an actionable fallback while preserving host status, roster, inspector and CLI guidance.
- [ ] Packed clean installation loads the scene and local vendor/license without CDN requests; existing CSP and producer authentication remain effective.
- [ ] Repository lint, typecheck, tests and build pass; browser evidence covers navigation, selection, fresh telemetry, reconnect and fallback.

## Proposed performance budgets and fallback

These are acceptance targets to measure, not achieved results or market comparisons. Record viewport, browser, hardware, device pixel ratio, catalog size, rendering statistics and test duration with results.

- Cap effective drawing pixel ratio at 1.5 initially; allow a lower quality tier without changing operational content.
- Target steady navigation p95 frame duration at or below 33 ms on the recorded reference desktop. Target at or below 50 ms on the recorded mobile device; reduce rendering quality or offer the DOM view if unmet.
- Target scene response to an already-received telemetry update within 250 ms under the tested catalog/event load; this excludes provider and network delay.
- Target no more than 200 draw calls for the normal overview using shared geometry/materials and instanced repeated furniture where useful. Measure rather than infer from source.
- Render on demand when idle. Schedule frames only for active navigation or bounded transitions, stop rendering while hidden and dispose renderer resources on teardown.
- Avoid mandatory post-processing, physics engines, dynamic shadows and unbounded per-agent labels. Use simple interaction meshes and display detailed readable information in DOM.

If a target fails, retain honest telemetry and accessible inspection while reducing visual cost. Do not present a blank canvas, freeze the host rail or silently drop agents to satisfy a rendering target.

## Trade-offs and consequences

Three.js adds a browser dependency and GPU lifecycle concerns but enables genuine depth, picking, collision-aware navigation and coherent entity placement. Simplified geometry gives maintainable performance and readable identities, at the cost of not reproducing every photorealistic detail in the supplied screenshot. Local packaging preserves offline installation and the same-origin policy, but requires explicit vendor-version and license checks.

The existing DOM application remains the accessibility and operational fallback. Keeping it avoids making GPU support a prerequisite for AEXOS. The canonical manifest prevents coordinate drift but requires deliberate migration of existing room references. This decision does not authorize multiplayer infrastructure, provider credentials, spatial audio, an office editor or a second orchestration layer.

## Reference rationale

Gather's navigation guide demonstrates pan/zoom, keyboard movement and locating participants as useful interaction patterns: [Looking and moving around the office](https://support.gather.town/articles/1285650718-looking-moving-around-the-office). These patterns are inspiration, not a claim of feature parity.

Three.js documents [map controls](https://threejs.org/docs/pages/MapControls.html), [orthographic projection](https://threejs.org/docs/pages/OrthographicCamera.html), [picking](https://threejs.org/manual/en/picking.html), [rendering on demand](https://threejs.org/manual/en/rendering-on-demand.html) and [responsive rendering](https://threejs.org/manual/en/responsive.html). They support the selected interaction/rendering mechanisms; performance acceptance still requires measurements from the implemented AEXOS scene.
