---
date: 2026-07-09
topic: interaction-native-commands
---

# Interaction-Native Commands (slash + modal creation, button registration)

## Problem Frame

Event creation today is a ~10-step DM interview behind a `!event` prefix command: it silently fails for users who block server DMs, loses all open sessions on restart (in-memory), and demands strict input formats across many round-trips. Registration rides on reactions, which need Manage Messages (to remove reactions), partials handling, and pre-reacting by the bot. The whole prefix surface is why the bot needs the privileged MessageContent intent. Discord's interaction model (slash commands, modals, buttons) removes every one of these constraints and is what users now expect from event bots. The discord.js 14 migration (PR #4) made this buildable.

## Requirements

- R1. `/event create` opens a modal with five fields: title, multi-line description, date, time, and options ("leave blank for the default choices"; one `emoji label` line per custom option). Submitting validates and posts the event embed in the channel where the command was invoked. Validation errors are shown ephemerally (visible only to the creator) with a way to retry; DMs are never used.
- R2. New event messages carry **registration buttons** instead of reactions: one button per option plus a standard decline button on every event. Clicking a button registers the user (replacing any previous choice) and updates the embed's registration columns. Users registered on the decline choice are excluded from reminder pings, as today.
- R3. The default option set becomes ✅ Yes and ❔ Maybe, with the standard decline button serving as the "No" (visually equivalent to today's ✅/❎/❔ where ❎ was the decline).
- R4. `/event modify` lets the creator pick one of their upcoming events (autocomplete on title + short id) and opens the same modal pre-filled — title, description, date, time — plus reminder minutes. Edits propagate to the embed and the native scheduled event through the existing layer. Registration options are not editable after posting (parity with today).
- R5. `/event delete` picks an event the same way and asks for confirmation via an ephemeral button before deleting the message, cancelling the native scheduled event, and deactivating the record (parity with `!modify <id> delete`).
- R6. `/timezone set <zone>` (autocompleted IANA zones) stores the user's timezone per server, replacing the first-time-user interview. When unset, date/time input is interpreted in the server default and the creator is told so ephemerally ("Interpreted as Europe/London — set yours with /timezone"). Creation is never blocked on timezone setup.
- R7. `/help` replies ephemerally with a command overview (replaces the DM-based `!help`).
- R8. Everything in R1–R7 ships as **one release**. Prefix commands keep working through a deprecation window (default: one month) with a one-line nudge appended ("try /event — ! commands retire soon"). A follow-up retirement release removes the prefix handlers, the DM session machinery, and the MessageContent intent.
- R9. Events already posted with reactions keep working via reactions until their event date passes; they are not migrated to buttons. The reaction handler is removed once pre-release events have aged out (verify before the retirement release).
- R10. Slash-created events flow through the existing domain layer unchanged: same Event storage shape, same reminder loop, same native scheduled-event mirror. No data migration.

## Success Criteria

- A user whose server-member DMs are disabled can create an event end-to-end, in-channel, through a single modal.
- Registration on new events works in guilds where the bot lacks Manage Messages, with no reaction/partial machinery involved.
- After the retirement release, the bot logs in and operates fully **without** the MessageContent intent (no Developer Portal toggle required for new installs).
- Stored events, reminders, and native-event mirrors behave identically through the entire transition.

## Scope Boundaries

- Parity surface migration only: no recurring events, no per-role options, no post-hoc option editing, no new event fields.
- No backfill of existing event messages to buttons (they age out — R9).
- Slash command names/descriptions are English-only initially; the dictionary keeps localizing message content, and Discord's command-localization API is deferred.
- Growth/verification work beyond 100 guilds is out of scope; this effort only removes the message-content blocker.

## Key Decisions

- **Retire prefix commands after a transition window**: dual surfaces forever means building every future feature twice; the end state drops the privileged intent entirely.
- **One big release, then the window**: a single migration story for users over incremental stages (owner preference; accepted trade-off: bigger deploy).
- **Modal-form creation with a 5th options field**: one dialog covers the whole interview; blank field = defaults keeps the simple path simple.
- **Standard decline button on every event** instead of a decline-marker syntax: nothing to learn, uniform UX. Accepted behavior change: every event now has a decline choice (today creators could omit one), and the default set's ❎ is replaced by the standard decline.
- **`/timezone` + smart default, never block**: wrong-timezone risk is mitigated by the ephemeral notice; the alternative (mandatory setup or per-event confirmation) re-adds the friction this removes.
- **Old reaction events age out naturally**: events are inherently time-bound; a backfill would risk live events to clean up something that cleans itself.
- **Permission failures become ephemeral errors** instead of DM apologies — a consequence of the no-DM design and strictly better feedback.

## Dependencies / Assumptions

- Builds on the discord.js 14 migration (PR #4) and the native scheduled-events mirror (PR #5); both must land first.
- Assumes the existing `(userId, guildId)` user-timezone records remain valid — `/timezone` writes the same data the interview wrote.

## Outstanding Questions

### Resolve Before Planning

(none — all product decisions above are resolved)

### Deferred to Planning

- [Affects R2][Technical] Button `customId` encoding: fit event shortId + option key (custom emoji keys are `<a:name:id>` strings) within Discord's 100-char customId limit.
- [Affects R1][Technical] Retry ergonomics on validation failure: can the modal re-open pre-filled from an ephemeral error button across clients, or does retry mean re-typing?
- [Affects R4][Technical] Autocomplete constraints: 25-choice cap for the event picker; filtering strategy for ~600 IANA zones in `/timezone`.
- [Affects R8][Technical] Command registration strategy (global vs per-guild) and propagation delays during rollout.
- [Affects R2][Needs research] Embed-edit rate limits under button-click bursts (expected same as today's reaction-driven edits, verify).

## Next Steps

→ `/ce:plan` for structured implementation planning
