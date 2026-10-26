# Isometric office asset provenance

The September 7, 2026 owner reference `exec-2a906e9a-62b2-49e2-a1ba-948599dd919c.png` defines the composition. This is a fixed-angle layered environment; neither the image nor an avatar pose proves runtime work or provider presence.

| Packaged asset | Origin and format | SHA256 |
| --- | --- | --- |
| cyryx-office-isometric-empty-v1.png | Built-in imagegen edit of the owner reference; 1586 x 992 RGB environment with people/UI removed | 03173e0964c57ac609fedf9c679f344a49e18a2d13427c7301c32c841c751efc |
| cyryx-agent-atlas-clean-v3.png | Existing prepared derivative matching supplied exec-0d34b456-b639-4734-95fd-59b348904354.png / exec-5de3d6e2-653b-4798-a077-d5401645ddd4.png; 1536 x 1024 RGBA, real transparent background | 7b26817376ad1d6ea65b47b45d817c1b16eead104c3898819fd507e2df1a924c |
| cyryx-walk-cycle-v1.png | Existing prepared derivative matching supplied exec-72210350-a14b-48ca-b00a-89df2a3744b2.png; 1024 x 1536 RGBA | 3d20a05dde0cc24a950ee25ebc1fc4a1c2b4baf9d447ac0cc67be0ad9828721a |
| paulo-petruff-ceo-standing-v1.png | Existing executive portrait matching the supplied Paulo Petruff identity; opaque black backdrop, used in the profile | 31c8b6ced392f2d26b909afc4b9684fb7ad3b0524b47e305fd33d7530039c33f |

Only the environment was generated during this revision. Prepared character assets were inspected and reused without pixel editing. The source sheets display a checkerboard but are RGB; the packaged derivatives have verified alpha. Sprite crops, floor anchors and foreground polygons are declared in `scene-manifest.js`. Canvas composites the unchanged plate and alpha sprites; foreground clips restore pixels from that same plate.

## Exact environment edit prompt

Use case: precise-object-edit. Asset type: production background plate for a navigable isometric office game. Image 1 is the exact edit target and approved design. Create the EMPTY environment plate of this office, maintaining its sophisticated photoreal architectural visualization, exact continuous single-floor isometric perspective, workstation island arrangement, dark wood/stone flooring, glass boardroom and CEO office, command screen wall, indoor plants, warm golden edge lighting and teal accents. Remove EVERY person (standing and seated), reconstructing the empty chairs/desks/floor behind them. Remove ALL application UI: top toolbar, left sidebar, floating bottom-right avatar card. Extend the actual office naturally into those removed UI areas. Remove all readable text/labels/logos from signs but KEEP the physical blank dark signboards and screen details. Absolutely no people, avatars, silhouettes, portraits, letters or interface elements baked into this environment. Preserve the furniture, corridors and realistic materials of the reference; no low-poly/toy aesthetic, no tiered levels, no circular atrium, no redesigned layout. Broad usable walkable aisles and empty workstation chairs. Full-bleed landscape environment only, sharp high-detail premium photoreal game background. This is a production game asset, not a UI mockup.

Tool: built-in `image_gen.imagegen`. Raw output basename: `exec-8d33b173-b31c-425d-9145-6c43c8e8eddc.png`; copied unchanged to the packaged environment above. No provider/model version was reported by the tool. An intermediate generic atlas experiment was rejected and is not packaged.

The supplied seated workstation portraits remain style references. They contain their own furniture, so inserting them over photographed desks would duplicate geometry. The scene uses the separate seated/standing atlas instead. The local visitor uses the ponytail character and its matching four walk frames. Other roster sprites stay at stable anchors and derive observed state only from the existing event model.
