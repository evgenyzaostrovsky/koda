# Chat history persistence and Supabase sync

Status: migration applied by the user; hosted API verification passed on two dedicated test accounts. No publication.

## Behavior

- Local history is scoped by authenticated user ID; guest history has a separate namespace and is never imported into an account automatically.
- Last 200 messages are restored. A user message and pending request are saved before requesting AI. Reload never automatically repeats a paid request.
- Authenticated clients sync when opening chat, returning online/focus, after durable changes, and every 15 seconds while chat is active.
- Messages use stable IDs. Cloud inserts ignore conflicts on (user_id, message_id); canonical remote rows win. Replies use reply-{userMessageId}, allowing devices to converge without duplicate reply rows.
- Every request checks the session owner before and after transport. RLS additionally restricts select/insert to auth.uid(). No update/delete privileges are granted.
- Cloud errors retain local history and offer a separate sync retry. Pending AI requests stay local; another device's canonical reply resolves the matching pending request.

## Verification (2026-10-21)

Passed: npm run typecheck; npm run test:chat-history; npm run test:chat-sync; git diff --check; web export.

Transport tests cover two simulated offline devices, duplicate retries, account isolation, changed sessions, foreign rows, failures and history bounds. State tests cover canonical reply convergence and local additions during sync. Actual migration SQL was executed in an isolated PGlite PostgreSQL engine with fixture auth identities: own access succeeds, foreign access/forged writes fail, anonymous access and update/delete fail. These are not hosted JWT/PostgREST tests.

Actual browser, isolated guest preview http://127.0.0.1:8093/: sent a synthetic lighthouse conversation to Yandex, refreshed, and confirmed all messages/provider restored. A follow-up correctly recalled the lighthouse Север. Stopped the isolated API, sent a request, refreshed, confirmed the user message and explicit retry survived without automatic resubmission. Restarted API, retried, refreshed again: exactly one user message and one reply remained; pending warning cleared.

Evidence: koda-chat-history/restored-chat.png in the task visualization directory.

## Hosted activation history

Before activation, the read-only schema probe returned HTTP 404 / PGRST205. Dashboard sessions repeatedly expired, so the coordinator could not apply SQL through the browser. The user subsequently applied migration 0016 successfully in SQL Editor.

Schema application and testing of two synthetic accounts were explicitly authorized. No Supabase administrative credential was copied into the local application.

## Hosted API verification after user-applied migration

The user applied the migration successfully. A new schema probe returned 42501 (anonymous access denied), replacing the earlier missing-table response.

Executed scripts/test-chat-sync-live.ts with explicit live/create opt-in. Two new dedicated QA accounts were created through the existing KODA registration endpoint; four separate Supabase clients authenticated with real JWTs. All checks passed:

- Same message ID can hold different content for different owners. Repeated and parallel inserts return one canonical row per owner/ID.
- Independently queued additions from two sessions converge after upload/pull/merge. This simulates offline queues; it does not simulate a physical disconnected device.
- Competing reply inserts converge to one canonical reply on both clients.
- Each account sees an empty result for the other's owner filter. Forged inserts are rejected with 42501 in both directions; anonymous reads and authenticated updates are rejected too.
- Switching an existing client to account B rejects stale pull(A), returns B's history, and preserves separately keyed local snapshots.

Synthetic accounts and messages are retained for review. Credentials are stored only in git-ignored .env.chat-sync.local, never printed. This opt-in script is not included in the normal test command and must not be run against ordinary user accounts.

Independent read-only QA found no code defects in scope and explicitly distinguished API evidence from React/UI evidence. npm run typecheck and final web export passed.

## Actual browser verification

Built the normal application with Supabase enabled (UI audit mode off), served only on loopback ports 8094 and 8095. These two origins have independent local storage and auth sessions; both were initially signed into QA account A.

- Both sessions loaded the cloud transcript and reached the chat status "синхронизировано".
- Sent the synthetic lighthouse Аврора message from 8094; its user message and real Yandex answer appeared in 8095.
- Sent a second message from 8095; its user message and answer appeared in 8094 and survived reload. Both unique UI marker counts were exactly 1.
- In 8095, used Profile → sign out → sign in as B. The A transcript disappeared. B's synthetic garden Липа message and Yandex answer survived reload, with B marker count 1, both A markers absent, synced status present.
- At the same time, 8094 retained both A messages exactly once, had no B marker, and showed synced status.
- Switched 8095 back B → A: both A messages restored exactly once and B marker was absent.
- Found an unlabeled icon-only sign-out action during these checks. Added accessibilityRole=button and accessibilityLabel="Выйти из аккаунта" to desktop and mobile ProfileScreen actions. Rebuilt; the final browser accessibility tree exposes the named button, and clicking it successfully signs out. Final typecheck passed.

Evidence: cloud-account-a.png and cloud-account-b.png in the task's koda-chat-history visualization directory. Repeated script runs deliberately use distinct run IDs, so identical synthetic test phrases from separate runs are separate messages rather than duplicate rows.

Limits: these are two independent desktop browser origins against the real hosted Supabase, not two physical devices. Real disconnected-device transport and mobile layout were not exercised in this task. No application publication was performed.
