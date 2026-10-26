# Story AEX-4.9: Navigable isometric office with live presence

## Status

Ready for review of the revised visual direction. This is local engineering acceptance, not owner visual sign-off or stable-release certification.

## Story and authority

As an AEXOS operator, I want to explore a coherent office using the supplied architecture and avatars, and inspect real agent activity without losing my location.

The owner's September 7 reference `exec-2a906e9a-62b2-49e2-a1ba-948599dd919c.png` and subsequent avatar sheets supersede the original tiered Three.js design. The owner rejected that appearance despite passing mechanical tests. [ADR-AEX-013](./adr/ADR-AEX-013-NAVIGABLE-OFFICE.md) preserves the superseded decision and explains the fixed-angle Canvas 2.5D replacement.

CLI/Master remains authoritative. The interface navigates, filters and observes existing events. Local visitor movement is not agent work, task dispatch, multiplayer presence or provider message delivery.

Executor: @dev. Architecture: @architect. Quality gate: @qa. Story follows AEX-4.4's existing projector/inspector and AEX-4.7's bounded local observation. First-value corrections remain isolated in AEX.10 / PR #4.

## Revised acceptance criteria

- [x] R1: Use the continuous single-floor isometric reference composition, dark workstation pods, glass perimeter and warm lighting. Derive an empty environment without baked people or runtime UI; preserve supplied avatar identities and Paulo's executive profile.
- [x] R2: Ground transparent standing/seated sprites at stable anchors with foreground depth. Keep names/state on selection/hover and in the inspector. Calibrate the near-side chairs using actual close-ups; use standing locations where supplied poses cannot match rear chairs.
- [x] R3: Use one affine floor projection and connected walkable polygons with blocked furniture footprints. Provide keyboard walking, destination routing, fixed-angle pan/zoom, recenter and correct single/double-click handling.
- [x] R4: Preserve real snapshot/SSE identity, multiple sessions, stale/disconnected distinctions and public-message attribution. Add restrained observed-state cues; never make unobserved agents appear active.
- [x] R5: Provide visible squad names, compact navigation and contextual details. Keep desktop/mobile usable, including portrait pan/zoom, focus, reduced motion and a live DOM fallback.
- [x] R6: Close final source/package/browser acceptance with exact gate receipts. Verify two close-ups, foreground occlusion, blocked routing, real telemetry, cleanup, asset hashes and measured performance; disclose physical-touch and fixed-angle limitations.

## Implementation

One frozen v6 manifest defines 23 catalog rooms, station anchors, projection, 47 foreground masks and navigation. The environment is 1586 x 992; character and walk sheets are 1536 x 1024 and 1024 x 1536. [Asset provenance](../../../../.aexos-core/core/virtual-office/public/assets/isometric-provenance.md) records the exact generation prompt, supplied references, real alpha and hashes.

Canvas draws the environment, depth-sorted alpha sprites and clipped foreground pixels from the same plate. Three near-side seated anchors per pod match the supplied poses; remaining characters stand. Independent QA rejected the original rear-row and elevated chair placements, then accepted revised Brand and Security close-ups after lowering only the seated anchors.

The visitor uses one consistent character and its four walk frames. Standing roster agents do not wander as fabricated work. Running observations have a subdued floor pulse; assigned, blocked and failed observations have steady indicators. Motion off/system reduced motion removes the pulse. Stale, disconnected and unobserved records have no live-work cue.

Navigation uses polygon/edge collision checks and bounded A*. Cached immutable geometry bounds improved the 23-route planning run from 983ms to 131ms total (worst route 135ms to 18ms), preserving exact collision tests and all destinations. These are local CPU measurements, not a product benchmark.

Desktop fits the complete floor; portrait mobile fills the viewport with a pannable crop. Zoom is capped at 2.2x. Single picks wait briefly so double-click/tap can route against the unchanged camera. Pending picks cancel on disable, context loss and disposal. Telemetry no longer replaces unchanged squad buttons during clicks. All teams closes the inspector and restores the overview.

## Verification

Current browser artifacts are under `artifacts/audit-20260906/office-isometric-*`. Older `office-3d-*` evidence belongs to the rejected design.

| Gate | Evidence |
| --- | --- |
| Independent visual review | Brand and Security close-ups accepted after two concrete corrections; this is not owner approval of every pod |
| Actual browser inputs | Desktop mouse pan/wheel, keyboard walking and blocked double-click; mobile CDP pinch; no document overflow at 1440 x 1000 or 390 x 844 |
| Reduced motion / failure | Browser reports Motion: reduced; simulated Canvas context loss preserves 180 agents in list view |
| Hit selection | Clicking the Brand standing sprite selects exactly `brand/emily-heyward` |
| Foreground crossing | Local visitor routed beside Business Administration foreground mask `pod-4-front`, design point approximately (904,793); screenshot records occlusion |
| Real SSE | Current Codex session's original lastSeen advances while selected agent and camera remain unchanged; evidence is local-session-log |
| Render cost | Final interaction run averages approximately 1.01ms CPU per render with 180 roster agents; no asserted FPS or hardware-independent performance |
| Automated suite | Final post-input-fix run: 10,458 passed, 163 skipped, zero failures; 437 passing suites, 379.374s; isometric-final-test-results.json / isometric-final-full-tests.exit.txt |
| Focused regressions | 125 passed across 9 office suites; navigation, presence, renderer lifecycle, UI, server and observer. Lint and typecheck exit0 |
| Installed artifact | Final consumer-final verification: ten source/installed/HTTP SHA256 comparisons pass, all HTTP200; removed unused Three.js route is HTTP404. Tarball SHA256 00dc14249eda31672092854918822aa9384298a12bffc779434a68d8ca8dd22a; build0 |
| Release | No merge, npm publish or deployment |

Exact root commands:

```powershell
npm run generate:manifest
npm run lint
npm run typecheck
node node_modules/jest/bin/jest.js tests/core/virtual-office --runInBand --silent
node node_modules/jest/bin/jest.js --runInBand --silent --json --outputFile <receipt.json>
npm run build
npm pack --json --pack-destination C:/AEXOS-LOCAL-TESTS/office-isometric-20260907
```

The full suite is invoked through an external wrapper that redacts credential values from persisted logs. The installed-consumer commands/script and final hashes are in `C:/AEXOS-LOCAL-TESTS/office-isometric-20260907/README.md` and `installed-office-receipt.json`. This is a separate fresh consumer directory on the existing Windows machine, not a clean OS VM.

## File list

- `.aexos-core/core/virtual-office/public/scene-manifest.js`
- `.aexos-core/core/virtual-office/public/office-navigation.js`
- `.aexos-core/core/virtual-office/public/office-presence.js`
- `.aexos-core/core/virtual-office/public/office-scene.js`
- `.aexos-core/core/virtual-office/public/app.js`
- `.aexos-core/core/virtual-office/public/index.html`
- `.aexos-core/core/virtual-office/public/styles.css`
- `.aexos-core/core/virtual-office/public/assets/cyryx-office-isometric-empty-v1.png`
- `.aexos-core/core/virtual-office/public/assets/isometric-provenance.md`
- `.aexos-core/core/virtual-office/server.js`
- `.aexos-core/install-manifest.yaml`
- `tests/core/virtual-office/office-navigation.test.js`
- `tests/core/virtual-office/office-scene-lifecycle.test.js`
- `tests/core/virtual-office/workspace-ui.test.js`
- `tests/core/virtual-office/server-cli-ui.test.js`
- `docs/guides/virtual-office.md`
- `docs/framework/epics/aexos-evolution/adr/ADR-AEX-013-NAVIGABLE-OFFICE.md`
- This story and `DELIVERY-AUDIT-20260907.md`

Reused approved assets: `cyryx-agent-atlas-clean-v3.png`, `cyryx-walk-cycle-v1.png`, `paulo-petruff-ceo-standing-v1.png`. No new JavaScript dependency or CDN is required.

## Limits and QA decision

Final independent QA: **APPROVED for the bounded local 2.5D slice**. QA read the corrected SSE receipt and independently recomputed all ten source and ten installed hashes against the final package receipt. No remaining R6 blocker was found.

The continuous floor is a rendered image with interactive layers and logical collision geometry. It has no arbitrary orbit, reconstructed 3D mesh, spatial audio or multiplayer networking. Supplied poses constrain sitting/facing. Physical touch hardware and every possible avatar/furniture arrangement are not independently certified.

Codex observation is verified locally. Disconnected Claude Code, Gemini, ChatGPT and Grok connections are not fabricated. Native cross-provider execution/message transport, complete company orchestration and broader AEXOS release findings remain separate work. CodeRabbit was unavailable; human-style independent agent review and actual browser tests are recorded, not a CodeRabbit pass.

The first saved SSE comparison mixed camera input with telemetry and was rejected by QA. A fresh no-input observation at 1440 x 1000 replaces that receipt: lastSeen advances for the exact current Codex session while camera (820,276.7119767923746,1.9x) and selected Master stay identical. All three persisted assertions are true. No end-to-end latency guarantee is inferred from this check.

2026-09-07: owner visual correction adopted; architecture superseded; independent visual and evidence blockers reproduced, corrected and retested. Final acceptance receipts are complete; owner visual sign-off remains open.
