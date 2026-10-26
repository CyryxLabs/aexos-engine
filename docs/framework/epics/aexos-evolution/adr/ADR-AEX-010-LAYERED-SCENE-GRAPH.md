# ADR-AEX-010: Layered Scene Graph for the AEXOS Virtual Office

## Status

Accepted for Task 16 of AEX-3.6 on 2026-08-17.

This decision supersedes only the raster-only visual-renderer portion of
ADR-AEX-009. The local collector, truthful state projector, SSE boundary,
loopback security and accessible DOM remain unchanged.

## Context

The first 2.5D renderer treated one furnished campus image as both visual art
and spatial authority. Agents were then placed with percentages over pixels.
That model cannot prove that a point is a chair, corridor, table or wall; it
also cannot provide furniture occlusion, pose-specific scale or registered
dynamic monitor surfaces. The Task 15 gate checked coordinates and route
receipts, but the user's close screenshots show the result remains visibly
wrong: seated cutouts contain their own chair, people do not share one human
scale, and an opaque logo control covers the architectural reception.

The capability must still install with AEXOS, open quickly, require no external
AI API and preserve an accessible non-spatial roster.

## Decision

Use a dependency-free **layered 2.5D scene graph**.

1. The packaged campus raster becomes environmental art only.
2. A versioned scene manifest becomes spatial authority for world dimensions,
   walkable lanes, obstacle polygons, workstation/meeting anchors, reception
   brand bounds, depth zones and ambient screen surfaces.
3. A full-world Canvas 2D layer renders decorative screen telemetry at
   registered surfaces. It is explicitly ambient presentation and never claims
   observed agent state.
4. Semantic agent buttons remain in the DOM, but every presence consumes one
   world-space pose profile. Identity atlases must use normalized transparent
   cells and must not include desks, office chairs or other scene furniture.
5. Seated and working poses use station-specific seat baselines, facing and
   occlusion metadata; walkers use only graph edges whose clearance is defined
   by the manifest.
6. The reception uses the exact Cyryx mark and wordmark inside the wall bounds
   declared by the scene. No opaque UI card may replace or cover the reception.
7. The scene, assets, manifest and runtime remain under
   `.aexos-core/core/virtual-office/`, so the existing AEXOS installer and npm
   package footprint install the capability into every project.

## Why not full 3D now

The approved visual target is an isometric office, not a free-camera simulator.
Three.js/WebGL plus GLTF characters would add a model pipeline, larger published
artifacts and a second accessibility surface without solving telemetry truth.
The layered scene graph fixes the actual failures while preserving local-first
startup. The renderer contract remains compatible with a future WebGL consumer.

## Consequences

### Positive

- Spatial validation can assert named scene nodes and clearances rather than
  coordinate uniqueness.
- Human scale, seating, walking and reception layout share one measurable world.
- Animated office screens can look premium without inventing work telemetry.
- The collector and installation architecture do not change.

### Negative

- Existing percentages and atlas cells require migration.
- Scene authoring now has an explicit metadata contract that must be maintained
  with the raster asset.
- Visual QA must compare the reference and runtime at the same crop and zoom;
  automated geometry contracts are necessary but not sufficient.

## Rejected alternatives

- **More coordinate tuning on the same raster-only renderer:** rejected because
  pixels still do not encode furniture, navigation or occlusion semantics.
- **Full Three.js rewrite:** rejected for this correction because it expands the
  installation/runtime surface before the 2.5D scene contract is stable.
- **Static promotional animation:** rejected because it would imply work not
  observed by AEXOS. Only clearly ambient screen motion is permitted.
