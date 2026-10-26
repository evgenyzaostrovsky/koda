# KODA redesign release — 2026-10-23

Published on explicit request «Публикуй редизайн КОДА».

- Main URL: https://koda-life.vercel.app
- Deployment: https://koda-8snjyq08z-jedis-projects-525d8ecd.vercel.app
- ID: dpl_DmcLw37ySTE8dE1LAtk1gqnMonen
- Vercel status: READY, production; canonical alias assigned.
- Production bundle: index-6bd71e1c47f7a9decb80ea420b2b666c.js
- Deployed existing working tree using Vercel CLI, with build override EXPO_PUBLIC_KODA_UI_AUDIT=0. No database migration or provider change.

Verification:
- Existing redesign typecheck, full tests, local production build and desktop/mobile scenario evidence recorded in SCROLLTIDE_REDESIGN_QA.md. No app source changes in this release turn.
- Canonical HTML and web bundle respond successfully; new sage/lime tokens present; service worker references the same bundle.
- /api/health: HTTP 200, provider=yandex, yandexEnabled=true, model=yandexgpt-5.1.
- Canonical browser tab reloaded into the new Today design in the existing QA account and reached «Синхронизировано». No goal/day/chat content written during release verification. Browser error log empty.
- Screenshot: C:/Users/Professional/.codex/visualizations/2026/10/19/01a155da-f873-7862-9e39-955f19f18be5/koda-scrolltide/published-redesign.png

Local changes remain uncommitted. Existing unrelated changes preserved. CLI npx startup was cancelled when it stalled; installed cached Vercel CLI 65.0.0 completed the release successfully.
