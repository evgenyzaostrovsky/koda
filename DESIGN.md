# KODA LIFE 4.0 — Widget Desktop

Operate mode. The user-supplied desktop and phone Widget Desktop references are the visual authority for this iteration. A personal workspace opens directly onto live, asymmetrical bento widgets. Persistent side navigation is replaced by a compact brand/menu, search, quick add, desktop customization and account controls. Full sections retain existing workflows with an explicit return to the desktop.

Light sage canvas, ivory surfaces, restrained lime emphasis and one dark SCORE card. Existing theme IDs remain compatible. Main day widget occupies two thirds of the desktop top row. Second row: goal path, SCORE and note preview. Third row: focus, active project and habits. On phones the day comes first, planner and SCORE share a row, the goal has full width, focus and notes share a row when space permits. Below 365px use readable full-width cards. User ordering overrides the default phone arrangement.

No invented metrics or decorative data. Current day uses the accepted day plan, SCORE remains tied to its original version, graph uses completed current-formula days. Goal markers and percentage use existing milestones/actions. Empty paths explain the absence of stages. Habit marks use dated calendar facts. Timer widgets and full timer share one controller.

Cards radius24, circular global controls44, small body13–17, headings18–23, real score/time use large tabular numerals. Gentle offset shadows, local palette tokens and browser focus styling. Layout max1700; full-section editors retain existing readable widths. No horizontal page scroll. Launch is an approximately one-second brand moment with skip and reduced-motion support; navigation does not repeat it.

Customization is local and account-scoped: visibility and order, eight known widget IDs, version-tolerant normalization. No drag/drop or size editor. Goal stage management is progressively revealed through «Настроить этапы». Habit frequency supports daily and selected weekdays; pauses preserve dated completion history. Existing app-state JSON synchronization carries habit metadata and roadmap stages without a new schema.

Preserve source ownership, IDs, original obligations, revisions, offline queues, AI context and account isolation. All writes during UI checks use disposable local fixtures. No publication is authorized by this design implementation request.


## KODA LIFE 4.2 — dashboard reference override

The approved acid-lime bento reference replaces the dashboard composition only. Operate mode, existing domain truth and other full sections remain. Large day and lime goal sit across the top; a coordinated twelve-column CSS Grid places dark SCORE, habits, planner, note, focus and projects below. Default mobile order starts day / goal / planner; saved user order and visibility remain authoritative. Gaps 20–28 desktop, rounded silhouettes34 and selectively deep concave action pockets; mobile simplifies to28px rounded surfaces. NotchedWidget draws a non-interactive SVG silhouette with ordinary native content and button hit targets, with a plain rounded fallback before layout. No photographic backdrop, invented analytics, fake progress or data model change.


## KODA LIFE 4.3 — shared centered Bento system

Internal Operate surfaces now share BentoPage, BentoGrid, BentoCard/NotchedCard, FloatingCardAction, MetricCard, CompactWidget, SectionHeader and EmptyStateCard from components/Bento.tsx. Existing Card and SectionTitle delegate to that system. Shell content caps: desktop/day/planner1040; goals/progress960; projects/habits880; notes/assistant840; journal800; settings760; timer640. Header and body center together; ultrawide screens keep these caps. Internal mobile inset16; BentoPage removes duplicated horizontal padding from old screen styles. Desktop grid gaps24, compact16, padding20–24, selective SVG notches inherit NotchedWidget and keep the hit area outside the silhouette. Forms and editors remain classic.

The desktop composition and day-plan workflow are retained. Goal detail has a lime outcome/current/next card plus compact real facts, interactive stage route and a separate OTANI mode. Planner exposes its compact calendar and nearest-dated work alongside facts, with existing day/month/goal tools below. Notes opens to a pinned/recent library and preserves its editor on library transitions. Projects has a visible library followed by simple task detail. Timer settings are visible modules; existing persisted count is shown, no fabricated session timestamps/history. SCORE formulas, domain models, storage and sync are outside this iteration.

## KODA LIFE 4.4 — Signature Bento

Preserve the 4.2 desktop and day workflows. Internal surfaces use complementary modules rather than an undifferentiated stack: goal outcome spans two grid columns and two rows beside compact factual modules; one shared roadmap surface connects stage markers, with details below. Four stages fit horizontally, longer routes scroll locally; phones use a vertical rail. No-data states omit unsupported modules. Deep notches keep ordinary functional buttons and simplify on phones. Keep the existing 4.3 width caps.

Goal recommendations stay inside the current stage. An empty/deferred/blocked stage does not silently recommend later-stage work. The action form preselects the current stage and exposes all stages. Completed goals remain reachable from their own list filter and show completion separately from actual stage progress.

Planner puts the dated day list and quick entry in the main column, compact calendar and upcoming work alongside. Habits emphasize large completion controls with optional parameters. Progress combines a bounded real SCORE chart and explanation with neighboring metrics; active goals remain separate. Project libraries lead with actual project content rather than a row of zero counters. Notes removes the nested first-paragraph card; journal exposes history; chat quick prompts stay compact above the conversation. Timer and grouped profile retain their established composition.

Motion is brief and scoped: goal arrival changes position and shadow once; stage and checkbox interactions have short surface/press transitions; progress changes width. All CSS motion obeys prefers-reduced-motion. Existing storage, Supabase, SCORE mathematics, date semantics and IDs remain authoritative.
