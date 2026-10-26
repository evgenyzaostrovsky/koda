# KODA: Yandex in-app verification — 2026-10-21

## Environment and scope

The coordinator operated the actual rendered React Native Web application in the in-app browser, not a mockup or a direct API-only script. Isolated origin: http://127.0.0.1:8093. Static audit build EXPO_PUBLIC_KODA_UI_AUDIT=1 disables Supabase and authentication; new disposable guest records remained local. Loopback API127.0.0.1:3337 used YandexGPT5.1 only (Gemini/OpenRouter keys were empty for that test process, credential files were not modified). No production data, schema changes, deployment, account settings or publication.

## Reproduced defect and fixes

The existing Помощник screen sent no AI request. A heavy-day input visibly received the fixed text “Принял. Следующий шаг: запиши это как конкретную задачу на сегодня или привяжи к цели.” The earlier provider comparison exercised the onboarding mentor API, which is a different flow.

Implemented a real /api/chat route in both Express and serverless handlers, sharing the server-only chat generator. It validates user/assistant history, keeps at most12 turns of up to2000 characters, applies capacity-aware guidance and requires a valid JSON reply. No fake/rules success is returned when all providers fail. Normal provider preference/fallback applies outside the isolated test process; the returned provider is displayed honestly. The chat proposes text only and does not automatically edit tasks or goals.

KodaApp now sends requests asynchronously and guards overlapping sends, retains the failed request for retry and appends the successful reply. KodaScreen provides pending feedback, accessible input/send controls, disabled send while pending, visible provider, error/retry and draft preservation during a retry. The local audit server gained an optional loopback-only proxy for the explicit API allowlist; unconfigured /api paths no longer return index.html.

## Actual browser scenarios

All inputs were explicitly marked test or synthetic. Goal flow: Goals list → Create goal → wish → skip optional outcome → request directions/actions → review → accept draft → inspect first actions → priority/deadline → create. Each was subsequently present after reloading and opening the goals list.

| Scenario | Goal creation | Actual chat |
|---|---|---|
| Ordinary: Python book app,30 minutes |3 directions/3 actions; steps10–15 minutes; saved|Yandex suggested defining the book-data structure within30 minutes|
| Overloaded: portfolio,15 minutes3 times/week, full-time work/child care |1 direction/1 action: choose1–2 existing works in5 minutes; saved, no invented portfolio target size|Yandex suggested one work description in5 minutes and permission to stop if tired|
| Hard day: finish a short story, only5 minutes |1 direction/1 action: read the beginning and mark where to continue in5 minutes; saved|Yandex suggested one sentence/key thought in5 minutes and a break if tired|

Each positive chat reply visibly showed “Диалог с KODA · Яндекс”. No daily schedule or catch-up obligation was imposed in these observed outputs. The goal suggestions remained uncommitted until the user clicked accept. Chat first steps are suggestions, not a guarantee of how long an individual will need.

## Error and retry

The coordinator stopped only the isolated3337 API, submitted a synthetic request about the same story with2 minutes available, and observed an honest error plus Повторить. The sent message remained in the transcript. A new composer draft remained present when retry started. After restoring the API, retry returned a real Yandex answer: write one key phrase/thought in2 minutes and rest if tired. The original retry message appeared exactly once in the rendered accessibility tree.

A later Enter press occurred after the answer had already completed and therefore submitted the new composer draft as a separate request; it is not evidence of a duplicate-send defect or a successful pending-Enter test. That unrelated request failed and displayed the normal error. The ref-based send guard and UI disabled state were reviewed/tested at code level; no claim of a controlled rapid-key timing test is made.

The transcript is in-memory and resets on page reload; persistent chat history was not added or claimed. Saved goals survived reload. No mobile/physical-device or screen-reader test was performed in this follow-up.

## Verification

- npm run typecheck: passed.
- npm run test:goal-ai: passed, including new scripts/test-chat-ai.ts.
- Independent read-only QA ran the chat test successfully and found no reproducible defect in the scoped code; it did not run a browser or live provider request.
- git diff --check: passed (ordinary LF/CRLF warnings only).
- Updated audit export succeeded: index-25a5fedd18107ea9b05e19fcba08af94.js,2150 modules. Server API keys were checked against the exported JS and none were present. The export is disposable audit-only, not a release artifact.

## Evidence

Screenshots of actual app UI, not generated mockups:

- [Goal, hard day](C:/Users/Professional/.codex/visualizations/2026/10/19/01a155da-f873-7862-9e39-955f19f18be5/koda-yandex-ui/goal-hard-day.png)
- [Chat, ordinary day](C:/Users/Professional/.codex/visualizations/2026/10/19/01a155da-f873-7862-9e39-955f19f18be5/koda-yandex-ui/assistant-ordinary.png)
- [Chat, overloaded day](C:/Users/Professional/.codex/visualizations/2026/10/19/01a155da-f873-7862-9e39-955f19f18be5/koda-yandex-ui/assistant-overloaded.png)
- [Chat, hard day](C:/Users/Professional/.codex/visualizations/2026/10/19/01a155da-f873-7862-9e39-955f19f18be5/koda-yandex-ui/assistant-hard-day.png)
- [Controlled local API failure](C:/Users/Professional/.codex/visualizations/2026/10/19/01a155da-f873-7862-9e39-955f19f18be5/koda-yandex-ui/assistant-error.png)
