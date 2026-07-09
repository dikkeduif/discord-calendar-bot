---
date: 2026-07-09
topic: admin-dashboard
focus: web dashboard — see which channels the bot is in, which events exist, and leave channels
---

# Ideation: Admin Dashboard & Bot Ops Surface

## Codebase Context

discord-calendar-bot: solo-maintained TypeScript (non-strict) Discord calendar bot. Node 22, discord.js 14.26.4 (freshly migrated), mongoose 6 + typegoose 10 (Event + User collections), mocha pure-logic tests, winston JSON logs, env-var settings, Docker + docker-compose (bot + mongo), Jenkins image builds. Hobby scale: <100 guilds, `docker-compose up` simplicity valued.

Grounding facts that shaped ideation:
- **No web/HTTP layer exists at all** — no express, no exposed bot ports, no auth of any kind.
- **No ops surface** — guild/channel/event visibility today means raw Mongo queries or log-grepping.
- **Discord bots cannot leave a channel** — only a whole guild (`guild.leave()`). All five ideation frames independently converged on decomposing "leave channels" into *detach channel* (deactivate events + deny-list) and *leave guild*.
- The dead-channel quarantine (commit 9184c2c) already deactivates a channel's events on 404 — the detach primitive is that mechanism with a deliberate trigger.
- No per-guild config; guild knowledge is denormalized onto Event docs + the ephemeral discord.js cache.

Process: 5 framed ideation agents (pain, unmet need, inversion, reframing, leverage) → 42 raw ideas → ~24 after dedupe → orchestrator synthesis of composites → adversarial filter → 7 survivors.

## Ranked Ideas

### 1. Embedded admin dashboard served from the bot process
**Description:** Server-rendered HTML (htmx/EJS, no build toolchain) from a small HTTP listener inside the existing bot container; one new port in docker-compose. Views: guilds → channels → events with registration counts, reminder status, quarantined channels. Actions: leave guild, detach channel (idea 2), deactivate event — all calling service functions extracted from the interaction handlers so web and slash surfaces share one mutation path. Auth: bearer token from env (or localhost-only port binding), built as a middleware seam so Discord OAuth2 (guild-admin self-service) can slot in later without a rewrite.
**Rationale:** Directly the owner's ask, shaped to the repo: no frontend build, no separate deployment, rides existing models + client cache. The HTTP layer is also the platform seed for health/metrics/OAuth later.
**Downsides:** First-ever HTTP surface on a hobby bot = new attack/maintenance surface; needs the token/binding story taken seriously.
**Confidence:** 85%
**Complexity:** Medium
**Status:** Explored

### 2. Channel detach + blocklist primitive (the real "leave channel")
**Description:** A deliberate trigger for the existing dead-channel quarantine (deactivate all the channel's events, cancel native mirrors) plus a per-channel deny-list checked at /event create and reminder time. Exposed to whatever surface exists (dashboard button, /admin command).
**Rationale:** "Leave a channel" is impossible in Discord's model; this is the honest primitive every surface needs. Reuses shipped, hardened code.
**Downsides:** Introduces the first per-guild-ish config storage; deny-list semantics need defining (block creation only vs also mute reminders).
**Confidence:** 95%
**Complexity:** Low-Medium
**Status:** Explored

### 3. Owner-only /admin slash suite (dashboard v0)
**Description:** Owner-gated ephemeral commands: /admin guilds (counts per guild), /admin events <guild>, /admin leave <guild> with confirm button, /admin detach <channel>. Zero new infrastructure; works from a phone.
**Rationale:** Delivers ~70% of the visibility+control value in a day on the freshly built interaction plumbing, and forces the dashboard's aggregate queries to exist as testable functions first.
**Downsides:** Owner-only UX in Discord is clunkier than a web page for big lists; partial overlap with idea 1.
**Confidence:** 90%
**Complexity:** Low
**Status:** Explored

### 4. Guild registry + Mongo↔Discord reconciliation
**Description:** A Guild collection (guildId, name, joinedAt, config) populated by guildCreate/guildDelete plus a ready-time sweep; a drift report diffing Mongo against the client cache (ghost guilds with active events, dead messageIds, vanished native events) with one-click cleanup.
**Rationale:** Any dashboard lies without reconciliation; also the substrate for per-guild config, premium flags, growth analytics.
**Downsides:** New collection + sweep logic; drift cleanup actions need care.
**Confidence:** 80%
**Complexity:** Medium
**Status:** Unexplored

### 5. /health endpoint + docker-compose healthcheck
**Description:** Gateway status, Mongo readyState, reminder-loop last-tick, active-event count; wired into a compose healthcheck.
**Rationale:** A wedged reminder loop currently looks "up" in docker until users notice missing pings.
**Downsides:** None material once an HTTP listener exists (idea 1); standalone it needs its own tiny listener.
**Confidence:** 95%
**Complexity:** Low
**Status:** Unexplored

### 6. Owner push notifications (join/leave/quarantine + weekly census DM)
**Description:** DM or webhook on guild join/leave and quarantine firings; optional weekly census DM with per-guild Leave buttons.
**Rationale:** Push complements pull — a hobby-scale dashboard gets visited rarely; notifications arrive exactly when state changed.
**Downsides:** DM fatigue if untuned; overlaps idea 3's surface.
**Confidence:** 75%
**Complexity:** Low
**Status:** Unexplored

### 7. One-command Mongo backup/restore (off-focus, flagged)
**Description:** `npm run backup`/`restore` via mongodump in the compose mongo container + optional nightly rotated dumps to a volume; last-backup age on /health.
**Rationale:** The entire product is one docker volume; `docker-compose down -v` erases everything. Highest-severity latent risk found while grounding.
**Downsides:** Off the dashboard focus.
**Confidence:** 90%
**Complexity:** Low
**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Full Discord OAuth2 guild-admin dashboard | Premature until guild-admin self-service matters; kept as idea 1's designed-for phase 2 |
| 2 | mongo-express compose service | Stopgap covered by idea 1; third-party write UI over prod data is its own risk |
| 3 | Ops CLI via compose exec | Duplicates idea 3 with a worse surface (no phone, no buttons) |
| 4 | Static HTML snapshot export | Loses the control half; stale by definition |
| 5 | Census log line + jq recipes | Weaker than ideas 3+5 combined |
| 6 | Idle-guild auto-departure policy | Auto-leaving guilds is surprise-hostile; the decision is rare enough to stay manual |
| 7 | Event audit trail / activity feed | Valuable but independent of this need; revisit with idea 1 phase 2 |
| 8 | Standalone per-guild config collection | Folded into ideas 2 and 4 |
| 9 | Service-layer extraction | Implementation posture, folded into idea 1 |
| 10 | Guild-admin channel allowlist | Folded into idea 2's deny-list design space |
| 11 | Discord ops-channel live embeds | Folded into ideas 3/6 (Discord-native path) |
| 12 | Auth-as-middleware seam | Folded into idea 1 |

## Session Log
- 2026-07-09: Initial ideation — 42 generated (24 after dedupe), 7 survived. Ideas 1-3 (dashboard track) handed to ce:brainstorm same day.
