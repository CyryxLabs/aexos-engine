# AEXOS audit and connected office delivery

Status: local remediation extended and independently reviewed, with explicit remaining integration and filesystem-creation limitations. No publish, deployment or release certification.

## Latest delivery — revised isometric office and first-value PR

The owner's September 7 single-floor reference and supplied avatars supersede the earlier office visuals described below. Story AEX-4.9 and ADR-AEX-013 record a fixed-angle Canvas 2.5D implementation: a cleaned environment, transparent seated/standing sprites, 23 navigable sectors, stable 180-agent catalog projection, local walking, collision routing, camera pan/zoom, direct person selection and existing live inspection. Physical room labels and the compact squad navigator replace the procedural tiered composition. Portrait mobile fills its canvas with a pannable view.

Independent visual review rejected two chair-placement iterations before accepting Brand and Security close-ups. Actual Chromium inputs found and closed a single/double-click camera conflict; unchanged squad buttons now survive telemetry updates. The final browser receipt verifies blocked destinations, keyboard walking, pointer pan/wheel, emulated pinch, reduced motion and Canvas failure retaining all180 agents in list view. Observed running agents have a restrained pulse; unavailable records do not appear active. No new engine dependency or CDN is needed.

Final local gates: **10,458 passed / 0 failed / 163 skipped**, 437 passing suites, 379.374seconds. Office-focused: **125 passed / 9 suites**. Lint, typecheck and publish build exit0. Final tarball SHA256: `00dc14249eda31672092854918822aa9384298a12bffc779434a68d8ca8dd22a`. A new consumer directory installed this tarball with scripts disabled; the installed server returned HTTP200 and exact source/installed/served hashes for ten UI/assets. The removed unused Three.js route returns404. Full receipts: `artifacts/audit-20260906/isometric-final-*`, `office-isometric-*`, and `C:/AEXOS-LOCAL-TESTS/office-isometric-20260907/installed-office-receipt.json`.

The minimal first-value changes are isolated in [PR #4](https://github.com/CyryxLabs/aexos-engine/pull/4), head `d848c7f58ad4a8da3afc93398ec608be4bf4d23a`. Pinned published5.3.0 reproduced four false Doctor failures and an absolute-path failure. The corrected package initializes an empty path with spaces, reports actual installed counts and exits Doctor0 with13PASS/2WARN/0FAIL/3INFO. README/help use npm as the primary path. Its full isolated suite passed9,892 tests; latest GitHub checks are48SUCCESS/2SKIPPED with review required. No merge or npm publish occurred.

This accepts bounded local engineering behavior, not every possible furniture/avatar placement or the owner's final aesthetic approval. The floor is layered imagery, not an orbitable3D model. Touch evidence is emulated. Cross-provider execution/message delivery and company-wide orchestration remain unimplemented or uncertified as detailed below; the office consumes existing CLI/Master observations.

## Continuation receipt — September 7

Final package SHA1: `38d5aeb5d47c42cc17ad7404e7c58971ad38fc69`. Installed observer, CLI, UI, managed Grok writer and filesystem mediator match their source SHA256 values (six comparisons). Final packaged Grok update exits0, preserves both custom canaries, leaves unselected hosts absent and passes Doctor with zero failures. Receipts: `continuation-package-hashes.json`, `continuation-grok-preservation.json`. Latest focused verification: **105 tests / 8 suites passed**. Multi-IDE parity, IDE drift check, Codex sync and Codex integration gates all exit0.

- Full suite: **10423 passed / 0 failed / 163 skipped**, 435 passing suites of 447. `continuation-final-test-results.json` is authoritative for that run. Subsequent exact-session observer refinement and Grok hook-generation failure were additionally checked by `continuation-latest-focused.log`; they are not silently counted into the earlier aggregate. Lint and typecheck pass with zero lint warnings; publish build passes.
- Root Doctor: **15 PASS / 2 WARN / 0 FAIL / 2 INFO**. It now rejects invalid configuration shapes, incompatible installed dependency versions and invalid peer-diff evidence. Memory discovery uses all 12 installed canonical agents; three missing stubs were created. Exact verified wrapper delegation prevents false unregistered-hook warnings. Remaining warnings: legacy unsupported `vscode` selection and Windows npm cold-cache advisory. Disabled framework protection is disclosed as INFO, not certified protection.
- Office: 30 registry-backed interactive markers, state-driven movement, animated observed-message links, decorative architectural lighting, persisted motion toggle and reduced-motion support. Chrome desktop 1440x1000 and mobile 390x844 have no document overflow. Background people remain illustration. Actual local Codex tool events caused Zeus to display Running with `observed-work` animation. The server on 4026 now observes only this exact Codex session using explicit agent mapping, preventing other sessions from being attributed to Zeus. Final browser acceptance exposed and corrected an additional issue: custom_tool_call records were omitted and exact-session discovery could be displaced by newer unrelated files. Both function_call/custom_tool_call now emit metadata only; exact session discovery precedes the file cap. The corrected filtered stream was verified live in the user tab. No prompts, arguments, outputs or reasoning are forwarded.
- Codex: opt-in bounded session-log observer, original timestamps, project/session identity, metadata-only checkpoints and authenticated ingestion. Fourteen observer tests pass; QA independently matched ten real receipt records to journals. Initial current-thread task-start was outside bootstrap evidence and was not invented. This is local session-log observation, not provider execution or cross-host message delivery certification.
- Grok: 78 managed artifacts, custom section preservation, conflict detection, proven stale cleanup, Windows case-safe ownership and selected-host wizard integration. Actual packaged install/update retained custom rules and an untracked custom file; unselected Claude/Codex/Gemini directories remained absent. Bundled Doctor:9 PASS /2 WARN /0 FAIL /8 INFO. Generated support is not native Grok acceptance.
- Filesystem: structured AgentRuntime reads now pass through governed mediation with outside/protected/alias/link/substitution rejection. QA caught and verified correction of Windows home-path case handling. Creation remains explicitly unsupported on all platforms; arbitrary native subprocess I/O is outside this boundary. AEX-4.6 AC3/7 remain open.
- Native launchers: unconditional permission bypass removed from the reviewed dispatcher, build, semantic merge, PR review and six routing templates. Merge/review prompts use literal stdin with shell disabled; bounded timeouts fail explicitly. Independent AC10 QA passed 27 focused tests; owner suite passed 110.
- Independent QA reproduced three defects in this continuation (home-path case alias, concurrent Grok edit overwrite, case-only stale deletion), rejected them, and retested fixes. No unresolved reproduced blocker remains in the reviewed Grok/observer/launcher scope. CodeRabbit unavailable; no CodeRabbit pass claimed.

Evidence is under `artifacts/audit-20260906/`: `continuation-final-*`, `codex-session-observation.json`, `office-motion-browser.json`, `grok-final-preservation.log`, `filesystem-implementation.md`. Source comparisons and adoption decisions are in [UPSTREAM-SEMANTIC-REVIEW-20260907.md](./UPSTREAM-SEMANTIC-REVIEW-20260907.md). AIOX is a reference, not proof of correctness: the reviewed upstream CI status helper would restore a nonexistent command; language-renamed task helpers already exist locally.

Still open: authenticated cross-host message/execution adapters, complete safe creation/OS confinement, task-contract migration beyond 1/218 and exhaustive semantic review of the remaining upstream differences. The office currently observes Master/CLI work; it does not dispatch jobs or messages.

## Previous delivery baseline

Final gates: lint exit 0 (9 warnings), typecheck exit 0, full Jest 430 suites / 10332 tests passed, 163 skipped, zero failures. Latest office refinements additionally passed 72 tests / 6 suites. Publish build passes with 1894 files. Final tarball SHA1 `26fe95383887ba3f0528df9e94b47c4f0b91f1ab`; installed UI SHA256 matches source `EE7F476010655BA2EC5BF1B80298BE3179DFD0EADC8BF88FA3A949A72DC1DC1B`. Fresh final installer produces no unselected host directories. Bundled Doctor: 9 PASS / 2 WARN / 0 FAIL / 8 INFO; root Doctor: 15 PASS / 4 WARN / 0 FAIL. Receipts live in `artifacts/audit-20260906/` (`test-results.json`, `office-final-tests.log`, `final-build.log`, `pack-final.json`, `packed-delivery-init.log`, `packed-delivery-doctor.json`).

## Implemented repairs

- Doctor distinguishes installation health from runtime/provider proof. Explicit empty host selection skips optional integrations; malformed configuration and missing required dependencies fail. Clean-init baseline had four failed checks; repaired installed-artifact Doctor has zero failures.
- Installer uses four meaningful stages, width-aware output and actual installed counts. Failed selected-host configuration, sync, skills or hooks cannot report completed success. Host writers and cleanup honor the exact selection.
- Master and AgentInvoker reject failed, cancelled, simulated and explicitly unexecuted adapter results. Required gates precede completion. Unsupported placeholder executors report unsupported instead of fabricated success. Unknown tools and unrestricted command arguments do not inherit read-only permission.
- Office normalizes host/session/run/project identities, protects local ingestion, persists before acknowledging, replays/tails journals, deduplicates and expires stale observations. Recovery from transient persistence failure does not lose queued records. Preferred sessions do not inherit another session's task/tool.
- The user-supplied architectural image is the unchanged scene asset. Its baked navigation and fictitious active profile are cropped out in CSS. Real room controls map 21 pictured squads; all 23 registered squads and 180 agents remain accessible through the registry-backed rail/list. Rooms open roster/session inspection. Public communication displays sender/recipient and evidence, with temporary lines only for observed messages.
- Package excludes nested dependency trees. Publish checks reject dependencies, producer tokens and timestamped office backups. Jest's shared mocked packages resolve consistently even after installing internal runtime dependencies.

## Browser and terminal receipts

Chrome measured desktop 1440 x 1000 and mobile 390 x 844: document width matches viewport, scene is contained, mobile search ends at y88 before hosts begin at y104. Room selection opens the actual Core roster; Zeus shows separate legacy/manual and native Claude sessions without cross-session task/tool leakage. Agent list is available alongside the spatial scene. Initial in-app console inspection had no errors; Chrome later reported extension message-channel errors, with no reproduced application exception. Separate browser high-zoom acceptance was not established by the viewport checks.

A real CLI manual observation updated the command bridge and room without reload within an upper bound of 333 ms (`artifacts/audit-20260906/office-latency.json`). A clearly labeled manual message fixture produced one inter-room SVG connection and `observed-only / manual` transcript. Stopping the collector cleared connections and displayed reconnect/unconfirmed-activity guidance; restarting restored the stream automatically. These checks are not provider execution or message delivery proof.

Actual PTY installer dry-run completed with keyboard selection and exit 0. Ctrl+C at the first question exited 1 without installation. Width fixtures cover 60/80/120 columns. Fresh source no-host init creates no Claude/Codex/Gemini directories. English-only wizard policy is unchanged.

## Host evidence

| Host | Evidence | Remaining boundary |
| --- | --- | --- |
| AEXOS CLI | Actual producer-to-browser update; explicit CLI emit/status bridge tested | Manual event submission does not execute a provider task |
| Claude Code | Actual native SessionStart and SessionEnd matched journal; installer hook wiring and path-with-spaces tested | Authenticated tool execution and message delivery not certified |
| Gemini | Native hook translation/configuration covered by regressions | Gemini executable unavailable here; no native lifecycle certification |
| Codex | Local CLI installed; explicit event bridge covered | Automatic native telemetry adapter not verified |
| ChatGPT | Explicit local event bridge covered | No native conversation adapter or delivery certification |
| Grok Bot | Explicit local event bridge covered | Grok executable unavailable here; no native lifecycle certification |

The office observes the CLI/Master execution path. It does not dispatch tasks or bypass approvals. Architectural people are illustration; only labeled observations represent actual agent activity.

## Remaining project findings

- Native cross-host execution and message transport still require authenticated recipient adapters and independent end-to-end acceptance. A shared visualization alone does not provide that transport.
- Task-contract coverage remains 1/218; missing contracts were not fabricated. Company-wide governed execution is not certified.
- Filesystem protection is not established merely by the presence of `path-guard.js`; complete runtime enforcement across legacy/provider subprocess paths remains open.
- CodeRabbit was unavailable; independent QA reproduced, rejected and retested code defects instead. No CodeRabbit pass is claimed.
- The working tree included substantial preexisting work and was preserved. Evidence applies to this local checkout/artifact, not a published stable release.

See `AUDIT-20260906-ARCHITECTURE.md`, `QA-AUDIT-20260906.md` and stories AEX-4.2 through AEX-4.5 for detailed findings and ownership. The two requested SynkraAI repositories were compared at pinned, remotely verified commits; upstream code also contained the Master false-green defect, so it was not adopted blindly.
