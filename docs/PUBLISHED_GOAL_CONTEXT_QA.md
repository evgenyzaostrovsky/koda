# Published goal context verification — 2026-10-22

Target: https://koda-life.vercel.app (published deployment from 2026-10-22).
Only dedicated QA account data was changed. No application code, schema or deployment changed during this verification.

## Persistence and synchronization: PASS

- Published UI: entered a two-line Spanish-learning context, waited for Synced, reloaded the page, reopened the assistant. Textarea value matched exactly, including LF.
- A fresh independently authenticated Supabase client read the UI-saved context exactly.
- A second session changed the same synthetic goal context: ordering food was now complete, next task was requesting the bill in lesson 5, menu Sol, existing textbook, ten-minute sessions.
- The already-open published assistant received this changed text automatically, without reload or typing.
- Additional hosted checks: exact whitespace/newlines; A1→A2 and A2→A1 reads; explicit empty context survives stale snapshot CAS retry; account B cannot read account A's row and remains unchanged.
- Test goal: context-live-1792661681792-ad017c. Guarded SDK mutations preserved all other goal and account fields.

Evidence: .tmp/goal-context-live-result.json; .tmp/goal-context-browser-bridge.json; scripts/test-goal-context-live.ts.

## Published AI roadmap: context uptake PASS; specificity PARTIAL

Actual browser request, full roadmap mode, ten minutes, optional 64-step checkbox off. Returned 8 stages / 23 steps.

Stage 1: “Завершение урока «В кафе»”. Steps:
1. “Закончить упражнение с просьбой принести счёт”.
2. “Выполнить дополнительные упражнения с меню Sol”.

This uses the latest context from the second session, rather than the previous request to continue ordering food. No alphabet, introductions, purchases or new course were proposed. Preview was not applied to the goal.

Quality limitation reproduced: later stages become generic (“Изучить основные грамматические правила”, “Выучить новые слова и фразы”, “Перейти к следующему уроку”). Existing textbook chapter contents are unknown, so the result is not a fully specific curriculum. The first task follows the current stopping point; the whole roadmap should not be described as fully personalized or verified to fit ten minutes per step.

## Scope

Independent authenticated clients and a real published browser were used, not two physical devices. Concurrent conflicting nonempty edits were not exhaustively tested; current goal merge uses timestamps. Production data belonging to the user was not edited. No new publication.

Screenshots and full preview accessibility evidence:
C:/Users/Professional/.codex/visualizations/2026/10/19/01a155da-f873-7862-9e39-955f19f18be5/koda-context-live/restored.png
C:/Users/Professional/.codex/visualizations/2026/10/19/01a155da-f873-7862-9e39-955f19f18be5/koda-context-live/roadmap.png
C:/Users/Professional/.codex/visualizations/2026/10/19/01a155da-f873-7862-9e39-955f19f18be5/koda-context-live/roadmap-ax.txt
