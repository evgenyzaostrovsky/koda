# KODA: YandexGPT vs OpenRouter — 2026-10-21

Local integration and comparison only. No deployment, database migration or user-record writes. Synthetic data was used throughout. Credentials remain in the ignored server .env and were not copied to evidence.

## Configuration and implementation

YandexGPT Pro5.1 is connected to the goal-plan generator and the onboarding mentor through the server-only Completions API. Authentication uses Api-Key and the folder project header; the client enforces a40-second abort, JSON output and rejection of empty/truncated responses. Models, keys and folder identifiers are never put in client config. Health identifies the configured primary, not live availability. The header recognizes Yandex.

Local .env now selects KODA_AI_PROVIDER=yandex and YANDEX_MODEL=yandexgpt-5.1; OpenRouter remains fallback, then the existing Gemini/rules behavior. Merely adding Yandex credentials does not enable paid fallback for auto/OpenRouter selection. Hosted settings were not changed. The local API was exercised on127.0.0.1:3336 with Yandex explicitly selected.

The shared mentor prompt no longer sends rulesDraft to the model: that draft caused copied answers and unrelated30–45-minute steps. The question cap is enforced by the app; the prompt explicitly requests a final plan at the cap. Nonempty AI goals and a valid profile are required, preventing an empty model plan from silently becoming rules output labelled Yandex. Missing nextStep uses the first validated AI goal step, not the unrelated rules step.

## Method

Six scenarios per provider: ordinary Python project, overloaded portfolio, hard-day short story, vague wish, overloaded mentor, hard-day mentor. Same application prompts, input, JSON-object format and3000-token cap within each pair. Provider order alternated. No other provider was allowed to supply a successful answer in the comparison. OpenRouter used openrouter/free and therefore selected different underlying models; this is a comparison of the configured services, not two fixed foundation models.

One observation per provider/scenario. The four unchanged goal cases come from evidence/ai-comparison.json; two mentor cases were rerun after the shared prompt/contract correction and come from evidence/ai-comparison-mentor-refined.json. The baseline mentor entries are retained for diagnosis and are not counted as final results. Temporary intermediate refinement results are not presented as a final benchmark.

## Final results

| Scenario | YandexGPT5.1 | OpenRouter free |
|---|---:|---:|
| Ordinary goal |2.693s, valid|15.524s, valid|
| Overloaded goal |3.502s, valid|10.118s, valid|
| Hard-day goal |3.421s, valid|32.201s, valid|
| Vague wish |3.981s, valid|6.113s, valid|
| Overloaded mentor |3.172s, valid|40.027s, timeout; rules not counted|
| Hard-day mentor |2.645s, valid|16.612s, valid|

Yandex6/6 structurally usable responses, median3.297s; OpenRouter5/6, median15.524s among successful responses. These results do not establish long-term reliability or semantic correctness. Earlier baseline OpenRouter also produced429; an intermediate mentor call spent3000 tokens on reasoning with no usable content.

Yandex reported2080 input +2239 output tokens for the six final cases. At the published synchronous tariff0.80RUB/1000 input and0.80RUB/1000 output, the estimate is3.4552RUB total (~0.58RUB/request). This is not the full diagnosis bill: smoke tests, intermediate mentor iterations and HTTP checks were additional. OpenRouter reported zero cost on successful free-model responses; usage of the failed timeout is unavailable.

## Content assessment

- Ordinary goal: both produced relevant Python-project directions; OpenRouter narrowed the implementation to a console app and JSON storage, while Yandex proposed a broader database/interface scope.
- Overload: Yandex invented10–15 portfolio pieces despite only45 minutes/week. OpenRouter suggested3 cases plus networking, also adding scope. Neither should impose these targets without confirmation.
- Hard-day goal: Yandex produced24 actions and a5–10-minute daily writing routine; OpenRouter replaced the requested completed story with a first-scene result and added daily ritual/time tracking. These are content failures even though JSON validates.
- Vague wish: Yandex's result remained non-measurable and expanded to eight life areas; OpenRouter chose household organization without asking the user. Neither inferred the user's main goal reliably.
- Final overloaded mentor: Yandex gave two goals with15-minute steps and finalized correctly. Final hard-day mentor gave a5-minute first action; its target still used daily-practice language. OpenRouter's successful hard-day answer was more explicit about flexible planning, rest and1–5-minute steps.

Recommendation: use Yandex locally to assess its much faster responses and more consistent availability in this sample. Do not infer ADHD suitability from provider identity or response time. Before wider release, refine goal prompts/interaction so optional long-term directions do not become a daily workload, uncertain results are clarified, and invented targets require user confirmation. OpenRouter remains a useful fallback but its random free pool was slower and less predictable here.

## Verification

Real Yandex smoke200; both actual Express routes returned200. After mentor fixes, HTTP onboarding returned provider=yandex, shouldFinalize=true, nextQuestion=null and nonempty goals at the question cap. No plan was saved. Mock tests cover authentication/header/model URI, opt-in paid provider selection, both flows, cap enforcement, rejection of empty goals and invalid/truncated responses, no draft in the model request and safe errors. TypeScript and targeted AI tests passed; independent read-only QA confirmed these checks. UI rendering, physical devices, cloud deployment and database persistence were not tested in this backend comparison.

## Reproduction

Run npm run test:goal-ai for local mock checks. Explicit live comparison: node node_modules/tsx/dist/cli.mjs scripts/compare-ai.ts --live (12 synthetic calls, Yandex billed). Add --mentor-only for four mentor calls. Live runs overwrite their corresponding evidence JSON files.

Sources: [models](https://aistudio.yandex.ru/ru/docs/ai-studio/concepts/generation/models), [structured requests](https://aistudio.yandex.ru/ru/docs/ai-studio/operations/generation/completions-structured), [pricing](https://aistudio.yandex.ru/ru/docs/ai-studio/pricing).


## Capacity-aware prompts follow-up

User requested smaller plans, real time/energy limits and no imposed daily routine. Same six synthetic YandexGPT5.1 scenarios were repeated, with identical input and generation settings. No OpenRouter requests were needed for this before/after Yandex comparison.

Implementation: shared planningGuidance prioritizes the user's own session length, frequency and energy over completeness; lower explicit time in the text takes precedence over a default field. Daily frequency, streaks, catch-up work, invented targets and additional life domains are not prescribed. Ordinary drafts request1–3 directions with one action each; low-resource/vague requests ask for one. Initial-draft shaping also caps model output at3 directions/1 action, or1 direction/1 action when numeric availableMinutes<=15. The full manual OW64 matrix and existing goals are unaffected. Mentor requests1–2 user-derived priorities with small first steps rather than filling unrelated life domains. The goal prompt preserves the user's outcome instead of replacing completion of a story with writing a first scene.

| Case | Previous Yandex output | New output |
|---|---|---|
| Ordinary Python goal |8 directions,16 actions|3 directions,3 actions; individual steps5–15 minutes|
| Overloaded portfolio |8 directions,16 actions, invented10–15 works|1 direction,1 action: choose an existing project and note a short description in5 minutes; no portfolio-size target|
| Hard-day story |8 directions,24 actions; daily5–10-minute sessions|1 direction,1 action: write one phrase/thought in5 minutes; completed-story outcome retained|
| Vague wish |8 directions,24 actions, generic life improvement|1 direction,1 clarification action; provisional result is choosing an important life change|
| Overloaded mentor |2 goals with15-minute steps after prior mentor fix|2 relevant goals with5-minute steps and flexible timing; final question cap retained|
| Hard-day mentor |2 goals, one target imposed daily practice|1 goal with a1–5-minute step; no imposed daily practice|

Final evidence: evidence/ai-yandex-capacity.json. Six usable responses were eventually obtained. First pass had5 failures without recorded HTTP status and1 success; explicitly rerunning only failures obtained the remaining5 successes. The first complete repeat comprised11 attempts, so this is not a6/6 first-attempt reliability result. After QA, only vague and mentor-overloaded were refined and rerun once each; the evidence now retains all13 attempts (5 failed,8 successful across6 unique scenarios). Other four cases were not rerun after that localized wording adjustment. Median of successful responses2.015s; connection failures took about12–13s and are excluded from that median. The preliminary iteration, including its failures/retries, is retained separately in evidence/ai-yandex-capacity-initial.json and is not mixed into final metrics.

After independent QA, the vague-wish repeat now asks to name/write one sphere, without listing three options. The overloaded mentor repeat offers1–2-minute first steps. Content limits: its summary still says “regular steps” despite prompt guidance, but assigns no daily schedule or frequency. Some actions combine choosing and noting a thought. The hard-day mentor cannot invent a concrete project step because its input names no actual goal, so it offers choosing a tiny action. These are remaining wording/clarification limits, not invented daily obligations. Capacity rules are prompts plus draft-size bounds, not proof that every future semantic recommendation fits a user's energy.

Before the two localized QA repeats, the six successful replies reported5851 total tokens; at the prior documented0.80RUB/1000 tariff this is about4.68RUB, excluding preliminary iterations and HTTP checks. Prompts became longer while outputs became shorter. No credentials, real user records or account settings were included in evidence. No publication.

Verification: targeted AI mock tests passed, including a deliberately oversized8x3 model response reduced to1x1 at15 minutes and3x1 at30 minutes. Existing raw OW64 validation still permits the full matrix. Final TypeScript and AI tests passed. Independent read-only QA reviewed the saved outputs and identified the wording issues above. Actual loopback HTTP goal-plan returned one direction and one action for the overloaded15-minute request; no record was saved. The local API was restarted after the last wording change.

Follow-up reproduction: node node_modules/tsx/dist/cli.mjs scripts/compare-ai.ts --live --yandex-only runs the six paid synthetic Yandex scenarios into the capacity evidence file; --retry-failed appends only failed-case retries, and --scenarios=vague,mentor-overloaded appends selected rechecks. Previous attempt records are retained for these append modes.


Actual application follow-up: the visible Помощник screen was still a fixed local stub, unlike the onboarding mentor exercised above. It is now connected to a dedicated real chat API with loading/error/retry/provider UI. All three goal flows and all three chat scenarios were run through the rendered app on isolated disposable data. See YANDEX_IN_APP_QA.md for evidence, checks and limits. No publication.
