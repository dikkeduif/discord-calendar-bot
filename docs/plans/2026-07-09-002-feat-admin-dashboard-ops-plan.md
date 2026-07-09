---
title: "feat: Admin ops track — channel detach, /admin suite, web dashboard"
type: feat
status: active
date: 2026-07-09
origin: docs/brainstorms/2026-07-09-admin-dashboard-requirements.md
---

# feat: Admin ops track — channel detach, /admin suite, web dashboard

## Overview

Three phased deliverables, each shippable alone (origin R8): **A** — the channel-detach primitive (the honest version of "leave channels": deactivate + block, reversible, persisted); **B** — an owner-only `/admin` slash suite (guilds/events overview, leave guild with cleanup, detach/re-attach); **C** — a token-protected web dashboard served from the bot process (guilds → channels → events → registrations, the same actions, and an on-demand drift report). The web layer is the repo's first HTTP surface, so the plan treats auth, XSS, and CSRF as first-class requirements, not afterthoughts.

## Problem Frame

The owner has no way to see where the bot operates or make it stop operating somewhere short of raw Mongo queries and log-grepping; Discord's model has no "leave a channel", so the wish decomposes into detach-channel + leave-guild (see origin: docs/brainstorms/2026-07-09-admin-dashboard-requirements.md; ideation: docs/ideation/2026-07-09-admin-dashboard-ideation.md).

## Requirements Trace

- R1+R2 (detach: full stop, reversible, persisted, enforced at create + reminder) → Units 1, 2
- R3 (/admin owner-only suite) → Unit 3
- R4 (guild leave with cleanup, no ghosts) → Units 1, 3
- R5 (token-protected dashboard from the bot process, phone-usable, OAuth-ready seam) → Unit 4
- R6 (views + actions identical to Discord counterparts) → Units 5, 6
- R7 (drift report with one-click cleanup) → Unit 7
- R8 (phased A→B→C) → plan structure

## Scope Boundaries

Carried from origin: no health panel/endpoint; owner-only on both surfaces (no guild admins, no OAuth in v1 — auth is a seam only); management-only web (no event authoring); no metrics, audit-trail collection, or per-guild settings beyond detach state; dashboard English-only. Additions from planning:

- No `guildCreate`/`guildDelete`/`channelDelete` listeners in v1 — the on-demand drift scan covers downtime joins/leaves (verified: gateway emits nothing for changes during downtime anyway, so a scan is needed regardless).
- No htmx / no client-side JS: plain HTML forms with Post/Redirect/Get. htmx 4 is mid-rewrite (2.x fine, 4.0 beta); zero static assets is simpler and CSP-friendlier. Revisit only if partial updates are ever wanted.
- Buttons on detached events grey **lazily** (existing click-time pattern), not via mass message edits; `/admin` confirmation copy says so.

## Context & Research

### Relevant Code and Patterns

- `src/Calendar/Handlers/CalendarReminders.ts` — dead-channel quarantine (`UnknownChannel` comparison shape to reuse); currently sets `active:false` without a channel record and **never cancels native mirrors** — Unit 1 unifies this.
- `src/Calendar/Classes/Message.ts` — `postNewMessageAndUpdate` is the single post chokepoint for every creation surface (slash, legacy interview, retry drafts): detach enforcement's safety net lives here.
- `src/Calendar/Classes/ScheduledEvent.ts` — best-effort mirror lifecycle; detach/leave cleanup reuses its delete path per event.
- `src/Calendar/Interactions/` — router with owner-relevant nuance: **autocomplete and buttons dispatch independently of command execute**, so owner gating must cover all three; `DeleteCommand`'s stateless confirm customId (`ev:del:<shortId>`) is the pattern for `/admin` confirms.
- `src/Calendar/Interactions/DeleteCommand.ts` + `RegistrationButtonHandler.ts` — existing delete semantics (deactivate → message delete → mirror delete) and the click-guard patterns Unit 6 must stay identical to.
- `src/settings.ts` — env-var config pattern for `OWNER_USER_ID`, `ADMIN_PORT`, `ADMIN_TOKEN`, bind/secure knobs.
- `src/app.ts` — containment: `uncaughtException` exits the process, **no SIGTERM handlers exist**; Unit 4 must add graceful shutdown without disturbing the crash policy.
- Test convention: colocated `*.test.ts`, pure logic only.

### Institutional Learnings

- None on file (`docs/solutions/` absent). Session context: PRs #4–#6 (v14, native mirrors, interaction surface) are prerequisites; hardening style is containment + best-effort cleanup + idempotency.

### External References (verified 2026-07-09; discord.js facts checked against installed 14.26.4)

- **Express 5.2.1** is the stable, recommended line (v4 in wind-down); `express.urlencoded` built in; `cookie-parser` still separate; `req.body` undefined when unparsed. `EADDRINUSE` arrives as an async `'error'` event on the server — unhandled it kills the whole process. `server.close()` + `closeAllConnections()` (Node ≥18.2) for shutdown. Fastify 5 viable; bare `node:http` championed for zero deps — see decisions.
- **Auth/CSRF (OWASP)**: hash-then-`timingSafeEqual` (raw compare throws on unequal lengths); cookie `HttpOnly; SameSite=Strict; Path=/` (+ `Secure`/`__Host-` when TLS); SameSite=Strict may stand alone for single-owner/no-subdomain apps **plus** zero GET mutations and a `Sec-Fetch-Site` check on POSTs (OWASP-blessed, ~3 lines); per-IP fixed-window login limiter (never global lockout — scanners could lock the owner out); 32+ byte random token makes online brute force moot.
- **XSS**: auto-escaping `html` tagged template literal with explicit `raw()` marker (escape-by-default beats remember-to-escape); interpolate only into text/quoted attributes; `Content-Security-Policy: default-src 'self'` backstop.
- **Exposure tiers (r/selfhosted consensus)**: 127.0.0.1 default → Tailscale for phone (recommended) → Caddy/TLS if truly public; never raw HTTP over the internet (Secure cookies won't even function).
- **discord.js 14.26.4**: `guild.leave()` throws `GuildOwned` for bot-owned guilds; cache removal comes later via GUILD_DELETE. Scheduled events **persist after the creator leaves** → clean up mirrors *before* `leave()`; `event.delete()` works regardless of status (setStatus(Canceled) is invalid for Active events). `guilds.cache` is complete after ready (unavailable stubs; `guildAvailable`/`guildUnavailable` nuances). **Drift pitfall**: `scheduledEvents.fetch(id)` returns stale cache without an API call — `force: true` is mandatory for existence checks; deleted → code 10070 (`UnknownGuildScheduledEvent`). Dead channel → 10003 only (50001 Missing Access must not count as dead).

## Key Technical Decisions

- **One channel-state model for detach *and* quarantine**: a `ChannelState` collection ({channelId unique, guildId, state: detached|quarantined, timestamps}) plus an in-memory Set cache (loaded at boot, updated on mutation — valid under the single-process assumption). The reminder-time quarantine starts writing records and deleting mirrors too (fixing the existing orphaned-mirror gap); the drift report can then distinguish deliberately detached channels from dead ones.
- **Detach enforcement at three layers**: friendly ephemeral rejection *before* the create modal; a re-check at modal submit (nice error, drafts preserved); and the hard safety net inside `Message.postNewMessageAndUpdate` (catches the legacy interview, retry drafts, and any future surface). Reminder-loop check is a cheap Set lookup safety net (detached events are already inactive).
- **Actor-scoped `AdminActions` service** (detach, reattach, leaveGuild, deleteEvent with owner-bypass vs author scope): the single mutation path for `/admin`, the dashboard, and the existing `DeleteCommand` (light refactor), with an explicit idempotency contract — second detach = "already detached", second leave = treat UnknownGuild as already-left and still run local cleanup, delete-after-delete = "already deleted".
- **Leave-guild order**: ephemeral "working…" reply *first* (webhook survives departure, but don't depend on it) → delete that guild's native mirrors (best-effort, continue on failures) → deactivate its events → `guild.leave()` → edit reply. `GuildOwned` error surfaces as its own message.
- **Owner gating covers every `/admin` dispatch path** — execute, autocomplete (would otherwise leak guild names to anyone typing), and confirm buttons; `setDefaultMemberPermissions(0)` hides the command from non-admin members. `OWNER_USER_ID` (single id — explicitly not a list, v1) unset ⇒ `/admin` excluded from registration and dashboard refuses to start (fail closed).
- **Express 5 + cookie-parser** over bare `node:http` (routing/body parsing are exactly where hand-rolled security bugs live; types current; body limits configured) and over Fastify (Express's built-in urlencoded + ubiquity win for a solo-maintained ~12-route panel). Accepted cost: the Express middleware CVE tail, surfaced by npm audit.
- **Auth = login form → hash-derived stateless cookie**: POST the token once; on success set a cookie holding a SHA-256-derived value of the env token (survives restarts; rotating `ADMIN_TOKEN` invalidates every browser); verify per-request with hash-then-`timingSafeEqual`. Boot-time guard: token ≥ 32 chars or the server refuses to start. Per-IP fixed-window limiter on the login route. Token never appears in URLs or logs.
- **CSRF = SameSite=Strict + zero GET mutations + `Sec-Fetch-Site` check on every POST** (OWASP's carve-out fits this exactly: single owner, own host, no subdomains). No token framework. Cookie: `HttpOnly; SameSite=Strict; Path=/`; `Secure` + `__Host-` prefix applied when TLS mode is on (env flag, default on — tier docs below).
- **Rendering = auto-escaping `html` tagged template literal** (tested hard, incl. the raw() escape hatch) + CSP `default-src 'self'` + nosniff/frame-deny headers + body-size limit and request timeout. No template engine, no static assets, no client JS.
- **Exposure tiers documented, owner's choice honored**: bind address and port from env; README documents (1) localhost default, (2) Tailscale for phone access — recommended, (3) public behind Caddy/TLS with explicit warnings. The owner's chosen posture (token-protected public port) is tier 3.
- **Drift scan discipline**: on-demand only (button), gated on `client.isReady()` (a cold cache would mark every guild ghost); one `scheduledEvents.fetch({force})` sweep per guild rather than per event where possible; distinct channelIds with a small concurrency cap; only 10003 marks a channel dead; ghost-guild cleanup requires a second confirm; vanished-mirror checks use `force: true` (cache lies otherwise).
- **HTTP lifecycle**: `server.on('error')` logs EADDRINUSE and leaves the bot running; async route wrapper feeds the router's error page (500, no stack leak); new SIGTERM/SIGINT handler closes the server (`closeAllConnections`), clears the reminder timer, destroys the client — HTTP first, Discord second.

## Open Questions

### Resolved During Planning

- HTTP framework (origin, deferred) — Express 5.2.1 + cookie-parser (see decisions; node:http and Fastify considered).
- Token entry/storage UX (origin, deferred) — login form → hash-derived stateless cookie; per-IP limiter; constant-time via hash-then-compare.
- Where detached state lives (origin, deferred) — unified `ChannelState` collection + in-memory Set (also absorbs quarantine).
- Drift mechanics (origin, deferred) — on-demand, ready-gated, `force: true`, per-guild sweeps, 10003-only, capped concurrency.
- Self-contained assets (origin, needs-research) — resolved by having none: no-JS server-rendered HTML; CSP self.
- Mirror cleanup before leave (research) — `event.delete()` regardless of status, before `guild.leave()`; events would otherwise persist after departure.

### Deferred to Implementation

- Exact route table and page copy — cosmetic, settle in code.
- Limiter window/threshold constants and pagination sizes — tune while smoke-testing.
- Whether `RegistrationRenderer` can be reused for the registrations detail view or a simpler name-resolution readout suffices (member fetches from a web context have no interaction budget — measure).
- Startup migration for existing quarantined channels (backfill `ChannelState` from deactivated events?) — decide when touching the quarantine code; likely unnecessary (drift scan surfaces them).

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart LR
  subgraph Surfaces
    ADM["/admin (owner-gated:\nexecute + autocomplete + buttons)"]
    WEB["Dashboard (express 5:\nlogin → cookie → views/actions)"]
    EV["/event create · legacy !event\n· reminder loop · button clicks"]
  end
  ADM --> SVC[AdminActions service\n(actor-scoped, idempotent)]
  WEB --> SVC
  SVC --> CS[(ChannelState\n+ in-memory Set)]
  SVC --> DOM[Event/User models · Message\n· ScheduledEvent mirrors]
  EV -->|detach checks| CS
  QUAR[Reminder-time quarantine] -->|now writes| CS
  WEB --> DRIFT[Drift scan (on-demand):\ncache vs Mongo vs force-fetched mirrors]
```

## Implementation Units

### Phase A — the detach primitive

- [x] **Unit 1: ChannelState model + AdminActions core + quarantine unification**

**Goal:** Detach/reattach exist as idempotent, persisted operations with mirror cleanup; the reminder-time quarantine joins the same model.

**Requirements:** R1, R2, R4 (service groundwork)

**Dependencies:** PRs #4–#6 merged.

**Files:**
- Create: `src/Calendar/Models/ChannelState.ts`, `src/Calendar/Services/AdminActions.ts`, `src/Calendar/Services/ChannelStateCache.ts`
- Modify: `src/Calendar/Handlers/CalendarReminders.ts`
- Test: `src/Calendar/Services/AdminActions.test.ts` (pure parts: idempotency outcomes, state transitions), `src/Calendar/Services/ChannelStateCache.test.ts`

**Approach:**
- `ChannelState` keyed by channelId (unique) with state detached|quarantined; cache = Set(s) loaded at clientReady, mutated only through the service.
- `detachChannel`: upsert record → deactivate the channel's active events (updateMany) → delete each event's native mirror via the existing `ScheduledEvent` class (best-effort loop, one failure never aborts) → report counts + already-detached case. `reattachChannel`: remove/flip record only (deactivated events stay dead — origin decision) with honest no-op messages.
- Quarantine path writes a `quarantined` record and deletes mirrors of the events it deactivates (fixes today's orphaned Events-tab entries).
- `deleteEvent` moves the existing delete semantics behind an actor scope (authorId vs owner-bypass); `DeleteCommand` refactors onto it unchanged behaviorally.

**Execution note:** test-first for idempotency semantics and cache behavior.

**Patterns to follow:** typegoose statics in `Event.ts`; best-effort loops + logging in `ScheduledEvent.ts`; commit-9184c2c quarantine discipline.

**Test scenarios:** double-detach reports already-detached; detach with zero events reports 0-deactivated-but-blocked; reattach of never-detached is a no-op; cache reflects mutations; quarantine records distinguish from detached.

**Verification:** existing suite green; detach/reattach round-trip persists across a process restart (manual dev check); quarantined channel produces a ChannelState record and no orphaned mirror.

- [x] **Unit 2: Detach enforcement across every creation and click path**

**Goal:** No surface can create or operate events in a detached channel; every rejection has clear copy.

**Requirements:** R1, R2

**Dependencies:** Unit 1.

**Files:**
- Modify: `src/Calendar/Interactions/CreateCommand.ts`, `src/Calendar/Classes/Message.ts`, `src/Calendar/Handlers/CreateHandler.ts`, `src/Calendar/Handlers/CalendarReminders.ts`, `src/Calendar/Interactions/RegistrationButtonHandler.ts`, `src/Dictionaries/CalendarTranslations.ts`
- Test: extend `src/Calendar/Interactions/OptionsFieldParser.test.ts` sibling style with a small guard test file if pure logic emerges (`src/Calendar/Services/ChannelStateCache.test.ts` covers the predicate)

**Approach:**
- `/event create`: cache-Set check before `showModal` (ephemeral "this channel is detached"); re-check at modal submit (drafts preserved, distinct message — not the generic postFailed).
- `Message.postNewMessageAndUpdate`: hard chokepoint check (covers legacy interview finish + retry drafts); blocked post surfaces to the legacy flow as a DM notice and ends the session rather than dangling.
- Legacy `!event` start gate rejects in detached channels with the DM notice; reminder loop consults the Set as a race safety net.
- Race hardening from flow analysis: registration click's atomic write gains an `active: true` filter; UnknownMessage during the click's embed edit treated as benign.

**Patterns to follow:** existing pre-modal permission checks in `CreateCommand`; dictionary copy families.

**Test scenarios:** guard predicate for detached/quarantined/absent; enforcement messages resolve through the dictionary (runtime key check).

**Verification:** dev-guild smoke — detach mid-modal: submit rejected politely, draft echo intact; legacy interview blocked at start and at finish; reminders skip; clicks on detached-channel events answer "closed".

### Phase B — /admin

- [x] **Unit 3: Owner-only /admin suite + guild-leave cleanup**

**Goal:** The owner can see and act on everything from Discord: guild overview, per-guild events, leave (with cleanup), detach/reattach — from any mutual guild.

**Requirements:** R3, R4

**Dependencies:** Units 1–2.

**Files:**
- Create: `src/Calendar/Interactions/AdminCommand.ts`
- Modify: `src/Calendar/Interactions/CommandDefinitions.ts`, `src/Calendar/Interactions/InteractionRouter.ts`, `src/settings.ts`, `src/Dictionaries/CalendarTranslations.ts`
- Test: `src/Calendar/Interactions/AdminCommand.test.ts` (chunking/formatting helpers, owner-gate predicate, leave-order pure parts)

**Approach:**
- Subcommands: `guilds` (chunked embed, hard row cap with "…and N more — see the dashboard"), `events <guild>` (autocomplete over cache: name → guildId value), `leave <guild>` (confirm button `ev:adm:leave:<guildId>`), `detach <channel>` / `reattach <channel>` (channel option; raw-id string accepted for cleanup of dead/foreign channels).
- **Gating**: one owner-check helper applied in the router for `/admin` execute, its autocomplete, and `ev:adm:*` buttons (autocomplete leaks guild names otherwise); `setDefaultMemberPermissions(0)`; when `OWNER_USER_ID` unset, the command is omitted from the registration set entirely.
- Leave flow per decisions: reply first, mirrors → deactivate → leave, idempotent second attempt, `GuildOwned` message.
- All mutations route through `AdminActions`; every action logs a winston line (actor, surface, target).

**Patterns to follow:** `DeleteCommand` stateless confirm; `CommandDefinitions` builder style; drift-gated registration compare already handles set changes.

**Test scenarios:** owner-gate predicate (owner id match, unset id ⇒ always false); guild-list chunking at 1/15/100 guilds; leave-cleanup ordering expressed as a pure sequence check.

**Verification:** non-owner sees permission-hidden command and gets rejections on direct attempts incl. autocomplete (empty) and buttons; leave removes mirrors + deactivates before departure; second leave attempt reports already-left.

### Phase C — the dashboard

- [x] **Unit 4: HTTP foundation — server, auth, hardening, lifecycle**

**Goal:** A secured, lifecycle-safe HTTP layer exists in the bot process; login works from a phone; the bot survives port conflicts and shuts down cleanly.

**Requirements:** R5

**Dependencies:** Unit 1 (service exists); independent of Units 2–3.

**Files:**
- Create: `src/Dashboard/Server.ts`, `src/Dashboard/Auth.ts`
- Modify: `src/app.ts`, `src/settings.ts`, `package.json` (express, cookie-parser, @types/express), `docker-compose.yml`
- Test: `src/Dashboard/Auth.test.ts` (hash-then-compare incl. length mismatch, cookie derivation, limiter window logic)

**Approach:**
- Start only when `ADMIN_PORT` + `ADMIN_TOKEN` (≥32 chars) + `OWNER_USER_ID` present; otherwise log one line and skip — `docker-compose up` stays zero-config.
- Login: GET form, POST token → hash-then-`timingSafeEqual` → cookie (hash-derived, HttpOnly, SameSite=Strict, conditional Secure/`__Host-` via env flag); per-IP fixed-window limiter; auth middleware on everything else; `Sec-Fetch-Site` check middleware on all POSTs.
- Hardening: CSP `default-src 'self'`, nosniff, frame-deny, urlencoded body limit, request timeout, async error wrapper → plain 500 page, no token in any log line.
- Lifecycle: `server.on('error')` (EADDRINUSE ⇒ log + bot continues); new SIGTERM/SIGINT handler: close server + `closeAllConnections` → clear reminder timer → `client.destroy()` → exit.

**Execution note:** test-first for Auth (compare, derivation, limiter).

**Patterns to follow:** `settings.ts` env pattern; `app.ts` containment style.

**Test scenarios:** wrong token, wrong length token (no throw), stale cookie after token rotation, limiter lockout window expiry, Sec-Fetch-Site cross-site POST rejected.

**Verification:** curl matrix (no cookie → login redirect; bad token → 401 + limiter counts; good login → cookie → pages); EADDRINUSE leaves Discord side running; SIGTERM exits cleanly under pm2-runtime.

- [x] **Unit 5: Read views — guilds, channels, events, registrations**

**Goal:** The owner answers "where is my bot and what's happening" from a browser, safely rendered.

**Requirements:** R5, R6 (views)

**Dependencies:** Unit 4.

**Files:**
- Create: `src/Dashboard/Html.ts` (escaping tag + layout), `src/Dashboard/Views.ts` (route handlers)
- Test: `src/Dashboard/Html.test.ts` (escape-by-default incl. quotes/script tags, raw() marker, attribute contexts)

**Approach:**
- `html` tagged template with default escaping and explicit `raw()`; every page through one layout with the security headers.
- Guilds list (cache + event counts; ghost guilds badge with denormalized `guildName` fallback) → guild detail (channels with events, detached/quarantined badges) → event detail (options, per-option registrations — usernames best-effort from cache, raw ids as fallback; no per-request member-fetch storms).
- Active-only default with include-inactive toggle; simple page caps ("showing first N").

**Execution note:** test-first for the Html escaping tag — this is the XSS boundary.

**Test scenarios:** titles like `<script>alert(1)</script>` and `" onmouseover=` render inert; raw() passes trusted fragments; layout escapes page titles.

**Verification:** dev browser pass with a maliciously named event/guild renders as text everywhere it appears.

- [x] **Unit 6: Dashboard actions — leave, detach, reattach, delete**

**Goal:** The same four mutations as Discord, with confirm steps, PRG redirects, and audit lines.

**Requirements:** R6 (actions)

**Dependencies:** Units 1, 4, 5 (and 3's leave service path).

**Files:**
- Create: `src/Dashboard/Actions.ts`
- Modify: `src/Dashboard/Views.ts` (confirm pages/buttons)
- Test: covered by AdminActions tests (Unit 1) + Auth POST guards (Unit 4); no new pure logic expected — note if any emerges

**Approach:**
- POST-only, confirm page for leave and delete (drift-style double confirm not needed here), redirect-after-post back to the referring view with a flash-style query message.
- All four call `AdminActions` with owner scope — behavior identical to Discord by construction; winston audit line per mutation (`surface: 'web'`).

**Test scenarios:** (manual) delete racing a registration click — click loses politely (Unit 2's active-filter), embed edit benign-404s.

**Verification:** each action from the browser produces the identical end state as its `/admin`//event counterpart on a matching fixture guild.

- [x] **Unit 7: Drift report + docs/rollout**

**Goal:** The owner can find and fix ghost guilds, dead channels, and vanished mirrors; the exposure story is documented.

**Requirements:** R7

**Dependencies:** Units 1, 4, 5.

**Files:**
- Create: `src/Dashboard/Drift.ts`
- Modify: `src/Dashboard/Views.ts`, `README.md`
- Test: `src/Dashboard/Drift.test.ts` (pure classifiers: given cache sets + event docs + mirror-check results → categorized findings)

**Approach:**
- Scan is a POST (on-demand), refused unless `client.isReady()`; classifiers are pure functions over (guild cache ids, distinct event guild/channel ids, mirror existence results).
- Checks: ghost guilds (active events where bot absent — cleanup deactivates + best-effort mirror deletes, **second confirm required**); dead channels (`channels.fetch` 10003 only, concurrency-capped, detached channels badged not flagged); vanished mirrors (`scheduledEvents.fetch(id, {force: true})` → 10070 clears the stale `scheduledEventId`).
- README: new env vars; exposure tiers (localhost default / **Tailscale recommended for phone** / Caddy+TLS if public, with warnings); note that rotating `ADMIN_TOKEN` logs out all browsers; compose port mapping example.

**Execution note:** test-first for the classifiers.

**Test scenarios:** classifier matrix — guild in cache+events (healthy), events w/o guild (ghost), detached channel not double-flagged, mirror 10070 vs healthy vs fetch-error (error ≠ vanished).

**Verification:** dev-guild smoke — kick the bot from a test guild, scan flags it, cleanup clears it; a deliberately detached channel appears badged, not dead; scan against a not-ready client refuses.

## System-Wide Impact

- **Interaction graph:** `AdminActions` becomes the single mutation path (DeleteCommand refactors onto it); `postNewMessageAndUpdate` gains the detach chokepoint every creation surface inherits; the quarantine path writes ChannelState + deletes mirrors (behavior improvement, logged); a new HTTP listener and new signal handlers join `app.ts` without touching the crash-containment policy.
- **Error propagation:** unchanged model — HTTP handlers get their own containment (async wrapper → 500 page); EADDRINUSE explicitly cannot kill the bot; mirror-cleanup failures never abort detach/leave loops.
- **State lifecycle risks:** ChannelState cache is single-process by assumption (documented); leave-guild is ordered so no ghost mirrors survive; drift cleanup is confirm-gated against cold-cache false positives; registration-click race closed by the active-filter.
- **API surface parity:** R6 enforced by construction (shared service); `/admin` and dashboard copy must both state the lazy button-greying behavior.
- **Integration coverage:** pure tests cover auth math, escaping, classifiers, idempotency; the browser/dev-guild smoke lists per unit are the integration gate (repo's established model).
- **Affected parties:** owner (new surfaces + env vars), guild users (only detached channels behave differently), ops (compose port, exposure tiers, SIGTERM semantics under pm2).

## Risks & Dependencies

- **Internet-exposed admin surface** (owner's chosen tier): mitigations are the entire Unit 4 design; residual risk documented in README tiers with Tailscale as the recommended posture.
- **Express dependency tail**: accepted consciously; npm audit surfaces it; the panel imports only core + cookie-parser.
- **Cold-cache drift false positives**: ready-gate + double confirm; worst case is deactivation (recoverable — events reactivatable via Mongo, mirrors not) — hence confirm copy must say what cleanup does.
- **Single-process assumption** for the ChannelState Set: breaks if the bot ever shards/multi-processes — noted here and in code comments; acceptable at <100 guilds.
- **Prerequisites**: PRs #4–#6 must merge first; Phase A/B are pure Discord-side and could ship while the dashboard is still in review.

## Documentation / Operational Notes

- README: env vars (`OWNER_USER_ID`, `ADMIN_PORT`, `ADMIN_TOKEN`, bind/secure flags), exposure tiers with explicit warnings, token rotation behavior, compose example.
- Winston audit lines on every owner mutation (actor, surface, target, outcome) — the debugging substitute for the out-of-scope audit trail.
- Rollout: Phase A/B deployable like any bot release; Phase C additionally needs the compose port + token provisioning; no data migration (new collection only).

## Sources & References

- **Origin document:** [docs/brainstorms/2026-07-09-admin-dashboard-requirements.md](../brainstorms/2026-07-09-admin-dashboard-requirements.md); ideation: docs/ideation/2026-07-09-admin-dashboard-ideation.md
- Related code: `src/Calendar/Services/` (new), `src/Calendar/Interactions/`, `src/Calendar/Classes/Message.ts`, `src/Calendar/Handlers/CalendarReminders.ts`; PRs #4, #5, #6
- OWASP CSRF/Authentication/XSS-Prevention cheat sheets; Node crypto docs (timingSafeEqual); Express 5 release/support docs; htmx releases (evaluated, not adopted); Discord guild-scheduled-event docs; discord.js 14.26.4 installed typings/source (force-fetch pitfall, GuildOwned, status-transition rules)
