# KODA MVP Architecture

## Product Boundary

KODA MVP follows the approved dark RPG dashboard/onboarding mockups. Do not introduce new visual directions or extra screens without approval.

The product is not a todo app. The core entity is `Future Self`; quests are small actions that level up the user and their life attributes.

## Frontend Stack

- Expo + React Native + TypeScript
- React Native Web for desktop MVP preview
- Supabase Auth and Postgres
- Local backend `server.ts` for AI provider routing
- AI provider fallback chain: Gemini -> OpenRouter -> rulesProvider

## Current Source Layout

```txt
App.tsx
server.ts
supabase/
  migrations/
    0001_koda_mvp_schema.sql
src/
  ai/
    aiProvider.ts
    geminiProvider.ts
    openRouterProvider.ts
    rulesProvider.ts
  components/
    Header.tsx
    PrimaryButton.tsx
  config/
    env.ts
  features/
    auth/
    onboarding/
    dashboard/
    futureSelf/
    attributes/
    goals/
    quests/
    reflect/
  lib/
    supabase.ts
    xp.ts
  onboardingV2/
  services/
  styles/
  theme/
  types/
    api.ts
    database.ts
    domain.ts
    koda.ts
```

## MVP Screens

Approved screens only:

1. Auth
   - Email auth
   - Google auth
2. Onboarding
   - AI conversation
   - life-area / attribute selection
   - Future Self creation
3. Dashboard
   - character card
   - streak / XP / quests today / active goals
   - today's quests
   - top goal
   - strongest attribute
4. Future Self
5. Quests
6. Goals
7. Progress
8. Reflect
9. Settings

## Business Logic

### Attributes

MVP attributes are fixed:

- Finance
- Health
- Discipline
- Career
- Relationships
- Emotional Stability

User-selected attributes are created during onboarding. They can be edited later, but MVP should preserve the approved names and style.

### XP

Quest XP defaults:

| Difficulty | XP |
|---|---:|
| micro | 30 |
| easy | 50 |
| medium | 80 |
| hard | 120 |
| keystone | 150 |

When a quest is completed:

1. Mark quest as completed.
2. Insert `xp_transactions`.
3. Add XP to `future_self`.
4. Add XP to linked attribute.
5. Update linked goal / goal step if present.
6. Recalculate levels.
7. Update streak.

Future Self level formula:

```txt
required_xp = level * 250
```

Attribute level formula:

```txt
required_xp = level * 150
```

### Streak

MVP streak increases when the user completes at least one quest in their local day.

Later improvement: forgiving streak / streak freeze for ADHD-friendly behavior.

## Database

Schema is defined in:

```txt
supabase/migrations/0001_koda_mvp_schema.sql
```

Tables:

- `profiles`
- `onboarding_sessions`
- `future_self`
- `attributes`
- `goals`
- `goal_steps`
- `quests`
- `xp_transactions`
- `journal_entries`

RLS is enabled for all user data tables.

## API Strategy

For MVP, app data should go through Supabase client directly where possible.

AI generation stays server-side:

```txt
POST /api/onboarding
GET /api/health
```

Future backend routes, if moved away from direct Supabase writes:

- `GET /dashboard`
- `POST /quests/:id/complete`
- `POST /quests`
- `POST /quests/generate`
- `GET /goals`
- `POST /goals`
- `PATCH /goals/:id`
- `DELETE /goals/:id`
- `POST /reflect`

## Edge Cases

- AI unavailable: use `rulesProvider`.
- AI returns invalid JSON: provider throws; next provider or rules fallback handles it.
- Duplicate quest completion: do not award XP twice.
- User abandons onboarding: keep `onboarding_sessions.status = in_progress`.
- User skips onboarding: create demo Future Self only if explicitly supported in UI.
- Goal deletion: archive or delete goal; keep XP history.
- Timezone: daily quest/streak logic must use `profiles.timezone`.
- Offline mode: later; MVP can show network error.

## Implementation Order

1. Auth state and auth screens.
2. Supabase repositories for profiles, future self, attributes, goals, quests.
3. Onboarding persistence using existing first AI/onboarding logic.
4. Future Self creation from onboarding result.
5. Dashboard.
6. Goals CRUD.
7. Quests create/complete and XP transactions.
8. Future Self / attributes / progress views.
9. Reflect.
