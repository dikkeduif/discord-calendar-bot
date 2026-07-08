---
title: "fix: Resolve critical crash and data-integrity issues from code review"
type: fix
status: active
date: 2026-07-08
origin: ce-review whole-codebase review of src/, 2026-07-08 (6 personas, 34 unique findings)
---

# fix: Resolve critical crash and data-integrity issues from code review

## Overview

A six-persona review of the whole `src/` tree found three crash classes reachable from ordinary user actions, a fully broken reminder pipeline, and a session-lifecycle flaw that pollutes the database and can corrupt real event documents. The one-line P0 fixes and verified-safe cleanups were applied immediately in the review's fix pass; this plan covers the remaining **structural** work, ordered so that error containment lands first (it converts every later bug from an outage into a logged failure).

## Problem Frame

The bot runs on Node ≥15 semantics (unhandled promise rejections terminate the process) under pm2 auto-restart. Because no promise chain in the codebase has a rejection handler, every defect anywhere becomes a full process crash that also wipes all in-memory sessions. The review verified (empirically, not just by reading) that: reminders crash on send, reacting to a bot DM crashes the process, option-less events crash on reaction, and unknown country codes crash timezone setup. Separately, session bookkeeping writes junk documents that both clutter user-facing lists and starve the reminder query.

## Requirements Trace

- R1. No single user interaction (message, reaction, DM reply) can terminate the process — failures degrade to a logged error for that interaction.
- R2. Reminders fire reliably: eligible events are always fetched (no starvation), one poison event cannot block others, and a sent reminder is recorded only when actually sent.
- R3. Session lifecycle writes to the database only what should be persisted; cancelled/abandoned sessions leave no `active:true` ghosts and modify sessions never re-persist hydrated documents.
- R4. The persistence layer is importable without side effects so unit tests can exist; the highest-value pure-logic tests land with the fixes they protect.
- R5. `npm run build` stays green after every unit; behavior changes are covered by the new tests where feasible.

## Scope Boundaries

- **Already fixed in the review's safe_auto pass (not in this plan):** `userIds.join` P0, `Logger.alert`→`error`, `options` undefined guard, `zonesForCountry` null guard, dead-code/console.log cleanup, nanoid typing, mocha glob quoting.
- **Deferred (unchanged from the upgrade plan):** discord.js 14, mongoose 7+/typegoose 11+, TypeScript 5+/eslint, strict-mode migration.
- **Deferred (advisory from this review):** `allowedMentions` hardening for user-controlled titles (do together with a title-sanitization pass), unique index on `shortId`, N+1 member-fetch optimization in embed rebuilds (revisit if reaction latency is felt in practice), `src/Entities/` directory rename.

## Key Technical Decisions

- **Containment before correctness**: Unit 1 adds `.catch`/listeners/net so that every subsequent unit's edge cases fail one interaction, not the process. This inverts the current amplifier.
- **Fail one event, not the batch**: the reminder loop gets per-event isolation and marks permanently-failing events (deleted channel) so they stop retrying, rather than adding generic retry machinery.
- **Persist by intent, not by default**: `finishSession` only writes CREATE sessions that reached `Done`. Exit/timeout/modify sessions just clear in-memory state. This is the smallest rule that satisfies R3 — no schema change needed.
- **Atomic map updates for registrations**: replace whole-document `findByIdAndUpdate` with `$set` on `registrations.<userId>` to close the lost-update race without introducing versioned locking.
- **Lazy DB connect as the testability seam**: exporting a `connect()` called from `app.ts` is the one-line-shaped change that unblocks all model-adjacent testing (typegoose `existingMongoose` wiring stays as-is).

## Open Questions

### Resolved During Planning

- Should quick fixes wait for this plan? — No; verified-safe items were applied in the review fix pass (user-approved).
- Retry policy for failed reminders? — Keep it simple: per-event try/catch + mark-and-skip for permanent failures (Unknown Channel); transient failures naturally retry next tick because `reminderSent` is only set on success.

### Deferred to Implementation

- Exact translation copy for the "session already active" message (`alreadyHaveSession` key exists, unused) — wire it up; adjust wording only if it reads wrong in context.
- Whether legacy DB documents contain junk from the old `finishSession` behavior worth a one-off cleanup script — inspect production data during rollout; a cleanup is additive and can ship separately.
- Whether `getForReminders` should also bound `eventDate` by the maximum reminder window — decide once the reminder filter is in place and real data is visible.

## Implementation Units

- [ ] **Unit 1: Error containment layer**

**Goal:** No unhandled rejection can terminate the process; startup failures are explicit.

**Requirements:** R1

**Dependencies:** None — land first.

**Files:**
- Modify: `src/app.ts`, `src/Entities/Mongoose.ts`, `src/settings.ts`

**Approach:**
- `.catch(err => Logger.error(...))` on the three event-listener chains and `client.login` in `app.ts`; add `client.on('error', ...)` so websocket errors don't throw from the EventEmitter.
- `process.on('unhandledRejection')` / `process.on('uncaughtException')` logging net (log and continue for rejections; log and exit(1) for uncaught exceptions — pm2 restarts).
- `mongoose.connect(...).catch(...)` + `mongoose.connection.on('error'/'disconnected')` logging; ensure the connect error path does not print the credentialed URI.
- Fail-fast env validation at boot: missing `DISCORD_TOKEN`/`MONGODB_CONNECTION_STRING` → one clear log line + exit(1).

**Test scenarios:** boot without env vars (clean one-line failure); boot without Mongo up (logged, no crash loop from the connect promise); a handler that throws (interaction fails, process survives).

**Verification:** boot smoke with dummy token shows containment behavior; `npm run build` green.

- [ ] **Unit 2: Reaction handler hardening**

**Goal:** Reactions on DMs, non-event messages, option-less events, deleted users, and concurrent reactions all degrade gracefully; registrations stop losing updates.

**Requirements:** R1, R2 (embed/DB consistency)

**Dependencies:** Unit 1 (containment makes remaining edge cases non-fatal while iterating).

**Files:**
- Modify: `src/Calendar/Handlers/ReactionHandler.ts`, `src/Calendar/Handlers/CalendarCommands.ts`

**Approach:**
- Gate the event-recreate branch on `guild !== null && embeds.length > 0` (fixes the reacting-to-a-bot-DM P0); move `setOption` behind the `emojiName !== false` check while there.
- In `CalendarCommands.reactionAdded/reactionRemoved`, `return` after a failed partial fetch instead of running handlers on an unfetched partial.
- Fix the inverted `if (guild === null) { guild.fetch() }` guard (return/skip instead).
- Wrap the per-registrant `users.fetch` in try/catch (skip or render raw id for deleted accounts).
- Replace whole-document write with atomic `$set`/`$unset` on `registrations.<userId>`; re-read before rebuilding the embed.

**Test scenarios:** react to a bot DM (no crash, no ghost event); react to an option-less event; two rapid reactions from different users both persist; registrant with deleted account doesn't freeze the embed.

**Verification:** manual Discord session covering the above; build green.

- [ ] **Unit 3: Reminder pipeline correctness**

**Goal:** Reminders actually fire, starvation is impossible, poison events self-quarantine, and rescheduling re-arms reminders.

**Requirements:** R2

**Dependencies:** Unit 1.

**Files:**
- Modify: `src/Calendar/Models/Event.ts`, `src/Calendar/Handlers/CalendarReminders.ts`, `src/Calendar/Handlers/ModifyHandler.ts`
- Test: `src/Calendar/Handlers/CalendarRemindersFormat.test.ts` (pure formatter — see Unit 5 seam)

**Approach:**
- `getForReminders`: add `reminder: { $gt: 0 }` filter, `.sort({ eventDate: 1 })`, add the missing `await`, drop the dead null-branch; add a compound `@index({ active: 1, reminderSent: 1, eventDate: 1 })` (typegoose class-level decorator).
- Loop: per-event try/catch so one failure skips to the next; replace fixed-rate `setInterval` with a self-rescheduling `setTimeout` loop (no overlap); `await channel.send(...)` and set `reminderSent` only on success; on Unknown Channel, mark the event (e.g. `active:false`) so it stops retrying.
- `ModifyHandler`: reset `reminderSent` when `time` or `reminder` is modified.
- Extract the reminder message formatting into a pure function and pin it with a test (this is the code whose bug shipped broken for years).

**Test scenarios:** formatter renders mentions/title/time exactly; >10 no-reminder events + 1 reminder event → reminder still fetched; deleted channel event doesn't block others and stops retrying; rescheduled event reminds again.

**Verification:** unit test for the formatter; manual reminder fire against local Mongo; build green.

- [ ] **Unit 4: Session lifecycle integrity**

**Goal:** Only completed CREATE sessions persist; sessions can't be double-created into null; sessions close deterministically.

**Requirements:** R3, R1

**Dependencies:** Unit 1. (Unit 3's starvation fix independently stops junk events from blocking reminders, but this unit stops creating junk.)

**Files:**
- Modify: `src/Calendar/Classes/SessionManager.ts`, `src/Calendar/Handlers/CalendarCommands.ts`
- Test: `src/Calendar/Classes/SessionManager.test.ts` (after Unit 5's import seam)

**Approach:**
- `finishSession`: persist only `sessionType === CREATE && status === Done`; always delete the map entry; never call `create()` on a hydrated document (fixes both ghost events and the modify-session `$save` corruption).
- Dispatch only to the handler matching `event.sessionType` instead of looping all handlers (fixes the dropped Exit status and registration-order dependence).
- Guard `sessionManager.create()` returning null (double-send race): reply with the existing `alreadyHaveSession` translation instead of passing null into handlers.
- Session timeout callback: wrap I/O in try/catch; delete `userTimeOuts` entries on fire/clear.

**Test scenarios:** `!exit` mid-creation persists nothing; bare `!modify` persists nothing and closes the session; timeout persists nothing and cleans the maps; double-sent `!event` gets the already-have-session reply; completed creation still persists exactly one event.

**Verification:** SessionManager unit tests + manual session walk-through; build green.

- [ ] **Unit 5: Testability seam and first test suite**

**Goal:** Models and session code are importable without a live DB; the highest-value pure tests exist and run in CI-shape (`npm test`).

**Requirements:** R4, R5

**Dependencies:** None technically, but land before/with Units 3-4 test files.

**Files:**
- Modify: `src/Entities/Mongoose.ts` (export `connect()`, drop import-time side effect), `src/app.ts` (call it before login)
- Create: `src/Calendar/Validation/DateValidation.test.ts`, `src/Dictionaries/Dictionary.test.ts` (plus the test files named in Units 3-4)

**Approach:**
- Lazy connect keeps `existingMongoose` wiring intact; models import the mongoose instance, not a connection.
- Tests use `node:assert/strict` — zero new runtime deps (mocha 11 + ts-node 10 already wired).
- DateValidation tests pin current behavior first (unanchored `25:30` → InvalidDate today), then Unit 6 changes behavior test-first.

**Execution note:** test-first for DateValidation behavior changes; characterization-first for existing formatter/dictionary behavior.

**Verification:** `npm test` runs and passes the new suites from the quoted recursive glob; boot smoke confirms the bot still connects.

- [ ] **Unit 6: Input-handling correctness (UX bugs)**

**Goal:** The remaining verified P2 defects users hit in normal flows are fixed.

**Requirements:** R5

**Dependencies:** Unit 5 (tests exist to pin behavior changes).

**Files:**
- Modify: `src/Calendar/Validation/DateValidation.ts`, `src/Calendar/Validation/EmojiValidation.ts`, `src/Calendar/Handlers/CreateHandler.ts`, `src/Calendar/Classes/Message.ts`, `src/Calendar/Models/Event.ts`
- Test: extend `DateValidation.test.ts`; `src/Calendar/Validation/EmojiValidation.test.ts`

**Approach:**
- Anchor the time regex and use strict moment parsing (`25:30` → InvalidTime, `19:005` → rejected); keep the InvalidDate/InvalidTime distinction honest.
- Parse custom emoji `<a?:name:id>` in `isValidEmoji` via `client.emojis.cache.get(id)` before the name/unicode fallbacks.
- First-time-user re-prompt: stop dereferencing `message.guild` in the DM path (store guild name on the session at creation).
- Timezone confirmation update: filter by `{ userId, guildId }` to match every other user lookup.
- `getUserEvents`: sort ascending so the soonest events are listed for `!modify`.
- `Message.updateEventMessage`/`delete`: move channel/message fetches inside the try so a deleted message degrades gracefully.

**Test scenarios:** time/date boundary table (valid, `25:30`, `19:005`, past date); custom emoji accepted and round-trips to the stored option key; multi-guild timezone update touches only the current guild's record; `!modify` lists soonest-first.

**Verification:** new unit tests pass; manual create/modify walk-through; build green.

## System-Wide Impact

- **Interaction graph:** Unit 1 changes global failure semantics (crash → logged degradation) — the reminder loop, session timeouts, and all three Discord listeners inherit it. Unit 4's dispatch-by-sessionType changes which handler sees session messages; ModifyHandler and CreateHandler must be re-smoke-tested together.
- **Error propagation:** after Unit 1, errors stop at the listener boundary with a log line; nothing upstream depends on crash-restart behavior except stale-session cleanup, which Unit 4 makes explicit instead of incidental.
- **State lifecycle risks:** Unit 4 changes what gets persisted — verify legacy ghost documents don't break `!modify` lists (they remain until cleaned; the reminder filter in Unit 3 already excludes them).
- **API surface parity:** none (no external API).
- **Integration coverage:** the manual smoke checklist per unit is the integration layer until Unit 5's seam allows mongodb-memory-server-backed statics tests (follow-up).

## Risks & Dependencies

- Changing `setInterval` to a self-rescheduling loop alters timing under sustained load — acceptable; reminders have 60s granularity.
- `finishSession` behavior change could surprise a workflow that relied on Exit-persistence — review found no such consumer; the change is the review's explicit recommendation.
- The compound index deploys on boot via typegoose `ensureIndexes` semantics against existing data — index build is cheap at this collection size but verify on first deploy.
- All fixes remain constrained by discord.js v12 idioms (string channel types, `embeds` mutation) — do not modernize call patterns here; that's the deferred v14 migration's job.

## Sources & References

- Origin: ce-review run 2026-07-08 (6 personas; findings runtime-verified for the join crash, winston levels, mongoose Map hydration, `zonesForCountry` nulls).
- Related: `docs/plans/2026-07-08-001-refactor-npm-dependency-upgrade-plan.md` (deferred-migrations list this plan inherits).
- Key code: `src/app.ts`, `src/Calendar/Handlers/{CalendarReminders,ReactionHandler,CalendarCommands,CreateHandler,ModifyHandler}.ts`, `src/Calendar/Classes/SessionManager.ts`, `src/Calendar/Models/Event.ts`, `src/Entities/Mongoose.ts`
