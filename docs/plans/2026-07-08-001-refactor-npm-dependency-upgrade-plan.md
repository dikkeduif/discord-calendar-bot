---
title: "refactor: Update npm dependencies (except discord.js)"
type: refactor
status: active
date: 2026-07-08
---

# refactor: Update npm dependencies (except discord.js)

## Overview

Bring every retained npm dependency of the Discord calendar bot up to the newest version compatible with the project's real constraints (CommonJS module system, tslint-capped TypeScript 4, mongoose-6 line), remove five dependencies that research proved are dead code, and clean up deprecated `@types` stubs. discord.js stays on the v12 line — the v14 migration is explicitly out of scope as a bigger change, and the same "bigger change" rationale defers mongoose 7+, TypeScript 5+, and ESM-only package majors.

## Problem Frame

The project (branch `feature/upgrade_2026`) has not had its dependencies updated in years. `npm outdated` shows every package behind, several by multiple majors. The user asked to "update npm packages, except for discord.js since that is a bigger change." Research (2026-07-08) established:

- Five dependencies are **never imported**: `luxon`, `joi`, `sequelize`, `mysql2`, `big-integer`. The bot is MongoDB-only. User confirmed these should be **removed**, not updated.
- The actually-exercised runtime deps are: discord.js, moment-timezone, @typegoose/typegoose, mongoose, nanoid, node-emoji, confidence, winston — plus `validator`, which is imported in `src/Calendar/Handlers/ModifyHandler.ts` but only installed transitively via sequelize (a landmine once sequelize is removed).
- The test suite is a single **empty** file (`src/Tests/maintest.ts`); the only real gates are `tsc`, `tslint`, and a manual boot. Verification must lean on compile + lint + runtime smoke checks.

## Requirements Trace

- R1. Every retained dependency is updated to the latest version compatible with the constraints below (no package silently left behind without a documented reason).
- R2. discord.js remains on the `^12.5.x` line, untouched.
- R3. Dead dependencies (`luxon`, `joi`, `sequelize`, `mysql2`, `big-integer`) and deprecated type stubs (`@types/mongoose`, `@types/winston`, `@types/sequelize`, `@types/luxon`) are removed without breaking compile or runtime (user-confirmed scope).
- R4. `npm run build` (mocha + tslint + tsc) passes, the Docker image builds, and the bot boots and passes a manual smoke checklist.

## Scope Boundaries

Deferred as "bigger changes" (same rationale the user applied to discord.js):

- **discord.js 12 → 14** (explicit user exclusion).
- **mongoose 7/8/9 + typegoose 11/12/13**: typegoose peer-pins mongoose per line (verified via npm registry: typegoose 12.x → mongoose ~8.x, typegoose 13.4 → mongoose ~9.7 + Node ≥20.19). Leaving the mongoose-6 line is a coupled two-package migration with behavior changes (`strictQuery` flip, ObjectId changes) — separate effort.
- **TypeScript 5/6**: tslint is EOL (2019) and only tested through TS 4. Bumping TS past 4.9.5 requires a tslint → eslint migration first — separate effort.
- **nanoid 4/5 and any ESM-only major**: the project compiles to CommonJS (`tsconfig.json`: `module: commonjs`); nanoid ≥4 ships no `require` entry point (verified: v5 exports map has no `require` condition).
- **Adding a real test suite** — recommended follow-up, not part of this upgrade.
- **Dockerfile refactor** — one ops recommendation is noted (pin `node:latest`, drop build-time `npm update`) but is optional and not a unit of this plan.

## Context & Research

### Relevant Code and Patterns

- `src/Entities/Mongoose.ts` — singleton mongoose connection (`mongoose.connect` with empty options, top-level, unawaited).
- `src/Calendar/Models/{Event,User,Guild}.ts` — typegoose classes: `@prop()` decorators, `getModelForClass(Cls, { existingMongoose, schemaOptions: { timestamps: true } })`, statics typed `ReturnModelType<typeof Cls>`. All queries are promise/await style (no callbacks).
- `src/Calendar/Handlers/ModifyHandler.ts` — `import validator from 'validator'` (the transitive-dep landmine).
- `src/Calendar/Validation/EmojiValidation.ts` — sole node-emoji call site: `Emoji.hasEmoji(name)`.
- `src/Calendar/Classes/SessionManager.ts` — nanoid `customAlphabet(...)` usage.
- `src/Calendar/Handlers/CreateHandler.ts` — `moment_tz.tz.zonesForCountry(input)`; `src/Calendar/Validation/DateValidation.ts` — strict-format parsing `moment.tz(str, 'DD-MM-YYYY HH:mm', tz)`.
- `tsconfig.json` — `"types": ["@types/node", "@types/sequelize"]` (must be edited when `@types/sequelize` is removed); `experimentalDecorators` + `emitDecoratorMetadata` on; strict mode off; `skipLibCheck: true`.
- `Dockerfile` — base image `node:latest` (floating), runs `npm update && npm install` at build time, compiles with tsc, runs `pm2-runtime dist/app.js`.
- All source files carry a GPL-3.0 header block — keep that pattern in any new files.

### Institutional Learnings

- None — `docs/solutions/` does not exist in this repository.

### External References (verified 2026-07-08 via npm registry)

- typegoose peer matrix: 9.13.2 → mongoose ~6.7.2 (**conflicts** with mongoose 6.13); **10.6.0 → mongoose ~6.13.0** (the correct pairing); 11.x → ~7.x; 12.x → ~8.x; 13.4.0 → ~9.7.3 + Node ≥20.19.
- nanoid 3.3.15 ships `index.cjs` (CJS-safe); nanoid 5 exports map has no `require` condition (ESM-only).
- node-emoji 2.2.0 exports map **has** a `require` entry (`./lib/index.cjs`) — CJS-safe despite `type: module`; API renamed `hasEmoji()` → `has()`.
- mocha 11.7.6 engines: `^18.18.0 || ^20.9.0 || >=21.1.0` — fine (dev machine Node 22.20, Docker `node:latest`).
- ts-node 10.9.2 peer: `typescript >=2.7` — compatible with TS 4.9.5.
- tslint 6.1.3 is the newest tslint (npm's `latest` dist-tag misleadingly points at 5.20.1 — do not "downgrade" to it).
- luxon ships no bundled types in either v1 or v3 (moot after removal, recorded for posterity).

## Key Technical Decisions

- **Stay on the mongoose-6 line, pair typegoose 10.6.0 with mongoose ~6.13.10**: staying on typegoose 9.13 would violate its `mongoose ~6.7.2` peer range once mongoose moves to 6.13; typegoose 10.6.0 peer-pins `~6.13.0` exactly. Use a tilde range on mongoose (`~6.13.10`) so npm cannot drift past the peer window. 6.13.x is the final mongoose 6 line.
- **Cap TypeScript at ^4.9.5**: tslint gate (see Scope Boundaries). `^4.9.5` can never resolve to 5.x, so the cap is self-enforcing.
- **Promote `validator` to a direct dependency** (keep `@types/validator`): zero behavior change versus rewriting `isNumeric` by hand, and it makes an already-real runtime dependency explicit.
- **node-emoji 2 is in scope** (not deferred as ESM-only): verified CJS entry point; only one call site changes.
- **moment-timezone to 0.6.2** rather than stopping at 0.5.48: engines are unrestricted and its only dependency is `moment ^2.29.4`, but 0.x minors are semver-major, so the smoke checklist must exercise `zonesForCountry` and strict-format parsing.
- **@types/node targets ^22.x**, matching the dev machine (Node 22.20) and a modern LTS, not `@types/node@26` (latest): the runtime is `node:latest` (floating/unknown), so types should track the version the team actually develops and should pin against — see ops note.
- **Regenerate the lockfile once, cleanly**: the working tree already has an uncommitted 4510+/4510− format-only rewrite of `package-lock.json`. Discard it and let Unit 1's install regenerate the lockfile (accepting a lockfileVersion 2→3 bump from modern npm) so every subsequent lockfile diff reflects real dependency changes.
- **Split dev-only packages into `devDependencies`**: everything currently sits in `dependencies`. Safe with the current Dockerfile flow (it runs a full `npm install` and compiles inside the image, and `NODE_ENV` is only set at compose runtime), and it makes the production dependency surface honest.

## Open Questions

### Resolved During Planning

- Do dead deps get updated or removed? — **Removed** (user decision, 2026-07-08).
- Does removing sequelize break anything? — Yes, two things: the transitive `validator` used by `ModifyHandler.ts` (fix: direct dep) and the `@types/sequelize` entry in tsconfig `"types"` (fix: edit tsconfig).
- Can mongoose go to 6.13 with typegoose 9? — No; peer conflict. Typegoose must go to 10.6.0 in the same change.
- Is node-emoji 2 usable from CommonJS? — Yes (verified `require` export); one API rename at one call site.
- Can nanoid leave 3.x? — No (ESM-only from v4); update in-range to 3.3.15.

### Deferred to Implementation

- Exact type-level fallout of typegoose 9→10 in the three model files — knowable only from `tsc` output; usage is basic (`@prop`, `getModelForClass`, `ReturnModelType`), so expected small.
- Whether mongoose 6.0→6.13 emits a `strictQuery` deprecation warning at boot — cosmetic if so; decide whether to set the option explicitly when seen.
- Whether `zonesForCountry` output or strict-parse behavior shifts under moment-timezone 0.6 + new tzdata — verified via smoke checklist, not predictable from the changelog.

## Target Versions Summary

| Package | Current | Target | Class |
|---|---|---|---|
| @typegoose/typegoose | ^9.1.0 | ^10.6.0 | major (coupled with mongoose) |
| mongoose | ^6.0.10 | ~6.13.10 | in-range (tilde-pinned for peer) |
| moment-timezone | ^0.5.32 | ^0.6.2 | 0.x major, verify behavior |
| node-emoji | ^1.10.0 | ^2.2.0 | major, one call-site rename |
| nanoid | ^3.1.20 | ^3.3.15 | in-range (ESM cap) |
| winston | ^3.3.3 | ^3.19.0 | in-range |
| confidence | ^5.0.0 | ^5.0.1 | in-range |
| validator | (transitive) | ^13.15.x | **new direct dep** |
| @types/validator | ^13.1.0 | ^13.15.10 | in-range |
| typescript | ^4.1.2 | ^4.9.5 | in-range (tslint cap) |
| ts-node | ^9.0.0 | ^10.9.2 | major, dev-only |
| mocha | ^8.2.1 | ^11.7.6 | major, dev-only |
| @types/mocha | ^8.0.4 | ^10.0.10 | major, dev-only |
| @types/node | ^14.14.10 | ^22.x | major, dev-only |
| tslint | ^6.1.3 | ^6.1.3 | unchanged (EOL; newest) |
| discord.js | ^12.5.1 | unchanged | **excluded by user** |
| luxon, @types/luxon, joi, sequelize, @types/sequelize, mysql2, big-integer, @types/mongoose, @types/winston | — | **removed** | dead code / deprecated stubs |

## Implementation Units

- [ ] **Unit 1: Reset lockfile baseline and prune dead dependencies**

**Goal:** Start from a clean, verified baseline and remove all dead dependencies plus deprecated type stubs, fixing the two known fallout points.

**Requirements:** R3, R4

**Dependencies:** None

**Files:**
- Modify: `package.json` (remove luxon, @types/luxon, joi, sequelize, @types/sequelize, mysql2, big-integer, @types/mongoose, @types/winston; add validator)
- Modify: `tsconfig.json` (drop `@types/sequelize` from the `"types"` array)
- Modify: `package-lock.json` (regenerated)
- Verify unchanged: `src/Calendar/Handlers/ModifyHandler.ts` (its `validator` import must still resolve — now from the direct dep)

**Approach:**
- First discard the uncommitted format-only `package-lock.json` rewrite and confirm the baseline build (`test + lint + compile`) passes before touching anything, since there is no test safety net to catch a bad starting state.
- Remove the nine packages, add `validator ^13.15.x` as a direct dependency, edit the tsconfig `types` array, regenerate the lockfile (accept lockfileVersion 3).
- Sweep `src/` to confirm no import of any removed package remains.

**Test scenarios:**
- Compile succeeds with `@types/sequelize` absent from both package.json and tsconfig.
- `ModifyHandler`'s numeric validation path still works (validator resolves as a direct dep).
- No residual imports of removed packages anywhere under `src/`.

**Verification:**
- `npm run build` passes from a clean `node_modules` install.
- The lockfile diff shows only real removals/additions, not format churn.

- [ ] **Unit 2: In-range runtime dependency updates**

**Goal:** Take every remaining update that stays within the current major and requires no code changes: winston 3.19, confidence 5.0.1, nanoid 3.3.15, @types/validator 13.15, typescript 4.9.5.

**Requirements:** R1

**Dependencies:** Unit 1

**Files:**
- Modify: `package.json`, `package-lock.json`

**Approach:**
- Pure version bumps; no source changes expected. TypeScript 4.9.5 is the ceiling (tslint cap) — confirm tslint still runs clean against it since 4.4→4.9 introduces new checks that can surface fresh compile diagnostics.
- nanoid stays `^3.x` deliberately; record the ESM cap as a comment-free constraint here in the plan, not in code.

**Patterns to follow:**
- `src/Bot/Logger.ts` custom formatter uses `Symbol.for('message')` — a stable winston 3 API; no change expected, but it is the one winston surface to eyeball if compile or boot complains.

**Test scenarios:**
- `tsc` under 4.9.5 produces no new errors across the ~29 source files (strict mode is off, so risk is low).
- Logger still emits formatted JSON lines at boot.
- Session short-IDs still generate (nanoid `customAlphabet` path in `SessionManager`).

**Verification:**
- `npm run build` passes; bot boots locally and logs output through the winston formatter.

- [ ] **Unit 3: Coupled data-layer update — typegoose 10.6.0 + mongoose ~6.13.10**

**Goal:** Move the persistence stack to the end of the mongoose-6 line with the matching typegoose major, keeping the peer-dependency pair consistent.

**Requirements:** R1

**Dependencies:** Unit 2 (TypeScript 4.9.5 in place first — typegoose 10 targets modern TS 4)

**Files:**
- Modify: `package.json`, `package-lock.json`
- Possibly modify: `src/Calendar/Models/Event.ts`, `src/Calendar/Models/User.ts`, `src/Calendar/Models/Guild.ts`, `src/Entities/Mongoose.ts` (only if typegoose 10 type changes surface in `tsc`)

**Approach:**
- Bump both packages in one change so no intermediate state has a violated peer range; tilde-pin mongoose (`~6.13.10`) to stay inside typegoose 10.6's `~6.13.0` peer window.
- Review the typegoose 9→10 changelog against the actual usage surface (`@prop` with `index`/`default`/`enum`/`type`, `getModelForClass` with `existingMongoose`, `ReturnModelType` statics, `mongoose.Types.ObjectId`, `mongoose.Types.Map`); expected fallout is type-level only.
- Watch boot output for a mongoose `strictQuery` deprecation notice; set the option explicitly only if it appears (deferred question).

**Test scenarios:**
- All three models compile and `getModelForClass` still binds to the singleton connection.
- Event create / find / findOneAndUpdate round-trips against the compose `mongo` container.
- Reminder polling loop (`CalendarReminders` `setInterval` → `getForReminders` → `findOneAndUpdate`) processes a due event.

**Verification:**
- `npm run build` passes; a manual event-create → reminder-fire cycle works against a local MongoDB.

- [ ] **Unit 4: Small-code-impact majors — node-emoji 2, moment-timezone 0.6, dev-tooling majors**

**Goal:** Land the remaining majors: node-emoji 2.2.0 (one call-site rename), moment-timezone 0.6.2, ts-node 10.9.2, mocha 11.7.6, @types/mocha 10.0.10, @types/node ^22.

**Requirements:** R1

**Dependencies:** Unit 3

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `src/Calendar/Validation/EmojiValidation.ts` (node-emoji v2: default-import `hasEmoji(name)` becomes the v2 API `has(name)`; adjust the import form to match v2's named exports)

**Approach:**
- node-emoji 2 is CJS-safe (verified `require` export); the rename is the only source change in this unit.
- moment-timezone 0.6 is a 0.x major: no API removals affecting this codebase are documented, but treat `zonesForCountry` and strict-format parsing as must-verify behaviors rather than assumed-safe.
- ts-node 10, mocha 11, @types/mocha 10, @types/node 22 are dev-only; the mocha suite is empty, so the meaningful checks are that `npm test` still exits cleanly, `npm run debug` / nodemon still launch through ts-node 10, and `tsc` accepts @types/node 22 (Node 14 → 22 types can surface new signatures, though `skipLibCheck` and non-strict mode blunt this).

**Test scenarios:**
- Emoji validation accepts a valid `:emoji:` name and rejects garbage (the `has()` path).
- `zonesForCountry('<country code>')` returns a plausible zone list in the create flow.
- `DateValidation` strict parse (`DD-MM-YYYY HH:mm`) still accepts valid input and rejects malformed dates.
- `npm test`, `npm run lint`, `npm run debug`, and nodemon all still run under ts-node 10.

**Verification:**
- `npm run build` passes; emoji and date/timezone flows behave correctly in a manual bot session.

- [ ] **Unit 5: package.json hygiene and end-to-end verification**

**Goal:** Split dev-only packages into `devDependencies`, then prove the whole upgrade end to end: clean install, Docker image build, boot, and the manual smoke checklist.

**Requirements:** R1, R2, R4

**Dependencies:** Units 1–4

**Files:**
- Modify: `package.json` (move typescript, tslint, ts-node, mocha, @types/mocha, @types/node, @types/validator to `devDependencies`; runtime deps remain: discord.js, moment-timezone, @typegoose/typegoose, mongoose, nanoid, node-emoji, confidence, winston, validator), `package-lock.json`
- Read-only check: `Dockerfile`, `docker-compose.yml`

**Approach:**
- `@types/validator` can live in devDependencies because `skipLibCheck`/compile-time only; if the Docker build ever switches to production-only installs, the compile step must run before pruning — note this in the commit, don't restructure the Dockerfile here.
- Confirm `docker build` still succeeds with the split (the Dockerfile runs a full install and compiles in-image; `NODE_ENV` is only set at compose runtime, so devDependencies still install — verify rather than assume).
- Confirm discord.js is byte-identical in range (`^12.5.1`) and nothing pulled it forward.

**Test scenarios:**
- Fresh clean install + build passes on the dev machine.
- `docker compose` brings up mongo + bot; bot logs in with a test token.
- Manual smoke checklist (the real gate, given the empty test suite): create an event, react to add/remove an attendee (`messageReactionAdd`/`messageReactionRemove` partials path), trigger the modify flow's numeric validation, exercise the timezone-selection flow, and observe one reminder-loop tick.

**Verification:**
- All of R4 holds: build green, image builds, bot boots, smoke checklist complete with no behavioral regressions attributable to the upgrade.

## System-Wide Impact

- **Interaction graph:** Discord `message` / `messageReactionAdd` / `messageReactionRemove` events → `Calendar` → handlers → validation (node-emoji, validator, moment-timezone) → typegoose models → mongoose singleton. The reminder `setInterval` loop is the only self-triggering path — it exercises mongoose reads/writes continuously, so a data-layer regression shows up there first.
- **Error propagation:** `mongoose.connect` is top-level, unawaited, and has no error handler; mongoose 6.0→6.13 keeps default operation buffering, so a connect failure still surfaces as delayed buffered-operation timeouts rather than a boot crash. Unchanged behavior, but worth knowing when smoke-testing.
- **State lifecycle risks:** None introduced; no schema or data migrations. `timestamps: true` schemas are untouched.
- **API surface parity:** None — the bot has no exported API; Discord commands are the surface, covered by the smoke checklist.
- **Integration coverage:** Zero automated coverage exists (empty test file). The manual smoke checklist in Unit 5 is the de facto integration suite for this change.

## Risks & Dependencies

- **No automated test safety net** — the dominant risk. Mitigation: per-unit `npm run build` gates, dependency-ordered small commits (easy bisect/revert), and the Unit 5 manual checklist targeting exactly the code paths whose packages changed.
- **typegoose 9→10 type fallout** — expected small given the basic decorator usage; contained to three model files; discovered at compile time.
- **moment-timezone 0.6 + refreshed tzdata** — could subtly change zone lists or parse edge cases; explicitly smoke-checked.
- **Dockerfile runs `npm update && npm install` at image build** — this can drift installed versions past the lockfile *inside the image*, partially bypassing this plan's pinning. See ops note.
- **`node:latest` base image is unpinned** — the runtime Node major is whatever Docker Hub serves on build day; discord.js 12 has run on it so far, but this is luck, not policy. See ops note.

## Documentation / Operational Notes

- **Recommended (out of scope, small follow-up):** pin the Dockerfile base image to an LTS (`node:22` matches the dev machine) and replace `npm update && npm install` with `npm ci` so images actually honor the lockfile this plan produces.
- `nodemon` is invoked by `npm run serve` but is not in package.json (assumed global) — optionally add it to `devDependencies` in Unit 5 for reproducibility; not required.
- README setup instructions are docker-compose oriented and unaffected by these changes.
- Follow-up worth its own effort: a minimal real test suite (the mocha harness is already wired; the suite is just empty), and the tslint→eslint migration that unlocks TypeScript 5+.

## Sources & References

- Planning input: user request (2026-07-08) — "update npm packages, except for discord.js since that is a bigger change"; scope decision same day: remove dead deps.
- Related code: `src/Entities/Mongoose.ts`, `src/Calendar/Models/`, `src/Calendar/Handlers/ModifyHandler.ts`, `src/Calendar/Validation/EmojiValidation.ts`, `tsconfig.json`, `Dockerfile`
- Version/compatibility facts: npm registry metadata (`engines`, `peerDependencies`, `exports`) queried 2026-07-08; typegoose↔mongoose peer matrix verified per-version.
