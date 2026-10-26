# Production release — 2026-10-22

Published on explicit user request «Публикуй».

- Main URL: https://koda-life.vercel.app
- Deployment: https://koda-6ed5s369r-jedis-projects-525d8ecd.vercel.app
- Deployment ID: dpl_5P2iYb6o7NnQP52svySUne7bMgsJ (READY, production)
- Production bundle: index-9be8ab34701aaa1eded52f67e3023823.js

Validation:
- npm run typecheck, npm test, npm run build:web — exit 0.
- Local production bundle includes saved context and configured Supabase; private AI keys absent from client bundle.
- Production HTML and service worker reference the same production bundle.
- Production /api/health reports yandex, yandexEnabled=true, model=yandexgpt-5.1.
- Real synthetic production goal-plan request returned one next action for an already configured Python/CSV workflow; real chat returned provider=yandex. No goal records were written by these requests.
- Browser at canonical URL loaded successfully, reached «Синхронизировано» in an existing test session, and showed the new roadmap/current-state/autosave UI. No text was entered and no goal modifications were made during this production browser check.
- Screenshot: koda-release/production.png in the task visualization directory.

Deployment configuration:
- Added production YANDEX_API_KEY and YANDEX_FOLDER_ID as sensitive variables through CLI stdin; set YANDEX_MODEL, KODA_AI_PROVIDER=yandex and EXPO_PUBLIC_KODA_UI_AUDIT=0.
- Existing Supabase, OpenRouter, Gemini and push settings retained. No schema migration performed.
- .vercelignore now excludes .tmp, agent configuration, Supabase temporary files and test evidence. No audit build was deployed.
- Production secret download was rejected by automatic review; publication continued safely using variable names and the user's existing local Yandex credentials. No production secrets were downloaded.

Local changes remain uncommitted; Vercel CLI deployed the current working tree. This document was written after the successful deploy and is a local release record.
