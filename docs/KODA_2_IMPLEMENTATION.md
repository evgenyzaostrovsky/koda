# KODA 2.0: implementation and verification

Date: 2026-10-20. This document records implementation choices and evidence; it does not replace application code.

## Product decisions

- Today is the initial destination. Goals contains strategy and the existing goal workflow; Planner organizes dated work; Progress reports completed day plans separately from long-term outcomes.
- Open Window 64 is a digital goal structure: one central result, eight unique directions, 64 action positions, 81 physical cells. It is not presented as the complete Harada method or as a medical intervention. Repeated visual directions have the same entity ID.
- Canonical goal actions/routines and planner/project tasks retain ownership of completion. The matrix stores links, not a second task list. Habits are projected into daily suggestions without cloning their completion state.
- AI drafts directions and small actions. Suggestions require confirmation; manual creation remains available. The wizard draft is scoped to the account, saved locally, and restored after reopening.
- Product SCORE 2.0 uses internal `scoreVersion: 3`, because formula version 2 was already used for legacy 90/10 results.

## Score policy

The accepted plan freezes category, source identity, root work identity, goal priority, metric, target, title, expected minutes, minimum, and weights.

For both categories: goals receive 75 points and current tasks 25. A single nonempty category receives 100; no actions means no score. Goal priorities are 3:2:1. A goal's budget is shared by its selected root actions, so increasing the number of child records does not increase the goal's budget. A split shares its original root target and identity.

Binary outcomes require completion. Minutes/counts and frozen subtasks support proportional completion, capped at the action's weight. The minimum is separate recognition, never a points bonus. There are no additional failure penalties.

**Strict revision policy:** the primary SCORE remains the original accepted commitment. Explicit revisions create immutable snapshots and show a separate current-plan percentage. Removing nine unfinished actions cannot turn one completed original action into headline 100. This deliberately resolves the earlier discussion's ambiguity in favour of the master prompt's strict anti-inflation rule. Technical edits, moves and deletion never change accepted snapshots. The UI explains both percentages.

Progress facts are absolute observations, not additive retries. Event IDs are idempotent. Concurrent observations of the same work do not sum; a later explicit correction supersedes observed facts. Source deletion is not evidence of an undo. Explicit UI edits can record a correction to zero. Conflicting plan versions remain available; selecting a branch records a causal resolution without deleting unseen future branches.

## Storage and migration

No SQL schema change is required for this implementation:

- `Goal.openWindow` travels inside the existing `user_app_state.goals` JSON.
- `KodaDay.plan` travels inside existing day JSON and `koda_days.calculation_snapshot.__dayPlan`.
- A compatibility copy of day data is stored in the profile JSON for schemas without a `koda_days` app-state column.
- Existing compare-and-swap app-state writes merge immutable plan histories before retrying. Habit marks merge per dated cell; explicit undo survives stale values, and deletion uses a tombstone. Simultaneous contradictory edits of the same habit date resolve deterministically by operation time/ID; this is a stated limitation, not a whole-snapshot overwrite. Matrix alternatives are retained as explicit variants, including snapshots needed to restore missing linked records.
- Existing completed days retain their original scores/formula versions and do not recalculate after goal edits. Incoming active data does not silently reopen a completed day.
- Existing legacy goals do not acquire an empty matrix unless the user opens/converts them. Existing IDs remain stable; new goal actions/routines/milestones use UUIDs. Legacy child IDs have deterministic UUID projections at the existing SQL boundary.
- Malformed plan JSON is rejected at the read boundary rather than crashing the screen.

Rollback: retain/export a full local/account JSON snapshot before running an older client. The old client may ignore newly added JSON fields and erase them on a subsequent save; do not run an older writer against the same account until the new data is backed up. No production SQL, data deletion, deployment or credentials were changed in this task.

## UX audit and implemented response

The initial source audit found:

1. Planner was the default screen while beginning a day lived under a section labelled KODA. Today is now the default and a named destination.
2. Day start had no accepted item/weight snapshot. New day start shows an automatic time-bounded proposal with a reserve and optional correction.
3. Score weights were 90/10 with a failure penalty, and Progress used a third unrelated average under the same SCORE name. Actual day plans now use one engine; Progress reports saved day results.
4. Completed goal actions from prior days could influence later evaluations. New facts are day-scoped and historical snapshots are stable.
5. The historical editor could manually assign score components. The current day/history workflow exposes actual facts and snapshots instead of arbitrary score entry.
6. The old negative classification was replaced with neutral copy. New SCORE has no automatic moral classification.
7. Flat goal editing had no strategic direction structure. Goals now offers a staged wizard, a desktop matrix, a mobile central block/direction flow and a separate full overview.
8. Secondary explanation, weighting and version history are disclosed on request. Touch targets in new day controls are at least 44 units; labels accompany actions; new modals do not animate, respecting reduced-motion use.

Reading code does not establish usability in 5–10 seconds, screen-reader conformance, contrast at every palette, one-handed reachability or device performance. These remain runtime/user evaluation questions and are not inferred from component names.

## Skills

Installed into the user's Codex skills directory via the bundled skill installer, without project hooks or executing downloaded skill binaries:

- [progressive-disclosure](https://github.com/LennartKoehler/agent_skills/tree/main/skills/progressive-disclosure)
- [information-architecture-navigation](https://github.com/hueyexe/frontend-agent-skills/tree/main/information-architecture-navigation)
- [ux-usability-foundations](https://github.com/hueyexe/frontend-agent-skills/tree/main/ux-usability-foundations)
- [impeccable](https://github.com/pbakaus/impeccable/tree/main/.dsh/skills/impeccable)
- [ux-writing-content-design](https://github.com/hueyexe/frontend-agent-skills/tree/main/ux-writing-content-design)

The Impeccable context launcher was not executed; existing project documentation, theme tokens and textual Operate/craft references were used. Installed skills become available for automatic selection on the next user turn; their text was read directly for this work.

## Method references

- [Mandala Chart structure](https://frameworklist.com/frameworks/mandalachart)
- [Mandala Chart Maker](https://mandalachart.app/)
- [Harada Grid](https://harada-grid.com/)
- Original Ohtani chart image was located through image search; implementation geometry is additionally verified by tests: central goal at cell 40, 16 physical direction cells pointing to eight unique directions, 64 action cells.

The supplied mandalachart.app/guides/harada-method URL could not be fetched during research. Available sources agree on the one/eight/64 structure; no historical equivalence between all similarly named methods is assumed.

## Verification commands

- `npm run typecheck`
- `npm test` (includes score, plan properties/scenarios, KODA2 storage integration, matrix, AI contract, history, emotions, timer, offline shell, sync and themes)
- `npm run build:web`

The integration test exercises matrix link → accepted plan → completion/undo → revision → local JSON reload → Supabase row roundtrip → fixed historical result → concurrent app-state CAS. It uses an in-memory PostgREST boundary, not live Supabase.

Historical limitation from 2026-10-20 (browser access was recovered on 2026-10-21; see the later section): local Expo reported `Failed to start watch mode`; browser tab access timed out on CDP `Emulation.setFocusEmulationEnabled`. Browser E2E, mobile/tablet visual inspection, assistive-technology checks and live multi-device Supabase are not claimed as passed on the basis of unit tests. Final command outcomes and independent QA findings are recorded in the final handoff.

## Verification updates

Final source tree: all implementation changes are local and uncommitted. Existing user changes were preserved. The app has not been deployed.

- The full original/expanded npm suite passed before the final QA fixes.
- The plan engine now has 31 suites plus 250 seeded property iterations.
- The KODA2 integration chain passed, including concurrent CAS writes.
- Independent QA reproduced the habits snapshot risk by inspection; the fix was re-reviewed and its 9 habit suites were independently executed successfully.
- A post-integration typecheck and the normal web/PWA build completed successfully. Final reruns follow the last scoped fixes.
- Expo CI mode avoids the failed file watcher. A disposable audit export lives under ignored `.tmp/koda2-audit`; it must never be published. Browser access to localhost still timed out, so this does not establish E2E or visual success.

The existing UI audit flag now disables `isSupabaseConfigured()` as well as sign-in, so guest UI fixtures cannot enter a live Supabase database. Production mode retains the normal configuration check.

## Acceptance checkpoint before browser recovery (2026-10-20)

| Area | Implemented | Evidence | Remaining acceptance check |
| --- | --- | --- | --- |
| Today and SCORE | Automatic proposal, acceptance, next step/timer, measured progress, minimum, revisions, finish, history | 31 plan suites, 16 scenarios, 250 seeded iterations; integration chain; typecheck | Real browser start/edit/finish and assistive technology |
| Goal structure | Eight directions, linked canonical actions/routines, 9×9 and mobile 3×3, editing/archive/history/conflicts | Geometry, links, reload, conflict and cycle tests | Mobile/tablet/desktop visuals, themes, long text and font scale |
| Goal wizard and AI | Manual stages, account draft, provider endpoint, validated suggestions with confirmation | AI contract/error/dedup/limits tests | Browser draft reopen and real provider availability |
| Persistence | Additive JSON, legacy preservation, CAS merge, immutable plan histories, habit per-date edits | Memory PostgREST/CAS integration, row roundtrip, offline and 9 habit suites; independent QA re-review | Real network loss/reconnect and multi-device test account |
| Build | Existing web/PWA pipeline | Successful web/PWA build before the last scoped edits; final rerun recorded below | No publication requested |

These remaining runtime checks are required before calling the master prompt fully accepted. A pure model integration test is not a browser E2E test. The UI audit export is isolated from Supabase and must never be deployed.

Next runnable acceptance sequence, using disposable test data: create a manual goal → add directions/actions → accept Today proposal → mark/undo progress → revise → finish → reopen history; repeat at mobile width and both themes; then test offline/reconnect with two test sessions. Real AI output must be reviewed before confirmation.

External AI smoke attempt: a synthetic Python learning goal was sent through the existing configured provider chain. No valid response was obtained in this environment. This is recorded as unverified/unavailable, not a passing provider test; no goal or suggestion was saved. The temporary smoke script was removed.

Latest final checks: npm run typecheck passed after all application edits; plan 31 suites and KODA2 integration passed after the final priority-order regression assertion. npm test passed after the habit synchronization fix. git diff --check passed (only Git line-ending notices).

Final static UX re-review: QA inspected Today, GoalWizard, GoalMatrix, GoalsScreen and their KodaApp wiring. The wizard secondary draft action previously created a goal; it now closes the wizard, retaining the autosaved draft, and the required title step cannot be skipped. QA rechecked the fix and found no additional reproducible source-level defects in the scoped transitions, own-task addition, modal close actions and read-only history. This was a static review, not browser E2E.

Post-wizard-fix npm run typecheck completed successfully (exit 0). No application edits followed this check.

Final normal npm run build:web passed after final code changes (exit 0): 2149 modules, 3.3 MB bundle, exported to dist; existing PWA preparation completed in the same successful command. No deployment followed. Bundle: index-ecb8deb6d0ab773b903cdc6c0e6f897a.js.

## Browser verification — 2026-10-21

The earlier localhost blocker was diagnosed: sandboxed network calls returned EACCES and the sandboxed preview could not accept browser traffic. A separate explicitly approved process serves the audit export on loopback only, http://127.0.0.1:8089. No publication, production database writes or real account fixtures were used. The audit export has EXPO_PUBLIC_KODA_UI_AUDIT=1, which disables Supabase.

Executed in the actual browser: desktop 1440×900 manual goal wizard, draft close/reopen across reload, invalid deadline recovery, unavailable-AI manual continuation, priority confirmation, matrix links, automatic Today proposal, own-task creation, accept, complete/undo/re-complete, minimum and revision. For a two-action goal + one current task: goal completion gave 37.5 points (38 displayed); with the current task the total became 62.5 (63 displayed). Removing the other unfinished goal action by revision retained headline 63 and showed current-plan 100%. On 390×844: finish with summary, reload, read-only history containing original/revised plans; matrix 3×3, overview, archive/restore, adding and moving a linked action, reload. History stayed 63 after subsequent matrix edits. Both light and dark themes were rendered; console errors/warnings were empty in the inspected session.

Reproduced and fixed in this pass: unlabeled create/back/goal menu actions; missing explicit ARIA checked/pressed state; checkbox Space key ignored by React Native Web; clipped matrix zoom control at phone width; primary Today/Goals destinations absent from bottom navigation; guest labels falsely reporting pending cloud synchronization. Targeted runtime rechecks and independent QA results follow below.

External AI: synthetic requests outside sandbox still failed. Gemini returned HTTP 400 with a regional restriction; OpenRouter returned HTTP 404. No provider success is claimed, no credential values or response bodies were printed, and no goal/suggestion was saved by those calls. The temporary diagnostic script was removed.

Post-fix runtime checks on the final audit bundle index-141ad8b37583959ef30c2c31d2bd3896.js: bottom navigation is Today → Goals → Planner → Progress, active destination exposes aria-current; local-only labels are honest. Named checkbox Space changed false→true; Enter changed true→false once. Wizard radio default important exposes true; Space selects supporting. Back/Create buttons work with Enter. Continuing later closed the wizard without creating a goal card. At viewport390 the zoom-in button right edge is376; at320 it wraps and right edge is156; document width320 equals viewport320. Progress reports the same saved63 and separate long-term goal0%, not an action-count outcome. Final screenshots: desktop-finished.png and mobile-finished.png under the dated visualization evidence directory.

After the fixes, npm run typecheck and npm run test:open-window passed. Independent mobile browser QA and the refreshed normal web/PWA build are recorded below when complete.

A second full mobile-only scenario was executed by the coordinator on the separate localhost:8089 origin: create goal/direction/action, edit Today to select it and a current task, accept, next-step navigation opens the correct goal, completion75→undo0→re-completion75, remove unfinished task by explicit revision (headline75/current100), finish, reload, both versions in history, Progress75. This was all at390×844. Independent QA could not access the parent's browser (empty browser inventory in its runtime), so it reviewed the final source and saved screenshots only. Its low-severity note about explicit aria-current on desktop/drawer navigation was accepted and fixed. No independent runtime success is claimed for that agent.

Final navigation state was verified in the actual browser after the last ARIA patch: desktop-tab-habits and mobile-menu-habits both expose aria-current=page.

An additional visual correctness fix removes the shared ProgressLine minimum3% fill for zero-valued results; the numerical SCORE calculation is unchanged. Final post-fix export/check outcomes are recorded below.

Remaining external checks: successful live AI suggestion (Gemini region restriction / OpenRouter404), real Supabase network interruption and multi-device test-account synchronization. Full screen-reader evaluation and physical device testing are not claimed; phone results above are browser viewport tests. The requested main desktop/mobile UI flows have been exercised on disposable local data.

The final audit export index-f99a0ffad3f795633af466eb9981c02d.js passed. On the rendered goal with0%, the fill changed from3% (32.39px of1080px) to0% (0px of1080px). Matrix zoom was exercised100→88→100. Final TypeScript passed after this source change. The browser viewport override was reset and the local desktop preview retained.

Evidence artifacts:

- [Desktop completed day63](C:/Users/Professional/.codex/visualizations/2026/10/19/01a155da-f873-7862-9e39-955f19f18be5/koda2-e2e-2026-10-21/desktop-finished.png)
- [Separate mobile end-to-end day75](C:/Users/Professional/.codex/visualizations/2026/10/19/01a155da-f873-7862-9e39-955f19f18be5/koda2-e2e-2026-10-21/mobile-flow-finished.png)
- [Dark mobile view of day63](C:/Users/Professional/.codex/visualizations/2026/10/19/01a155da-f873-7862-9e39-955f19f18be5/koda2-e2e-2026-10-21/mobile-finished.png)

These files are screenshots of the local audit application with disposable test data. They are not mockups.

Final ordinary web export passed after all source fixes: index-4df311243004694e8bc08fc931d29805.js,2150 modules,3.3MB, EXPO_PUBLIC_KODA_UI_AUDIT=0. The exported bundle was checked to contain the zero progress clamp and no old3% floor. node scripts/prepare-pwa.js passed (exit0). No deployment or production database changes followed.

Final npm run test:offline passed: blocked-network fallback, index fallback, cached assets and online refresh. This is the automated offline-shell test, not a live Supabase multi-device test. All source edits in this follow-up are complete; the local audit preview remains on127.0.0.1:8089.


## AI restoration — 2026-10-21 (local only)

The original OpenRouter404 was reproduced with a synthetic request: key validation200, configured openai/gpt-oss-20b:free404. Upstream explicitly reported that the free variant was withdrawn and offered a paid slug. No paid model was selected. The local ignored environment now uses OPENROUTER_MODEL=openrouter/free and KODA_AI_PROVIDER=openrouter; credential values were not changed. Hosted environment settings and deployment were not changed.

Both AI flows now share the server-only OpenRouter transport, JSON parsing, safe errors and a40-second abort deadline. A404 from an explicitly configured :free model permits one fallback to openrouter/free under the same deadline; other errors are not retried, and a paid slug is never invented. JSON-capable endpoints are required. Low reasoning effort and a3000-token output budget reduce empty/truncated responses; length-limited output is rejected rather than treated as a valid plan. Finalized assistant replies retain nextQuestion=null. Provider preference and configured-primary health are shared between Express and serverless handlers. Health describes configuration, not a live availability probe.

Actual external checks on disposable prompts: retired-free→free-router produced a validated plan with8 directions/16 actions. A full assistant response with low reasoning returned provider=openrouter,4 goals in6.6s. Final HTTP integration against loopback Express on127.0.0.1:3335: POST /api/goal-plan200,8 directions,4.6s; POST /api/onboarding200,provider=openrouter,4 goals,6.9s. These were real upstream responses, not mock/rules output. No suggestions were saved to user records.

Limitations observed during diagnosis: intermittent network/connect timeouts, slow random free-pool models, and429 from the shared upstream Gemma free pool. The code correction does not guarantee free-provider availability; existing manual/rules fallback remains. Gemini's earlier regional restriction was not bypassed. No account privacy settings, credits, DB schema or production data were changed. UI/browser flows were not repeated for this server-side change.

References: [Free router](https://openrouter.ai/docs/guides/routing/routers/free-router), [reasoning/output budget](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens). Final automated/independent review outcomes follow below.

Final independent read-only QA: npm run typecheck exit0 and npm run test:goal-ai passed on the final reasoning configuration; no defects found in the scoped AI chain. Mock coverage does not simulate elapsed40-second abort timing. The coordinator separately verified both real HTTP routes as recorded above. Temporary diagnostic scripts were removed; the loopback test API remains available on3335.


Yandex integration and same-scenario comparison completed locally on2026-10-21. See [AI_PROVIDER_COMPARISON.md](AI_PROVIDER_COMPARISON.md) for exact timings, tokens, content limitations, implementation and verification. Yandex is now the explicit local primary; no hosted settings or publication.

Capacity-aware prompt follow-up: initial suggestions are limited to1–3 directions with1 action each (1x1 when numeric session budget<=15min), without changing saved/manual OW64 matrices. Six same Yandex scenarios were replayed, with network failures/retries retained and two localized QA rechecks. See AI_PROVIDER_COMPARISON.md and evidence/ai-yandex-capacity.json. No publication or production data changes.


Yandex in-app verification completed on2026-10-21. Fixed the Помощник stub by connecting real chat API and added honest pending/error/retry/provider feedback. Goal creation and chat were exercised for ordinary/overloaded/hard-day scenarios; saved goals survived reload and controlled API failure recovered by retry without duplicating the original message. Evidence and limitations: YANDEX_IN_APP_QA.md. No deployment or production data writes.
