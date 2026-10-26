# Chat offline verification

Scope: dedicated QA accounts only, local application previews against the existing hosted Supabase. No schema changes, no publication.

## Fixes

- Preserve the original pending user message ID when retrying after other-device messages arrive.
- Do not show a stale AI error after a canonical cloud reply has already completed the pending request.
- Upload durable local IDs before a bounded cloud merge can evict them. Recheck additions made during an asynchronous sync.
- Track save revisions and durable snapshots so cloud upload cannot precede successful local persistence.
- Handle offline/online events and preserve the pending user turn when the visible history reaches 200 messages.
- Device sign-out works when logout or expired-token refresh cannot reach Supabase. Only auth storage is removed; chat storage is retained. SDK SIGNED_OUT is emitted through its public signOut API. Remote token revocation is not claimed when offline.
- A new account cannot authenticate offline. The login screen explains the connection requirement instead of misreporting a wrong password.

## Automated checks

`npm run test:chat-offline` passed: real Supabase SDK session/storage tests (fresh and expired tokens, SIGNED_OUT, no suppressed network failures), plus actual chat hook orchestration with deterministic hooks scheduling and local/network adapters. The hook harness is not a browser or React renderer test.

Data role also passed chat history, cloud state, and transport regression tests. Root typecheck passed for the application changes. Browser verification and final QA results are recorded below.

Independent read-only QA found no regressions in the reviewed offline/chat/auth changes. It noted that offline registration (outside the requested login/switch path) still attempts its normal network request; no registration behavior was changed here.

## Browser results: loss of API access and account isolation

Verified emitted build proxy URL count 1 and direct Supabase URL count 0 after clearing Metro cache.

- Signed QA account A into independent origins 8096/8097. Disabled API access through the proxy.
- Sent unique synthetic marker ОФЛАЙН-ПРОКСИ-21 from 8096. AI failed, but the local-save status remained. Reloaded while API access was still blocked: the user message and manual-retry marker restored. It was absent in 8097, proving it had not reached that session.
- Used Profile → Sign out while API access was blocked: login screen appeared. Attempted login as B: explicit connection-required message, no A transcript. Reload remained signed out.
- Restored proxy access. First login attempt after reconnect timed out; manual retry succeeded. Opened B's chat: only B history; no queued A marker or earlier A marker.
- Signed out of B and back into A. The queued A marker restored locally. Opening chat synced it automatically; 8097 received exactly one occurrence. The cloud status on the sender reached synced. The message was not uploaded into B.
- AI requests remain manual after failure/reload: reconnect uploads stored chat messages, but does not automatically repeat the paid AI request. Explicit retry reuses the original user ID.

Evidence: offline-local-restored.png and offline-account-switch.png in the task koda-chat-history visualization directory.

## Browser results: lost acknowledgement and final convergence

- Enabled dropChatWriteAck and sent unique synthetic marker ACK-ПОТЕРЯ-21. Proxy log explicitly confirmed: "Fault injected: committed chat write response dropped". This was a real hosted insert whose response was discarded.
- Automatic retry/pull converged. The receiving session displayed both ОФЛАЙН-ПРОКСИ-21 and ACK-ПОТЕРЯ-21 exactly once. Reloaded that session and reopened chat: both counts remained 1, status reached synced.
- `scripts/verify-chat-offline-live.ts` passed against direct hosted Supabase using real JWTs: both markers have exactly one user row in A and zero in B. This guards against UI-only deduplication hiding duplicate database rows.
- The initial manual AI retry returned a Yandex-unavailable error and retained the pending user message. A later test request received a real Yandex answer, which reached the second session and persisted. No automatic AI retry was added.

Evidence: offline-reconnected-no-duplicates.png. Normal test suite now includes test:chat-offline; live hosted verification remains explicit opt-in. Test fixtures are retained for review. Proxy control is restored to online; no application publication occurred.

Limits: visible history remains bounded at 200 messages; there is one pending AI request, not an automatic queue of separate AI responses for every offline turn. Cached shell reload was tested while remote APIs were disconnected, not a physical device with all networking disabled. Desktop independent origins represent separate local stores; physical mobile devices were not used.

## Capacity edge case found during final audit

A final review confirmed that accepting more than 200 offline messages could evict an older unsynchronized message from the local snapshot (there is no separate outbox). Fixed with capacity backpressure: refuse new sends before they would evict an unconfirmed message, retain drafts on refusal, and resume after cloud confirmation. A bounded syncedMessageIds field remembers cloud confirmations per owner across reload; it is populated only after owner-checked pull or successful push. Two slots are reserved for a new user turn and its possible reply; a retry reserves one. Synced history can still rotate normally.

Hook tests passed 205 offline send attempts: 199 accepted messages remained intact, subsequent sends returned false, and room remained for one reply. Also passed lost-ACK/no-false-confirmation, unblocking after confirmation, metadata validation/round-trip, and continued use of full already-synced history offline after reload. Independent QA found no defects in the guard/owner/persistence review. This boundary test uses the deterministic hook harness, not 205 manual browser sends.

Final emitted bundle: index-5a0b57beb400d5025526b1697ab22004.js. Repeated the ordinary browser outage scenario after this fix with marker ФИНАЛ-ОФЛАЙН-21: local message and retry restored on reload while API access was blocked, then automatic sync delivered it to the other origin exactly once. Reloaded that receiving origin on the final build: all three unique test marker counts remained 1; status reached synced. Application/source typecheck and final export passed.

Final direct hosted verifier also passed with all three markers: exactly one row each in A, none in B. Screenshot of the final build: offline-final-synced.png. Final scoped git diff --check passed (only existing CRLF normalization warnings).

## Browser network fault method

`scripts/serve-chat-network-audit.cjs` requires explicit opt-in and listens only on loopback 8096/8097. A local build points its Supabase endpoint at this proxy; requests forward to the configured hosted project. The proxy can destroy API connections (including in-flight requests), and can drop a response after a chat insert has committed. A local control file drives faults; no controls or test code are added to product UI.

This simulates loss of access to Supabase and AI, while the local application shell stays available for reload. It does not disable the computer's network or force navigator.onLine=false. The latter event path is covered by the hook test. Only synthetic QA credentials/messages are used.

Build with EXPO_PUBLIC_KODA_UI_AUDIT=0, EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:8096, EXPO_PUBLIC_KODA_API_URL='' and `expo export --platform web --clear --output-dir .tmp/koda-chat-network-audit`. The --clear option is necessary when changing inlined public environment values: the first cached export retained the direct Supabase URL and was rejected as network-fault evidence. Validate the emitted artifact contains the proxy URL before running tests.

Control file: .tmp/chat-network-control.json. Set {"offline":true} to drop requests, {"offline":false} to restore access, or {"offline":false,"dropChatWriteAck":true} to lose the next successful chat insert response after its upstream commit. The last fault resets itself once consumed. Never publish this proxy or this test build.
