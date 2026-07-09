---
title: "feat: Interaction-native commands (slash + modal creation, button registration)"
type: feat
status: active
date: 2026-07-09
origin: docs/brainstorms/2026-07-09-interaction-native-commands-requirements.md
---

# feat: Interaction-native commands (slash + modal creation, button registration)

## Overview

Replace the bot's prefix-command surface with Discord interactions: `/event create` (modal), button-based registration, `/event modify`, `/event delete`, `/timezone`, `/help` — shipped as **one release** (user decision, see origin), followed by a ~1-month deprecation window with a nudge on prefix commands, then a separate gated **retirement release** that removes the prefix handlers, DM session machinery, and the MessageContent intent. The domain layer (Event/User models, DateValidation, EmojiValidation, reminders, native scheduled-event mirror) is reused unchanged wherever possible.

## Problem Frame

Event creation is a ~10-step DM interview that silently fails for users who block server DMs, loses sessions on restart, and demands strict formats over many round-trips. Registration rides on reactions (Manage Messages + partials + pre-reacting). The prefix surface is the sole reason the bot needs the privileged MessageContent intent. Full framing in the origin document (see origin: docs/brainstorms/2026-07-09-interaction-native-commands-requirements.md).

## Requirements Trace

From the origin document (R1–R10 there):

- R1. `/event create` → 5-field modal (title, description, date, time, options; blank options = defaults), posts embed in the invoking channel, ephemeral errors, no DMs. → Unit 5
- R2. New event messages use registration buttons (one per option + standard decline); click registers/replaces choice and re-renders embed columns; decliners excluded from reminder pings. → Units 2, 4
- R3. Default set = ✅ Yes / ❔ Maybe + standard decline (❎ retained as the standard decline emoji, so the default set stays visually identical to today). → Unit 1
- R4. `/event modify`: autocomplete picker → pre-filled modal (title/description/date/time/reminder); propagates to embed + native event; options not editable. → Unit 6
- R5. `/event delete`: picker → ephemeral confirm button → delete message + native event, deactivate. → Unit 6
- R6. `/timezone set` with zone autocomplete, per user per guild; unset → bot-wide default with ephemeral notice; creation never blocked. → Unit 7
- R7. `/help` ephemeral. → Unit 7
- R8. One release; prefix works through the window with a nudge; retirement release removes prefix + MessageContent. → Units 7, 8
- R9. Reaction-era events age out untouched; ReactionHandler ignores button-era events. → Units 1, 2, 8
- R10. Slash events flow through the existing domain layer; no data migration. → all units

## Scope Boundaries

Carried from origin: parity surface migration only — no recurring events, no per-role options, no post-hoc option editing, no new event fields; no backfill of old messages to buttons; command names/descriptions English-only (dictionary keeps localizing message content); growth/verification beyond 100 guilds out of scope. Additions from planning:

- `/event create` supports plain guild text channels only (`ChannelType.GuildText`) — threads/announcement/forum channels are rejected ephemerally, matching the reminder loop's existing GuildText-only check.
- No `messageDelete` listener this release (manually-deleted event messages remain a pre-existing gap; `/event modify`/`delete` handle it reactively).
- No per-guild default timezone storage — R6's "server default" is the existing bot-wide `defaultTimeZone` setting.
- 2025 modal component upgrades (selects-in-modals date pickers) not used — free-text date/time keeps DateValidation parity.

## Context & Research

### Relevant Code and Patterns

- `src/Calendar/Handlers/ReactionHandler.ts` — registration write pattern to preserve: atomic `$set` with `new: true`, per-registrant fetch guards, nickname resolution; the embed column rebuild to **extract and share**.
- `src/Calendar/Classes/Message.ts` — event message lifecycle (post/update/delete) + native-event mirror hooks; slash flows reuse it.
- `src/Calendar/Classes/ScheduledEvent.ts`, `src/Calendar/Handlers/CalendarReminders.ts` — untouched consumers; reminders format with `event.eventTimeZone` (drives Unit 7's dual-field write).
- `src/Calendar/Validation/DateValidation.ts` (`validate(dateStr + ' ' + time, tz)`, `isValidTimeZone`), `src/Calendar/Validation/EmojiValidation.ts` (custom `<a?:name:id>` regex, node-emoji fallback) — reused as-is.
- `src/Calendar/Models/Event.ts` statics (`getByMessageId`, `getByShortId`, `getUserEvents`) and `User.ts` (`getUserByUserAndGuildId`) — extended, not replaced.
- `src/app.ts` — containment pattern (every listener's promise caught + logged) to mirror for `interactionCreate`.
- Test convention: mocha specs colocated as `src/**/*test.ts`, pure-logic only (e.g. `CalendarRemindersFormat.test.ts`, `ScheduledEvent.test.ts`).

### Institutional Learnings

- None on file (`docs/solutions/` does not exist). Session context: 2026-07-08 hardening guards (containment, atomic writes, per-event isolation) must survive; the v14 migration (PR #4) and native-event mirror (PR #5) are prerequisites.

### External References (verified against installed discord.js 14.26.4, 2026-07-09)

- **Modals**: max 5 components; title ≤ 45 chars; TextInput value/min/max ≤ 4000 (both styles); `setValue()` pre-fills. **14.26.4 delta**: build with `LabelBuilder` via `ModalBuilder.addLabelComponents` — the ActionRow/`setLabel` pattern in older guides is deprecated. `showModal` must be the *first* response (throws after defer); modal-submit cannot open another modal; buttons **can** (`MessageComponentInteraction.showModal`) — enables the retry flow. Ack modal submits immediately (unacked submits leave the modal open and invite double-submission). (docs.discord.com components reference; discordjs.guide/legacy; installed typings/source)
- **Buttons**: customId 1–100 chars; label ≤ 80; 5 rows × 5 = 25 per message; emoji (custom by id) + label coexist; omitting `components` on edit preserves them. `interaction.update()`/`deferUpdate()` use the interaction-callback route — webhook rate-limit buckets, not the bot-global limit; preferable to `message.edit()`. Tokens: 3s initial ack, 15min follow-up validity.
- **Ephemeral in 14.26.4**: `ephemeral: true` and `fetchReply: true` are runtime-deprecated → `flags: MessageFlags.Ephemeral`, `withResponse: true`.
- **Guild-only**: `setContexts(InteractionContextType.Guild)`; `setDMPermission` deprecated.
- **Autocomplete**: ≤ 25 choices, name/value ≤ 100 chars, 3s hard window, no defer, second `respond()` throws; submitted values are **untrusted** (users can type free text past autocomplete).
- **Registration**: bulk `PUT` (`application.commands.set`) replaces the full set; global propagation is near-instant now (the "1 hour" figure is obsolete); **200 command creates/day/guild** — don't blind-PUT on every ready (crash-loop hazard); fetch-compare-set instead.
- **Intents**: interactions require no gateway intents at all; keep `Guilds` for channel/guild caches. MessageContent never gated the bot's own messages' components.
- **Rollout catch**: slash commands only appear in guilds that authorized the **`applications.commands` OAuth scope** — this bot's historical invite is `scope=bot` only, so existing guilds must re-authorize via an updated link (admin action; no kick required). (Raidbots migration playbook; Discord OAuth docs)
- **10062 Unknown interaction**: ack-first, swallow 10062 on the ack itself, branch on `replied || deferred` in error handlers; a rare residual class of random 10062s is environmental noise (upstream issues closed unresolved).

## Key Technical Decisions

- **`registrationSurface` discriminator on Event** (`'buttons'`; absent/`'reactions'` = legacy): ReactionHandler early-returns for buttons events (a manual reaction on one would otherwise run the full legacy path — apology DMs and all); gives the retirement release its gate query ("no active reaction-surface events with future dates"); scopes ReactionHandler removal. The resurrection branch is additionally guarded with `message.components.length > 0`.
- **Standard decline = ❎** with a dictionary label: every slash-created event gets it appended (`declineOption` set); the default set therefore renders identically to today (✅ ❎ ❔). Custom options colliding with ❎ are rejected at parse. Prefix-created events during the window keep their interview-chosen decline; no second decline button is added when `declineOption` already exists.
- **All new events get buttons, from both surfaces**: `Message.postNewMessageAndUpdate` builds button rows instead of pre-reacting. `OptionsType.none` events (prefix interview allows zero options) get no components — parity with their reactionless state today. This starts the reaction sunset at release rather than growing the legacy population through the window.
- **Button customIds encode option *index***, not the emoji key (`ev:reg:<shortId>:<idx>`, decline `ev:reg:<shortId>:d`; delete confirm `ev:del:<shortId>`): custom-emoji keys contain `:` and can approach the 100-char limit. Safe because options are immutable post-creation (R4). The Map-order stability assumption (string keys, Mongo round-trip) gets an explicit implementation-time verification test.
- **Registration click flow**: `deferUpdate` → lookup by `interaction.message.id` (existing static) → guards (missing/inactive/past ⇒ ephemeral "registration closed" + best-effort component disable) → existing atomic `$set` write → shared renderer → `editReply`. Concurrent-click render staleness is accepted (self-healing on next click — same semantics as today's reaction path).
- **One shared registration renderer** extracted from ReactionHandler, used by reactions (legacy), buttons, and initial post (button events render their empty columns at post time — minor visual improvement, consistent thereafter).
- **Modal submit ordering**: `deferReply({flags: Ephemeral})` *before* validation (client re-opens unacked modals); save event doc → post message → patch `messageId`, with compensating deactivate + ephemeral error if the post fails (the legacy flow's ghost-event failure mode is thereby fixed for slash events).
- **Validation-retry stash is in-memory** (keyed by userId, ~15min TTL) with graceful degradation: the ephemeral error echoes the rejected values, so a restart-lost stash costs a copy/paste, not the input. A DB draft collection was rejected as carrying cost disproportionate to a rare failure.
- **Command registration on `clientReady`, fetch-compare-set**: PUT only when definitions differ from the fetched set — ops-free like startup registration, but crash-loops can't burn the 200/day create limit. A separate deploy script was rejected: this repo has no deploy tooling beyond Jenkins image builds.
- **Permission model**: commands registered guild-only (`setContexts`), no `default_member_permissions` restriction (parity: anyone; admins can scope per-guild via Discord's Integrations UI — documented). `/event create` additionally requires the *invoker* to have SendMessages in the channel (parity with typing `!event`) and the *bot* to have ViewChannel+SendMessages+EmbedLinks — checked cache-only *before* `showModal` (must be first response), re-handled at submit time via the normal error path.
- **`/timezone set` writes both `userTimeZone` and `eventTimeZone`** (new records: eventTimeZone = bot default; updates preserve existing eventTimeZone): reminders format with `eventTimeZone`, and a single-field write would leave it `undefined` → broken reminder formatting.
- **`/event modify` interprets and pre-fills date/time in the creator's *current* timezone record** (fallback: event snapshot, then bot default), stated in the ephemeral response — a deliberate small behavior change from the snapshot-based legacy modify, in exchange for pre-fill/parse consistency.
- **Options-field parse spec** (one documented rule set): one `emoji label` per line; blank field = defaults; skip blank lines; require both emoji and label; label ≤ 80 (button limit); ≤ 24 options (+ decline = 25 buttons and 25 embed fields, both at cap); `:shortcode:` normalized to unicode via node-emoji (bare shortcodes would throw in `setEmoji`); duplicate detection after NFC + variation-selector normalization; reject ❎ collisions; custom emoji resolved through the existing `EmojiValidation` (any cached emoji — parity).
- **`shortId` gains a unique index** with regenerate-on-collision at create: customIds and autocomplete now key on it (nanoid(6) collisions are unlikely but no longer harmless).
- **Autocomplete treats submitted values as untrusted**: resolve via `getByShortId(value, authorId)`; garbage or stale values get a polite ephemeral error; DB errors respond `[]` within the 3s window.

## Open Questions

### Resolved During Planning

- customId encoding for custom emoji (origin, deferred) — **index-based**, see decisions.
- Modal retry pre-fill across clients (origin, deferred) — **supported**: `showModal` from a ButtonInteraction with `TextInputBuilder.setValue`; modal-submit→modal is impossible, button-retry is the established pattern.
- Autocomplete caps and zone filtering (origin, deferred) — 25 choices / 3s / no defer; `/event modify` uses a new guild-scoped query (limit 25 — the existing `getUserEvents` has **no guildId filter** and would leak events across guilds); `/timezone` substring-filters `moment_tz.tz.names()`.
- Command registration strategy (origin, deferred) — global, on-ready, fetch-compare-set (see decisions).
- Rate limits for click-driven edits (origin, deferred) — `interaction.update`/`editReply` ride webhook buckets, not the bot-global limit; strictly better than today's `message.edit`.
- Ephemeral API shape — `flags: MessageFlags.Ephemeral` (the boolean is deprecated in 14.26.4).

### Deferred to Implementation

- Exact LabelBuilder/TextInput composition and per-field copy — cosmetic, knowable only in the modal itself.
- Verification that Mongo Map round-trips preserve option insertion order (unit test with a real serialize/deserialize cycle; if it fails, switch codec to key-hash matching before shipping Unit 4).
- Whether `deferUpdate`+`editReply` is needed on every click or `interaction.update` suffices when member fetches are cached — measure during Unit 4 smoke.
- Stash TTL and nudge copy finalization.
- Whether `getUserEvents`'s guild leak affects the legacy `!modify` list too (if trivially fixable while touching the file, fix; otherwise note — legacy surface is retiring).

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart LR
  subgraph app.ts
    IC[interactionCreate] --> R[InteractionRouter]
  end
  R -->|chat input| CMD[Create / Modify / Delete / Timezone / Help commands]
  R -->|autocomplete| AC[event picker · zone picker]
  R -->|modal submit| MS[Create / Modify submit handlers]
  R -->|button| B[RegistrationButtonHandler · delete-confirm · retry]
  CMD & MS --> DOM[Existing domain layer:\nEvent/User models · DateValidation · EmojiValidation\nMessage (post/update/delete) · ScheduledEvent mirror]
  B --> REN[Shared RegistrationRenderer]
  LEGACY[messageCreate → CalendarCommands\n(prefix + nudge, until retirement)] --> DOM
  RH[ReactionHandler\n(legacy events only, surface-guarded)] --> REN
```

Interaction rules baked into the router: ack-first (`showModal`/`update`/`deferReply` as *initial* response per type), per-handler try/catch with `replied || deferred` branching, 10062 swallowed on dead tokens.

## Implementation Units

### Phase 1 — the release

- [x] **Unit 1: Event model groundwork**

**Goal:** The Event model can discriminate registration surfaces, serve guild-scoped autocomplete, and guarantee shortId uniqueness.

**Requirements:** R3, R9, R10

**Dependencies:** None (PR #4/#5 merged).

**Files:**
- Modify: `src/Calendar/Models/Event.ts`
- Test: `src/Calendar/Models/Event.test.ts` (new)

**Approach:**
- Add optional `registrationSurface` prop (`'buttons'`; absent = legacy reactions) and set-at-creation semantics.
- New static: guild-scoped upcoming-events query for autocomplete (`authorId + guildId + active + future`, limit 25, soonest first).
- `shortId` gets `unique: true` index; document regenerate-on-duplicate handling for the create path (Unit 5).
- Default-set helpers per R3: standard decline stays ❎ with a dictionary-sourced label; net default set unchanged visually.

**Patterns to follow:** existing typegoose statics in the same file.

**Test scenarios:** default options/decline helpers produce the expected Map contents and decline key; surface field defaults to undefined on legacy-shaped docs.

**Verification:** build + existing tests green; new model tests pass; no behavior change for legacy code paths.

- [x] **Unit 2: Shared registration renderer + reaction-path guards**

**Goal:** One renderer builds registration columns for both surfaces; ReactionHandler ignores button-era events.

**Requirements:** R2, R9

**Dependencies:** Unit 1.

**Files:**
- Create: `src/Calendar/Classes/RegistrationRenderer.ts`
- Modify: `src/Calendar/Handlers/ReactionHandler.ts`
- Test: `src/Calendar/Classes/RegistrationRenderer.test.ts` (new)

**Approach:**
- Extract the column/field building from ReactionHandler (options → columns, registrations → per-column nickname lists, `-` placeholders, inline fields) into a pure field-builder plus a thin nickname-resolution helper that keeps the existing cache→fetch→skip-unresolvable guards.
- ReactionHandler: early-return when the event's surface is buttons; resurrection branch additionally skips messages with components.

**Execution note:** characterization-first — capture the current field-building behavior in tests before extracting.

**Test scenarios:** empty column renders `-`; populated column renders `>>> `-joined nicknames; field order follows options order; button-surface event short-circuits the reaction path (pure guard logic).

**Verification:** existing reaction behavior byte-identical on legacy events (characterization tests prove it); build green.

- [x] **Unit 3: Interaction router, command registry, containment**

**Goal:** The process handles `interactionCreate` end to end: routing by type, per-handler containment, and self-registering command definitions.

**Requirements:** R1, R8 (foundation for all commands)

**Dependencies:** Unit 1.

**Files:**
- Create: `src/Calendar/Interactions/InteractionRouter.ts`, `src/Calendar/Interactions/CommandDefinitions.ts`
- Modify: `src/app.ts`, `src/Calendar/Calendar.ts`
- Test: `src/Calendar/Interactions/InteractionRouter.test.ts` (new, pure dispatch/guard logic only)

**Approach:**
- Definitions: `event` (subcommands `create`/`modify`/`delete`), `timezone`, `help`; all `setContexts(InteractionContextType.Guild)`.
- On `clientReady`: fetch existing global commands, deep-compare against definitions, `commands.set` only on drift (200-creates/day crash-loop guard).
- Router: switch on interaction type (chat input / autocomplete / modal submit / button by customId namespace); every handler in try/catch; error path branches on `replied || deferred` (followUp vs reply, ephemeral flags), swallows 10062; autocomplete errors respond `[]`.
- Wire through Calendar the way `processMessage` is wired — app.ts stays a thin containment shell.

**Patterns to follow:** `src/app.ts` listener containment; `CalendarCommands` constructor wiring.

**Test scenarios:** customId namespace parsing routes to the right handler name; unknown namespaces are ignored quietly (pure logic tests — live dispatch is Unit 8's smoke).

**Verification:** bot boots, registers commands in a dev guild, `/help` (stubbed if needed) round-trips; re-boot with unchanged definitions performs no PUT (log line proves the compare short-circuited).

- [x] **Unit 4: Button registration path**

**Goal:** New events carry registration buttons end to end: posting, clicking, re-rendering, guarding.

**Requirements:** R2, R3, R9

**Dependencies:** Units 1–3.

**Files:**
- Create: `src/Calendar/Interactions/RegistrationButtonHandler.ts` (includes the customId codec)
- Modify: `src/Calendar/Classes/Message.ts`, `src/Dictionaries/CalendarTranslations.ts`
- Test: `src/Calendar/Interactions/RegistrationButtonHandler.test.ts` (new)

**Approach:**
- `Message.postNewMessageAndUpdate`: for buttons-surface events, build rows from options (≤5/row; emoji + ≤80-char label; decline last, Secondary/Danger style), skip pre-reacting, render initial empty columns via the shared renderer. `OptionsType.none` → no components. Legacy reaction posting stays for nothing — all new events are buttons (see decisions) — but the reaction *handler* path remains for old messages.
- Codec: `ev:reg:<shortId>:<idx|d>` encode/decode; index → option key via options iteration order (verify Map order stability through a Mongo serialize round-trip in tests; fall back to key-hash if unstable).
- Click flow: `deferUpdate` → `getByMessageId` → guards (no record / inactive / `eventDate < now` ⇒ ephemeral "registration closed" followUp + best-effort disable of the message's components) → atomic `$set` (reuse pattern verbatim) → renderer → `editReply`.

**Execution note:** test-first for the customId codec and guard logic.

**Patterns to follow:** `ReactionHandler` atomic write + `updated.registrations` reuse; `app.ts` containment.

**Test scenarios:** codec round-trips unicode, VS16 emoji, and `<a:name:id>` keys via index; decline suffix; guard matrix (missing/inactive/past → closed); options→rows layout at 1, 5, 6, 24 options (+ decline row-wrapping).

**Verification:** in a dev guild — click registers, switching choice moves the user, columns match legacy rendering, repeated clicks never duplicate fields, click on a deleted-record event says "registration closed", manual reaction on a button event does nothing.

- [x] **Unit 5: `/event create` — modal, options parser, post flow**

**Goal:** Full session-less creation: modal in, validated event out, posted with buttons and the native mirror, all failure paths ephemeral.

**Requirements:** R1, R3, R6 (notice), R10

**Dependencies:** Units 1–4.

**Files:**
- Create: `src/Calendar/Interactions/CreateCommand.ts`, `src/Calendar/Interactions/OptionsFieldParser.ts`
- Modify: `src/Dictionaries/CalendarTranslations.ts`
- Test: `src/Calendar/Interactions/OptionsFieldParser.test.ts` (new)

**Approach:**
- Command handler: cache-only pre-checks *before* `showModal` (GuildText channel; invoker SendMessages; bot ViewChannel+SendMessages+EmbedLinks) — reject ephemerally with the same dictionary copy family as legacy `noPermissions`.
- Modal (LabelBuilder pattern): title (max 200), description (max ~3900 — embed cap minus the appended Time block), date, time, options (paragraph). Modal title ≤ 45 chars.
- Submit: `deferReply({flags: Ephemeral})` first → parse per the options spec (see decisions) → date/time via `DateValidation.validate` in the user's stored zone or bot default (append the R6 notice when defaulted) → build Event (surface buttons, standard decline appended, guildName/authorName from interaction) → save (regenerate shortId on duplicate-key) → post via `Message` → patch messageId → success followUp (id + modify hint, dictionary copy). Post failure ⇒ compensating deactivate + ephemeral error.
- Validation failure ⇒ ephemeral error (echoing submitted values) + Try-again button that re-opens the modal pre-filled from the in-memory stash; stash miss ⇒ blank modal (values remain in the error text).

**Execution note:** test-first for OptionsFieldParser.

**Patterns to follow:** `CreateHandler` permission/dictionary copy; `SessionManager.create` field population; `Message.postNewMessageAndUpdate` as the single posting seam.

**Test scenarios (parser):** blank → defaults with ❎ decline; custom lines happy path; `:shortcode:` normalization; duplicate emoji (incl. VS16 variants) rejected; ❎ collision rejected; > 24 options rejected; missing label rejected; label > 80 rejected; blank lines skipped.

**Verification:** dev-guild smoke — create with defaults, with custom options, with every validation failure (retry restores input), with DMs disabled (everything still works), unset-timezone notice appears, event posts with buttons + native mirror, `!event` legacy flow still works unchanged.

- [x] **Unit 6: `/event modify` + `/event delete`**

**Goal:** Creators manage their events via autocomplete + pre-filled modal / confirm button; message-gone and stale-pick edges handled.

**Requirements:** R4, R5

**Dependencies:** Units 3, 5.

**Files:**
- Create: `src/Calendar/Interactions/ModifyCommand.ts`, `src/Calendar/Interactions/DeleteCommand.ts`
- Modify: `src/Calendar/Classes/Message.ts` (delete restructure), `src/Dictionaries/CalendarTranslations.ts`
- Test: `src/Calendar/Interactions/ModifyCommand.test.ts` (new — pure helpers: choice formatting, reminder-reset rules)

**Approach:**
- Autocomplete: guild-scoped query (Unit 1); choice name `"<title> — <DD-MM HH:mm> (<shortId>)"` ≤ 100 chars, value = shortId; `[]` on DB error; submitted value re-validated via `getByShortId(value, authorId)` — stale/garbage ⇒ ephemeral "event no longer exists".
- Modify modal: pre-filled title/description/date/time (creator's current tz, fallback snapshot → default, zone named in the response) + reminder minutes; submit `deferReply` → validate → single DB update; `reminderSent: null` when date or reminder changed; blank reminder = unchanged, `0` = disable; then `updateEventMessage` (embed + native mirror). UnknownMessage from the fetch ⇒ ephemeral notice suggesting `/event delete` (DB update stands).
- Delete: ephemeral confirm carrying `ev:del:<shortId>` (stateless, restart-safe); idempotent (already-inactive ⇒ "already deleted"). Restructure `Message.delete` so native-event cleanup and deactivation proceed even when the message fetch 404s (today the throw skips the mirror cleanup — orphaned native event).

**Patterns to follow:** `ModifyHandler` update semantics (field-for-field parity); `RESTJSONErrorCodes` comparison style from `CalendarReminders`.

**Test scenarios:** reminder-reset matrix (date changed / reminder changed / neither / blank / zero); choice-name truncation at 100 chars; delete idempotence guard logic.

**Verification:** dev-guild smoke — modify each field, reminder re-arms on date change, embed + Events-tab entry update, delete removes both, confirm after restart works, stale autocomplete pick errors politely, manually-deleted message paths behave as specified.

- [x] **Unit 7: `/timezone`, `/help`, nudge, docs**

**Goal:** The remaining commands land; prefix users see the migration path; admins learn about the re-auth requirement.

**Requirements:** R6, R7, R8

**Dependencies:** Unit 3.

**Files:**
- Create: `src/Calendar/Interactions/TimezoneCommand.ts`, `src/Calendar/Interactions/HelpCommand.ts`
- Modify: `src/Calendar/Handlers/CalendarCommands.ts` (nudge + prefix-usage log line), `src/Dictionaries/CalendarTranslations.ts`, `README.md`
- Test: `src/Calendar/Interactions/TimezoneCommand.test.ts` (new — zone filter helper)

**Approach:**
- `/timezone set`: autocomplete substring-filters `moment_tz.tz.names()` (≤ 25); free-typed input validated with `DateValidation.isValidTimeZone`; writes **both** userTimeZone and eventTimeZone (new record: eventTimeZone = bot default; update preserves it); reply shows previous → new.
- `/help`: ephemeral, dictionary-sourced, slash-era content.
- Nudge: one dictionary line appended to the first bot response of each prefix flow, DM-aware ("run /event in your server"); a `Logger.info` marker on every prefix invocation gives the retirement gate its telemetry (log-grep, no new storage).
- README: invite URL gains the **`applications.commands` scope** (existing guilds must re-authorize via the link — no kick needed); document `default_member_permissions` scoping via Integrations UI; slash command usage replaces prefix docs (prefix section marked deprecated until retirement).

**Test scenarios:** zone filter matches case-insensitive substrings and caps at 25; free-text invalid zone rejected.

**Verification:** `/timezone` round-trip persists both fields (reminder formatting sanity-checked); prefix `!event` shows the nudge; README renders the new invite link.

### Phase 2 — the retirement release (gated, separate effort)

- [ ] **Unit 8: Retire the prefix surface**

**Goal:** The legacy surface and its privileged intent are removed once the window closes.

**Requirements:** R8, R9

**Dependencies:** Units 1–7 deployed; gate conditions met.

**Gate (all three):** window elapsed (~1 month, owner's call); prefix-usage log markers ≈ zero; **no active reaction-surface events with future dates** (queryable thanks to Unit 1's discriminator — reaction events created during the window can be dated months out, so this is a real check, not a formality).

**Files:**
- Delete: `src/Calendar/Handlers/CreateHandler.ts`, `src/Calendar/Handlers/ModifyHandler.ts`, `src/Calendar/Handlers/AbstractHandler.ts`, `src/Calendar/Classes/SessionManager.ts` (+ its test)
- Modify: `src/app.ts` (drop `messageCreate`; intents shrink to `Guilds` [+ `GuildMessageReactions` + partials only while reaction stragglers remain]), `src/Calendar/Calendar.ts`, `src/Calendar/Handlers/CalendarCommands.ts` (reduces to reaction dispatch or dissolves), `README.md`
- Delete when stragglers age out: `src/Calendar/Handlers/ReactionHandler.ts` (`GuildMessageReactions` is unprivileged — it can lag the MessageContent removal at zero cost)

**Approach:** removal only, no behavior changes; post-retirement `!event` is *invisible* to the bot (no MessageContent), so the README states the cutover date and the nudge window is the only user-facing warning — accepted explicitly.

**Verification:** bot logs in without the Portal toggle (fresh app would need no privileged intents); all slash flows green; existing tests (minus deleted suites) pass; Docker image builds.

## System-Wide Impact

- **Interaction graph:** `interactionCreate` joins the existing listeners with the same containment contract as `messageCreate`; `Message.postNewMessageAndUpdate` changes behavior for *all* new events (buttons) — CreateHandler's legacy completion path inherits buttons without code changes there. ReactionHandler's guard is the only legacy-path edit until retirement.
- **Error propagation:** unchanged model (contain at the listener boundary, log, never crash); new rules — ack-first per interaction type, `replied || deferred` branching, 10062 swallowed, autocomplete fails to `[]`.
- **State lifecycle risks:** the save→post→patch ordering closes the legacy ghost-event window for slash creates; compensating deactivate on post failure; retry stash is intentionally lossy (values echoed in the error). `shortId` uniqueness becomes load-bearing (customIds, autocomplete) — hence the index.
- **API surface parity:** every prefix capability has a slash counterpart before retirement; the one intentional asymmetry during the window: prefix events keep interview-chosen declines, slash events get the standard one.
- **Integration coverage:** automated tests stay pure-logic (parsers, codecs, renderers, filters — the seams chosen so the I/O shell is thin); the dev-guild smoke checklists in each unit are the integration gate, matching the repo's established verification model.
- **Affected parties:** guild admins (re-auth for the `applications.commands` scope; optional command scoping), end users (new surface + nudge), ops (Portal toggle stays until retirement; invite link changes now).

## Risks & Dependencies

- **`applications.commands` re-auth is per-guild and admin-gated** — slash commands simply don't appear in guilds that skip it. Mitigation: nudge + README; the prefix surface keeps working through the window, so no guild is bricked.
- **Big-bang release size** (user-chosen): mitigated by unit ordering — each unit is dev-guild-testable behind the unreleased command set before the release ships.
- **Map-order assumption in the index codec**: verified by test in Unit 4 before anything depends on it; fallback designed.
- **Modal API drift**: 14.26.4's LabelBuilder pattern is newer than most guides; pin to the installed typings, not tutorials.
- **Random residual 10062s**: treat as noise (upstream-acknowledged); containment ensures they only cost one interaction.
- **Prerequisites**: PR #4 (v14) and PR #5 (native events) must merge first; this plan's branches stack on them.

## Documentation / Operational Notes

- README: new invite URL (`scope=bot%20applications.commands`, permissions unchanged from PR #5), re-auth note for existing guilds, slash usage docs, deprecation timeline.
- Rollout: deploy → verify command registration log → re-auth the primary guilds → announce the window. Retirement is a second deploy gated on Unit 8's three conditions.
- Monitoring: prefix-usage log markers (gate telemetry); `"registration closed"` frequency (button guard health); command-registration drift log line on boot.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-07-09-interaction-native-commands-requirements.md](../brainstorms/2026-07-09-interaction-native-commands-requirements.md)
- Related plans: `2026-07-08-003` (v14 migration — prerequisite), PRs #4, #5
- Discord docs: docs.discord.com — components reference, interactions/receiving-and-responding, application-commands, events/gateway
- discord.js guide (v14 legacy section): deploying-commands, modals, autocomplete, buttons
- Migration precedent: Raidbots prefix-deprecation playbook (support.raidbots.com/article/31); discord-api-docs discussion #3540 (intent rules)
- API facts compile-verified against installed discord.js 14.26.4 / @discordjs/builders / discord-api-types 0.38 (2026-07-09)
