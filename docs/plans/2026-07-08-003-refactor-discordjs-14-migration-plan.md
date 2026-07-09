---
title: "refactor: Migrate discord.js 12 to 14 (with forced TS 5 / eslint prerequisites)"
type: refactor
status: completed
date: 2026-07-08
---

# refactor: Migrate discord.js 12 to 14 (with forced TS 5 / eslint prerequisites)

## Overview

Upgrade discord.js from 12.5.3 to 14.26.4 (latest) with full feature parity: prefix commands (`!event`, `!modify`, `!help`), DM conversation sessions, reaction-based registrations on embeds, and the channel reminder loop. Research established a **forced prerequisite chain**: discord.js ≥14.12.0 typings use TypeScript-5-only syntax (`const` type parameters) that TS 4.9.5 cannot even parse (`skipLibCheck` does not help — it skips checking, not parsing). TS 5 in turn ends the tslint era (EOL, untested beyond TS 4.0). The user chose to migrate to eslint as part of this plan. Sequence: **eslint → TypeScript 5.9 → discord.js 14 → runtime/ops verification**.

## Problem Frame

discord.js 12 was deferred twice as "the bigger change" during the 2026-07-08 dependency upgrade and code-review hardening. The user now wants it planned: identify what changed and produce the migration. The bot is a prefix-command bot whose message-content access, gateway intents, channel-type model, embed API, and permissions API all changed between v12 and v14. Two categories of danger dominate: **loud failures** (login refused without the Developer Portal MessageContent toggle; compile refused under TS 4.9) and **silent failures** (string channel-type comparisons that become permanently false; `client.on('message')` listeners that never fire in v14; `addFields` on rebuilt embeds duplicating fields until the 25-field limit throws).

## Requirements Trace

- R1. discord.js is at ^14.26.4 and every v12 API call site is migrated (verified by grep sweeps: no `'message'` event, no string channel-type comparisons, no `MessageEmbed`/`addField`/`hasPermission`/`guild.member(`/bare-embed `send`/`edit` remain).
- R2. Feature parity confirmed by manual smoke checklist: guild `!event` trigger, full DM creation session, custom + default emoji options, reaction add/remove registration with embed update, `!modify` flows, reminder fire with working user pings, `!help`.
- R3. Prerequisites landed safely: eslint replaces tslint in the build; TypeScript at ^5.9.x (explicitly **not** `typescript@latest` — 7.x is the Go-based compiler and removes classic `node10` module resolution); Node runtime pinned ≥18 via Docker.
- R4. The MessageContent privileged intent is declared in code **and** documented as a Developer Portal toggle (login fails with `DisallowedIntents` until toggled); reminder mentions still ping (`allowedMentions` keeps `users` parsing) while `@everyone`/`@here` injection is closed.
- R5. The existing 20 tests keep passing at every phase gate; persisted data needs **no migration** (`emoji.toString()` → `<:name:id>` format is stable v12→v14, so stored option/registration Map keys still match).

## Scope Boundaries

- **No slash-command migration.** The bot stays prefix-command based (valid for unverified bots with the MessageContent toggle; Discord verification/review only matters near 100+ servers). Interactions/slash commands are a separate future effort.
- **No mongoose 7+/typegoose 11+ migration** — unchanged from prior plans.
- **No TypeScript strict-mode enablement** — TS goes to 5.9 but the non-strict compiler profile stays; strictness is a separate effort. (One consequence to expect, not fix globally: v14 types are stricter in places — e.g. `guild.members.me` is nullable — handle locally where the compiler forces it.)
- **No embed redesign, no new features** — mechanical parity migration only.
- **No test-suite expansion beyond keeping the existing 20 green** — the discord.js I/O layer remains manually verified (the review's suggested CreateHandler transition-extraction refactor stays deferred; doing it mid-migration would double the risk surface).

## Context & Research

### Relevant Code and Patterns (full call-site inventory, from this session's whole-codebase review)

- `src/app.ts` — `new Discord.Client({ partials })` (no intents — v12), `message`/`messageReactionAdd`/`messageReactionRemove` listeners, `error`/`shardError` listeners (both still exist in v14).
- `src/Calendar/Handlers/AbstractHandler.ts` — `allowedChannelTypes: string[]` (`['text']`, `['dm']`) compared against `message.channel.type` in `canProcessCommand`.
- `src/Calendar/Handlers/CalendarCommands.ts` — `message.channel.type === 'dm'` for `!help`; `canProcessCommand(command, message.channel.type)`; partial message fetch flow (already hardened); session timeout DMs.
- `src/Calendar/Handlers/CreateHandler.ts` — `'dm'`/`'text'` string checks; `message.guild.me.hasPermission(['SEND_MESSAGES'])`; `message.delete()`; DM re-prompt (guild-name capture already fixed).
- `src/Calendar/Classes/Message.ts` — `new Discord.MessageEmbed()`, string `setFooter`, `channel.send(embed)`, `message.edit(embed)`, received-embed mutation in `updateEventMessage`.
- `src/Calendar/Handlers/ReactionHandler.ts` — `guild.member(user)` (removed in v13), received-embed mutation (`embed.fields = []`, `.addField`), `reaction.message.edit(embed)`, `reaction.users.remove`, `value.users.fetch()` loops, atomic registration `$set` (keep), recreate-branch guards (keep).
- `src/Calendar/Handlers/CalendarReminders.ts` — `channel.type === 'text'`, plain-string `channel.send` (still valid in v14), `DiscordAPIError` + numeric `10003` check.
- `src/Calendar/Validation/EmojiValidation.ts` — `client.emojis.cache` (unchanged), custom-emoji regex added today (`<a?:name:id>` — matches v14 `toString()` format).
- Tests: `src/Calendar/Handlers/CalendarRemindersFormat.test.ts`, `src/Calendar/Classes/SessionManager.test.ts`, `src/Calendar/Validation/DateValidation.test.ts`, `src/Dictionaries/Dictionary.test.ts` — none touch discord.js APIs directly; all must stay green.
- Build chain: `npm run build` = mocha (ts-node 10.9.2, peer-compatible with TS 5) + tslint (to be replaced) + tsc.

### Institutional Learnings

- None on file (`docs/solutions/` does not exist). Session context: the 2026-07-08 review hardened exactly the paths this migration touches — preserve those guards (per-event reminder isolation, reaction recreate-branch gating, atomic registration writes) while porting.

### External References (researched 2026-07-08; key claims compile-verified against installed 14.26.4 typings)

- **TS 5 requirement**: discord.js ≥14.12.0 typings use `const` type parameters → 161 parse errors under tsc 4.9.5, exit 0 under 5.9.3 (empirical). Maintainer confirmation: discord.js issues #9783/#9784/#10046. No documented minimum exists — the typings are the authority.
- **Migration guides**: https://discordjs.guide/additional-info/changes-in-v14 and the v13 guide (raw.githubusercontent.com/discordjs/guide/v13/.../changes-in-v13.md).
- **Intents/partials**: https://discordjs.guide/popular-topics/intents, https://discordjs.guide/popular-topics/partials, Discord gateway docs. `Partials.Channel` is required to receive DMs at all (DM channels are uncached; without it DM messages are silently dropped).
- **MessageContent behavior**: declared-but-not-toggled → login fails (`DisallowedIntents`); toggled-but-not-declared → silently empty `content`. DM content, own messages, and bot-mentions are exempt. Unverified bots: free Portal toggle. (discord-api-docs discussion #5412.)
- **Embed rebuild**: received embeds are read-only `Embed` data in v14; rebuild via `EmbedBuilder.from(...)`; use `setFields`, not `addFields` (from() copies existing fields — appending duplicates until the 25-field `RangeError`).
- **tslint→eslint**: tslint-to-eslint-config v2.16.0 (Dec 2025, actively maintained); tslint has zero verified reports running on TS 5.
- **Stable APIs (compile-verified)**: `reaction.users.remove`, `message.fetch`, `message.delete` (no options arg since v13), `client.channels.fetch`, `client.users.fetch`, `guild.members.fetch`, `client.emojis.cache`, `user.send(string)`, plain-string `channel.send`, `DiscordAPIError` export (`.code` now `number | string`; compare with `RESTJSONErrorCodes.UnknownChannel`), `error`/`shardError` client events, `MessageReaction`/`PartialUser`/`User`/`TextChannel`/`Message` type exports (add `PartialMessageReaction` for handler params).
- **Environment**: discord.js 14.26.4 engines `node >=18`; runs cleanly on node:22 (undici is bundled, no conflict with Node's). Known environmental (not version) gotcha: IPv6-only resolution in containers can cause connect timeouts — mitigations exist if ever seen.

## Key Technical Decisions

- **Straight v12 → v14, never running on v13**: the migration guides compose cleanly; skipping v13 avoids its deprecated-alias double-fire trap and trades it for the silent-dead-listener trap, which the grep sweep in R1 closes.
- **TypeScript pinned `^5.9.x`, not latest**: 5.9.3 is compile-verified against the v14 typings; typescript 7.x (current `latest`) is the Go-based compiler that removes classic `node10` moduleResolution and would break this tsconfig. The caret stays below 6.
- **eslint via `tslint-to-eslint-config`** (user decision): converts `tslint:recommended` + the single-quote override; typescript-eslint replaces the lint build step. Triage converted rules pragmatically — the goal is an equivalent gate, not a stricter one, during a risky migration.
- **Intent set**: `Guilds`, `GuildMessages`, `MessageContent` (privileged — Portal toggle required), `GuildMessageReactions`, `DirectMessages`. `DirectMessageReactions` is deliberately omitted — reactions are only meaningful on guild event messages (the DM-reaction path was explicitly *blocked* in the hardening work).
- **`allowedMentions: { parse: ['users'] }` on the client**: reminders must still ping registrants (`<@!id>` mentions), while `@everyone`/`@here`/role parsing is disabled globally — closing the review's mention-injection advisory as a side effect.
- **Channel routing via helpers, not raw enums, where possible**: prefer `message.inGuild()` / `channel.isDMBased()` over `type === ChannelType.X` comparisons; `AbstractHandler.allowedChannelTypes` becomes `ChannelType[]` and callers pass `message.channel.type` unchanged. DM channels can be partial at message time (`Partials.Channel`), so the message pipeline fetches `message.channel` when `.partial` before routing.
- **Embed rebuild pattern**: `Message.updateEventMessage` and `ReactionHandler`'s column rebuild switch to `EmbedBuilder.from(message.embeds[0])` + `setFields(...)`; `Message.postNewMessageAndUpdate` constructs `EmbedBuilder` with object-form `setFooter`; all sends/edits use `{ embeds: [...] }` payloads.
- **No stored-data migration**: emoji `toString()` format (`<:name:id>`, `<a:name:id>`, raw unicode) is stable across v12→v14 — persisted option/registration Map keys keep matching. Verified against docs; re-confirmed live in the smoke checklist.
- **Docker pinned as part of this plan**: `node:22` + `npm ci` replaces `node:latest` + `npm update && npm install`. Previously an optional ops note; now load-bearing (engines ≥18 must be guaranteed, and images must honor the lockfile that pins these exact versions).
- **Keep `@types/node` at `^22`**: it dedupes the transitive `@types/node@26` (via `@discordjs/ws` → `@types/ws`) whose typings don't parse under older compilers; consistent with the pinned Node 22 runtime.

## Open Questions

### Resolved During Planning

- Can TS 4.9.5 consume discord.js 14 typings with `skipLibCheck`? — **No** (parse errors, empirically verified). TS 5.9 is mandatory.
- tslint fate? — **Migrate to eslint** (user decision, 2026-07-08).
- Do stored emoji Map keys survive? — **Yes**, `toString()` format is stable; no data migration.
- Straight-to-14 or via 13? — **Straight to 14** (see decisions).
- Which intents? — Five (see decisions); MessageContent is the only privileged one.
- Does the reminder loop's plain-string `channel.send` survive? — **Yes** (compile-verified).
- Does the `DiscordAPIError`/10003 quarantine check survive? — **Yes**; tighten to `RESTJSONErrorCodes.UnknownChannel` while porting.

### Deferred to Implementation

- Exact eslint rule triage (which converted rules to disable vs fix) — knowable only from the first lint run over the real codebase.
- Any new TS 5.9 diagnostics in our own code (expected ~none: non-strict profile, small surface) — knowable only from the first compile.
- Whether `guild.members.me` nullability and `PartialMessageReaction` unions force additional local guards under the non-strict profile — the compiler will say.
- Whether the Developer Portal application already has MessageContent toggled (pre-Sept-2022 apps were auto-toggled ON; if the bot app is older, it may already be set) — check the Portal during rollout.
- Optional tsconfig modernization (target ES2019 → ES2022) — harmless either way; decide at TS-bump time, not required.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart LR
  subgraph Phase A: prerequisites (each independently green)
    U1[U1 tslint → eslint] --> U2[U2 TypeScript 5.9]
  end
  subgraph Phase B: the migration (one commit series, build gate at end)
    U3[U3 discord.js 14 + client bootstrap] --> U4[U4 channel types, routing, permissions] --> U5[U5 embeds + reactions]
  end
  subgraph Phase C: proof
    U6[U6 Docker pin, Portal toggle, smoke checklist]
  end
  U2 --> U3
  U5 --> U6
```

Phase A lands with discord.js still at 12 — build and 20 tests stay green after each unit, proving the toolchain swap in isolation. Phase B necessarily has a red-build interior (the dependency bump breaks all call sites at once); it lands as one commit series with the full build gate at the end of U5. Phase C proves runtime behavior, which no compile can.

## Implementation Units

- [x] **Unit 1: Replace tslint with eslint + typescript-eslint**

**Goal:** The build's lint gate runs on maintained tooling, removing the reason TypeScript was capped at 4.9.5.

**Requirements:** R3

**Dependencies:** None.

**Files:**
- Create: eslint flat config at repo root (e.g. `eslint.config.mjs` — whatever current typescript-eslint scaffolding produces)
- Delete: `tslint.json`
- Modify: `package.json` (remove `tslint`; add `eslint` + `typescript-eslint` devDependencies; rewrite the `lint` script)

**Approach:**
- Run `tslint-to-eslint-config` as a starting point, then simplify to the current typescript-eslint recommended preset + the project's single-quote preference rather than carrying over converted rule noise.
- Triage first-run findings: fix trivial ones, disable rules that fight the existing non-strict style — equivalence, not a new quality bar (that can tighten later).

**Test scenarios:**
- Lint passes over all 29 source files; a deliberately introduced double-quote string is flagged (config actually active).
- `npm run build` (test + lint + compile) green with discord.js still at 12 and TS still at 4.9.5.

**Verification:** Build green; `tslint` absent from the dependency tree.

- [x] **Unit 2: TypeScript 5.9**

**Goal:** The compiler can parse discord.js 14 typings; everything still works on discord.js 12.

**Requirements:** R3, R5

**Dependencies:** Unit 1.

**Files:**
- Modify: `package.json` (`typescript` → `^5.9.3`; keep `@types/node` at `^22`), possibly `tsconfig.json` (only if 5.9 flags something; no planned changes)

**Approach:**
- Pin below 6 (see decisions — `latest` is the 7.x Go compiler; do not use it).
- ts-node 10.9.2 (peer `typescript >=2.7`) and mocha 11 are already compatible; the mocha-via-ts-node path is exercised by the existing suite.
- Fix any new diagnostics in our code locally; expected near-zero under the non-strict profile.

**Test scenarios:**
- All 20 existing tests pass under ts-node + TS 5.9.
- `tsc` emits dist and the bot boots (env fail-fast smoke) — still on discord.js 12.

**Verification:** Build + tests green; boot smoke unchanged.

- [x] **Unit 3: discord.js 14 + client bootstrap** *(Phase B starts — build stays red until Unit 5 completes; land B as one commit series)*

**Goal:** The dependency is bumped and the process entry point speaks v14: intents, enum partials, global mention policy, renamed events.

**Requirements:** R1, R4

**Dependencies:** Unit 2.

**Files:**
- Modify: `package.json` (`discord.js` → `^14.26.4`), `src/app.ts`

**Approach:**
- Client construction gains the five-intent set and `Partials.Message/Channel/Reaction` (enum, not strings — invalid strings silently break DM delivery), plus `allowedMentions: { parse: ['users'] }`.
- `client.on('message')` → `messageCreate` — the v14 alias removal is silent, so this rename is load-bearing.
- `error`/`shardError` listeners survive as-is; login/`.catch` containment from the hardening work is untouched.
- Note: v14's Client defaults its token from `process.env.DISCORD_TOKEN` — we pass the token explicitly from Settings; same value, no behavior change, just awareness.

**Test scenarios:** (deferred to the Unit 5 gate — nothing compiles mid-phase)

**Verification:** Unit compiles only in concert with Units 4-5; its correctness is proven at the Unit 5 gate and in Unit 6 runtime checks (a `DisallowedIntents` login failure here means the Portal toggle is missing, not a code bug).

- [x] **Unit 4: Channel types, command routing, permissions**

**Goal:** Every string channel-type comparison and removed permissions/member API is replaced; DM routing works with partial channels.

**Requirements:** R1, R2

**Dependencies:** Unit 3.

**Files:**
- Modify: `src/Calendar/Handlers/AbstractHandler.ts`, `src/Calendar/Handlers/CalendarCommands.ts`, `src/Calendar/Handlers/CreateHandler.ts`, `src/Calendar/Handlers/CalendarReminders.ts`, `src/Calendar/Calendar.ts` (reaction handler param types if needed)

**Approach:**
- `AbstractHandler.allowedChannelTypes` becomes `ChannelType[]`; registrations become `[ChannelType.GuildText]` / `[ChannelType.DM]`; `canProcessCommand` compares enum values.
- In the message pipeline (CalendarCommands), fetch `message.channel` when `.partial` before routing (DM channels can be partial); prefer `message.inGuild()` / `isDMBased()` where a boolean guild/DM split is what's actually meant (CreateHandler's `'dm'`/`'text'` gates, the `!help` DM check).
- `message.guild.me.hasPermission(['SEND_MESSAGES'])` → `guild.members.me` (nullable) with `PermissionFlagsBits.SendMessages`; consider `channel.permissionsFor(...)` for the channel-scoped intent of that check.
- Reminders: `channel.type === 'text'` → `ChannelType.GuildText`; quarantine check compares `RESTJSONErrorCodes.UnknownChannel`.
- Reaction handler signatures widen to include `PartialMessageReaction` where the compiler requires.

**Test scenarios:** (Unit 5 gate + Unit 6 smoke: guild-only `!event`, DM-only `!modify`/session replies, permission-failure DM path)

**Verification:** Grep sweeps find zero `'dm'`/`'text'` channel-type strings, zero `hasPermission`, zero `guild.me`, zero `.member(`.

- [x] **Unit 5: Embeds and reactions** *(Phase B build gate)*

**Goal:** All embed construction, mutation, and send/edit payloads are v14-native; the reaction registration flow works end to end.

**Requirements:** R1, R2, R5

**Dependencies:** Unit 4.

**Files:**
- Modify: `src/Calendar/Classes/Message.ts`, `src/Calendar/Handlers/ReactionHandler.ts`

**Approach:**
- `Message.postNewMessageAndUpdate`: `EmbedBuilder` + object-form `setFooter({ text })`; send as `{ embeds: [embed] }`.
- `Message.updateEventMessage`: rebuild via `EmbedBuilder.from(message.embeds[0])` (received embeds are read-only data); edit with `{ embeds: [...] }`.
- `ReactionHandler`: replace `embed.fields = []` + `.addField(...)` with an `EmbedBuilder.from(...)` rebuild using **`setFields(...)`** — `from()` copies existing fields, so `addFields` would duplicate on every reaction until the 25-field limit throws; field values must be real strings.
- `guild.member(registeredUser)` → `guild.members.cache.get(id)` with the existing `members.fetch` fallback (that try/catch guard from the hardening work stays).
- Recreate-branch embed reads (`embeds[0].title/.description`) are data-class accessors — unchanged.
- Preserve all hardening semantics: atomic `$set` registration writes, per-registrant fetch guards, recreate gating.

**Test scenarios:**
- Full build + all 20 tests green (this is the Phase B gate).
- Unit 6 covers runtime: reaction add updates the correct column without duplicated fields across many consecutive reactions; reaction remove path; registration columns for default and custom emoji.

**Verification:** `npm run build` green; grep sweeps: zero `MessageEmbed`, zero `.addField(`, zero bare-embed `send(`/`edit(` payloads, zero `on('message'` listeners anywhere.

- [x] **Unit 6: Runtime and ops verification** *(code/docs/image done 2026-07-09; the manual smoke checklist against a test guild remains a human pre-deploy gate — it is reproduced in the PR description)*

**Goal:** The migrated bot demonstrably works against real Discord, and the deployment actually guarantees the environment the code now requires.

**Requirements:** R2, R3, R4, R5

**Dependencies:** Unit 5.

**Files:**
- Modify: `Dockerfile` (base `node:22`; `npm ci` instead of `npm update && npm install`)
- Read-only: Developer Portal (manual), `docker-compose.yml`

**Approach:**
- **Before first launch**: enable MessageContent in Developer Portal → Bot → Privileged Gateway Intents (pre-Sept-2022 applications may already have it). A `DisallowedIntents` login error means this step, not the code.
- Docker: pin `node:22`, `npm ci` — images now honor the lockfile; engines ≥18 guaranteed.
- Manual smoke checklist (the real integration gate): guild `!event` → full DM creation session (first-time-user path included) → event posts with default options and reactions → second user registers via reaction (embed updates; repeated reactions don't duplicate fields) → custom-emoji option creation → `!modify` list/title/time/reminder → reminder fires and **pings** registrants (allowedMentions check) → deleted-channel event self-quarantines → `!help` in DM → `!exit` mid-session → reactions on pre-restart messages (partial fetch path).
- Verify stored pre-migration events still resolve options/registrations (emoji key stability, R5).

**Test scenarios:** the checklist above, run against a test guild with the real token; existing automated tests remain green.

**Verification:** Every checklist item passes; `docker build` succeeds; bot runs under the pinned image.

## System-Wide Impact

- **Interaction graph:** every Discord-facing file changes; the mongoose/typegoose layer, session logic, validation, dictionaries, and all 20 tests are untouched by design. The hardening guards added on 2026-07-08 (containment, per-event isolation, atomic writes, recreate gating) must survive the port — they are listed per-unit above.
- **Error propagation:** unchanged model (containment layer). One improvement: the Unknown Channel check gains a named constant. Watch for `DisallowedIntents` as a new, expected startup failure mode with a documented cause.
- **State lifecycle risks:** none new — no schema changes; emoji Map keys verified stable. The one data-shaped risk (duplicated embed fields) is a Discord-message artifact, not DB state, and is closed by the `setFields` decision.
- **API surface parity:** Discord commands are the only surface; parity is R2's checklist.
- **Integration coverage:** automated tests cover pure logic only; the migrated I/O layer is proven by the Unit 6 checklist. This is accepted for a solo hobby bot; the transition-extraction refactor that would make handlers unit-testable stays deferred.

## Risks & Dependencies

- **Silent breakage class** (string type checks, dead `message` listener, `addFields` duplication): closed by explicit grep sweeps in unit verifications, not just compile success.
- **Phase B has a red-build interior**: unavoidable with a big-bang dependency bump; bounded by landing U3–U5 as one reviewed commit series with the gate at U5. No intermediate state ships.
- **Portal dependency**: the bot cannot log in after the upgrade until MessageContent is toggled — a human step outside the repo. Do it before deploying, not after.
- **eslint conversion scope creep**: converted configs can surface hundreds of stylistic findings; the plan explicitly targets gate-equivalence, deferring any quality-bar raise.
- **TS 5.9 vs ts-node/mocha**: peer-verified compatible, but the combination is proven empirically at the U2 gate before discord.js enters the picture — isolating toolchain risk from API risk.
- **typescript@7 trap**: anyone "helpfully" bumping to latest breaks the build; the caret pin below 6 plus a note in the plan is the guard.
- **IPv6/undici connect timeouts in Docker** (environmental, rare on node:22): known mitigations (`--dns-result-order=ipv4first`, `autoSelectFamily`) if ever observed — advisory only.

## Documentation / Operational Notes

- README setup section should gain one line: enable **Message Content Intent** in the Developer Portal (with the `DisallowedIntents` symptom named).
- Deployment: first post-migration deploy requires the Portal toggle *before* the container starts; rollback is the previous image (no data migration in either direction).
- Follow-ups unlocked by this plan: TypeScript strict-mode adoption (now on a live compiler), slash-command migration (separate effort), mongoose 7+ chain (typegoose 11/12/13), possible ESM migration (would unlock nanoid 5+).

## Sources & References

- Related plans: `docs/plans/2026-07-08-001-refactor-npm-dependency-upgrade-plan.md` (deferral origin), `docs/plans/2026-07-08-002-fix-review-critical-issues-plan.md` (hardening guards to preserve).
- Migration guides: https://discordjs.guide/additional-info/changes-in-v14 · v13 guide (raw.githubusercontent.com/discordjs/guide/v13/guide/additional-info/changes-in-v13.md)
- Intents & partials: https://discordjs.guide/popular-topics/intents · https://discordjs.guide/popular-topics/partials · https://github.com/discord/discord-api-docs/discussions/5412
- TS 5 requirement: https://github.com/discordjs/discord.js/issues/9783 · #9784 · #10046 (plus empirical compile of the full API inventory against installed 14.26.4 typings, 2026-07-08)
- Embeds: https://discordjs.guide/popular-topics/embeds (EmbedBuilder.from, field limits)
- tslint→eslint: https://github.com/typescript-eslint/tslint-to-eslint-config (v2.16.0)
- Registry facts: discord.js 14.26.4 engines `node >=18`; dependency tree incl. discord-api-types ^0.38, @discordjs/builders ^1.14 (verified via npm, 2026-07-08)
