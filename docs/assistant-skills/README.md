# KODA planning skills

These are runtime policies, not a promise of model fine-tuning or autonomous agents. They are explicitly included by `goalPlanProvider.ts` and the goal-scoped chat in `chatProvider.ts`. Installing a Codex development skill alone does not change KODA responses.

## Course planning

Implementation: `src/ai/studyPlanning.ts`.

- Preserve curriculum modules independently of the eight OTANI factors.
- Latest user progress wins; completed modules consume no future capacity.
- The model extracts modules and estimates remaining effort. Clearly label estimates and proposed availability.
- The application computes dates from minutes and study weekdays, keeping a shared daily budget across modules. It reports overflow rather than squeezing work into an impossible deadline.
- UI presents all modules and requires acceptance. No automatic account or calendar writes.

## Goal setting and OTANI

Implementation: `src/ai/otaniGuidance.ts`, `goalPlanProvider.ts`.

- A concrete outcome, starting point, constraints, materials, and deadline inform the proposal.
- One central goal, up to eight supporting factors, up to eight observable actions each. A factor map is distinct from the sequential curriculum schedule.
- Preserve existing user work, concise action labels and detailed explanations.
- Do not invent a career, course, required resource or completed skill; examples must not bias unrelated users.

## Reviewed external references

- [Ganbaru](https://github.com/jeffjeef979/Ganbaru/tree/main/skills/ganbaru): goal coaching, capacity checks and Harada-inspired factors. Reviewed `SKILL.md` and method catalogue; its English-only interview/export flow is not appropriate for this Russian in-app wizard and is not executed.
- [Microsoft community submission: exam-prep-learning-plan-builder](https://github.com/microsoft/cat-agent-skills/tree/main/submissions/exam-prep-learning-plan-builder): syllabus, available time, confidence and schedule review. Community contribution, not certification of model quality.
- [study-planner](https://github.com/dguywhoknows/study-planner): separation of AI topic extraction from a constraint scheduler and explicit overflow warnings.
- [aryanvx/harada](https://github.com/aryanvx/harada): example of AI-assisted 1–8–64 UI; not reused as an unreviewed dependency.
- [Harada Education Institute OW64](https://harada-educate.jp/ow64/): method source linked by Ganbaru.

External skills were downloaded to an isolated review directory, not executed or blindly appended to system instructions. Runtime rules are an original integration fitted to KODA contracts; no third-party executable dependency or third-party plan storage was added.

## Checks

`node --import tsx scripts/test-study-planning.ts` checks arithmetic, weekends, completed work, more than eight modules, validation and the server/client round trip.

`KODA_STUDY_LIVE_TEST=1 node --import tsx scripts/test-study-planning-live.ts` explicitly opts into a real GPT call with a synthetic drawing course, no account access. It checks all ten modules, progress, two-hour weekdays, calculated end dates and useful OTANI structure. Model output may vary and one successful run is not a guarantee for every curriculum.
