---
date: 2026-07-09
topic: admin-dashboard
---

# Admin Dashboard & Ops Track (detach primitive → /admin → web dashboard)

## Problem Frame

The bot owner has no way to see where the bot operates (guilds, channels, events) or to make it stop operating somewhere, short of raw MongoDB queries, log-grepping, or hand-editing documents. The original wish — "a web dashboard to see channels/events and leave channels" — decomposes against Discord's model: bots cannot leave channels, only guilds. This track builds the honest primitives (channel detach, guild leave with cleanup) and layers two owner surfaces over them: a minimal `/admin` slash suite and a token-protected web dashboard served from the bot process. Origin ideation: `docs/ideation/2026-07-09-admin-dashboard-ideation.md` (ideas 1–3).

## Requirements

- R1. **Channel detach**: detaching a channel deactivates all its events (registration buttons report closed, native scheduled-event mirrors are cancelled, reminders stop) and blocks new event creation there with a clear ephemeral message. Detach is **reversible**: re-attaching lifts the creation block; previously deactivated events stay deactivated.
- R2. Detached state **persists across restarts** and is enforced at both event creation and reminder time.
- R3. **`/admin` slash suite, bot-owner only** (gated on an owner id from configuration; other users get a polite rejection): guild overview (name, id, active event count), per-guild event list (channel, title, date, registration count), leave guild (with confirm button), detach / re-attach channel. All replies ephemeral.
- R4. **Leaving a guild cleans up**: the bot leaves via the API and deactivates that guild's events in the same action — no ghost reminders or orphaned native events remain.
- R5. **Web dashboard served from the bot process** on an exposed, **token-protected** port: a long secret from configuration, entered once per browser and remembered; every page and action requires it. Usable from a phone browser. Auth is structured so a Discord-OAuth upgrade later is a swap, not a rewrite.
- R6. **Dashboard views and actions**: guild list with event counts → channel drill-down with events → event detail including per-option registrations. Actions: leave guild (confirm step), detach / re-attach channel, delete event. Dashboard actions behave **identically** to their Discord counterparts (one shared behavior, two surfaces).
- R7. **Drift report** view: ghost guilds (bot no longer a member but active events exist), dead channels, native scheduled events that vanished — each row with a one-click cleanup.
- R8. **Phased delivery**, each phase shippable and useful alone: Phase A = R1+R2 (primitive), Phase B = R3+R4 (/admin), Phase C = R5–R7 (dashboard).

## Success Criteria

- From a phone browser, the owner can answer "which guilds/channels is the bot in, and what events exist" in under a minute, without Mongo or logs.
- The bot can be made to fully and reversibly stop operating in any chosen channel, from Discord or the web.
- Leaving a guild leaves zero ghost events, reminders, or native mirrors behind.
- Users in untouched guilds/channels observe no behavior change from this entire track.

## Scope Boundaries

- **No health panel or /health endpoint in v1** — explicitly excluded by the owner during scoping.
- **Owner-only, both surfaces** — no guild-admin access, no Discord OAuth in v1 (the auth seam merely anticipates it).
- **Management only on the web** — event creation/editing stays in Discord; the dashboard deletes/detaches/leaves but does not author.
- No metrics/analytics, no audit trail, no per-guild settings beyond the detach list (ideation rejections stand).
- Dashboard is English-only (owner-facing; the user-facing dictionary is untouched).

## Key Decisions

- **Full track in one phased effort (A→B→C)**: primitive first, `/admin` as the zero-infra v0 that also proves the aggregate queries, dashboard last.
- **Detach = full stop + reversible**: deactivation plus creation-block, not creation-block alone (the bot should genuinely vacate) and not message deletion (destroys registration history irreversibly).
- **Token-protected public port** over localhost-only or OAuth-first: owner wants phone access without SSH tunnels; accepted trade-off is an internet-reachable port, so token handling must be taken seriously in planning (long secret, constant-time compare, no token in URLs after first entry).
- **Bot owner only**: guild admins route requests through the owner; halves the permission logic for v1.
- **"Leave channels" reframed** as detach (channel) + leave (guild): the literal ask is impossible in Discord's permission model.
- **Dashboard delete = `/event delete`**: one behavior for destructive actions regardless of surface.

## Dependencies / Assumptions

- Builds on the interaction-native surface (PRs #4–#6 must land first); detach enforcement hooks the same creation/reminder chokepoints that branch introduced.
- Assumes single-process deployment stays (dashboard shares the bot process and its Discord cache/Mongo connection).

## Outstanding Questions

### Resolve Before Planning

(none)

### Deferred to Planning

- [Affects R5][Technical] HTTP server choice (node:http vs express/fastify) and server-rendered templating approach (htmx or plain HTML forms) — pick for zero build-step and lowest carrying cost.
- [Affects R5][Technical] Token entry/storage UX (login form → cookie vs basic auth), constant-time comparison, and whether to rate-limit attempts.
- [Affects R1, R2][Technical] Where detached-channel state lives (dedicated collection vs a guild-settings document) — decide together with R7's data needs.
- [Affects R7][Technical] Drift detection mechanics: cache-only vs REST verification, batching, and how expensive vanished-native-event checks are.
- [Affects R5][Needs research] Serving all dashboard assets self-contained from the bot container (no CDNs), and any reverse-proxy/TLS guidance to document for the exposed port.

## Next Steps

→ `/ce:plan` for structured implementation planning
