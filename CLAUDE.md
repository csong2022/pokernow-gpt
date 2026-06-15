# pokernow-gpt — architecture & boundary rules

## Layout: core / live / arena

This codebase is being refactored toward a three-part layout. Keep new code on
the correct side of the seam.

- **core** (`src/core/**`) — the environment-agnostic "poker brain": LLM provider
  abstraction (`src/core/ai/`), prompt construction
  (`src/core/poker/query-construction.helper.ts`), domain models
  (`src/core/game/`, `src/core/player/`), and (eventually) decision logic and
  opponent-stats. Core knows poker, not *where* the game is played.
- **live** — the existing PokerNow adapter: Puppeteer browser automation, log
  scraping, action execution, and the HTTP API. Currently spread across
  `src/bot/` (`state-builder.ts`, `action-executor.ts`, etc.),
  `src/services/{puppeteer,logs,db}/`, and `src/http/`. Depends on core.
- **arena** — a future multi-LLM benchmark on an owned poker engine. Depends on
  core. **Not built yet — do not scaffold it.**

## The seam

State goes **in** to core; actions come **out**. Today that crossing happens via
the live adapter's `state-builder` (state in) and `action-executor` (actions
out).

**Rule: `src/core/**` must never import live/adapter code.** Forbidden modules:

- `puppeteer.service`
- `log.service`
- `log-processing`
- `message-processing`
- `action-executor`
- `state-builder`
- anything under `http/` (the REST API)

(Note: `src/services/db/` is not yet on the forbidden list, but core importing a
DB service is still a smell — see the roadmap below.)

## Enforcement

A lightweight checker scans every import under `src/core` and flags references to
the forbidden modules. No ESLint dependency — it runs on the existing `tsx`.

```sh
npm run check:boundaries          # report mode: print violations, exit 0
npx tsx scripts/check-boundaries.ts --strict   # CI mode: exit 1 on any violation
```

`pretest` runs the checker (report mode), so `npm test` surfaces violations
without blocking. Once the roadmap below is cleared and core is clean, switch CI
to `--strict`.

## Boundary status: core is clean (0 violations)

The two PokerNow log/message parsers that used to sit in `src/core/poker/` now
live in **`src/live/pokernow/`** (`log-processing.util.ts`,
`message-processing.util.ts`) — the first occupants of the `live` adapter root.
The `Action` domain enum was lifted to `src/core/poker/action.enum.ts` so both
core (`PlayerAction`) and the live parsers can share it without core depending on
live. `Table` no longer parses raw PokerNow messages: the adapter
(`src/bot/state-builder.ts`) parses and passes the stack map in via
`Table.setIdToStack(...)`.

`npm run check:boundaries` reports **0 violations**. Once the rest of the live
migration (below) lands, switch CI to `--strict`.

## Migration roadmap (still outstanding — not yet addressed)

These are on the seam but not yet flagged/fixed:

1. **Rest of the live adapter still under `src/bot/` and `src/services/`** —
   `puppeteer.service`, `services/logs/log.service`, `action-executor`,
   `state-builder`, the bot lifecycle, and `http/*` should migrate into
   `src/live/` in later commits.
2. `src/core/game/table.model.ts` → imports
   `src/services/db/playerstatsapi.service.ts` (DB service). Not on the forbidden
   list, but core depending on a DB service is a smell — inject it instead.
3. `src/bot/decision-engine.ts` imports `PuppeteerService` (live) alongside core
   query helpers — it straddles the seam and needs splitting.
4. `src/bot/hand-state.ts` is already clean (core models/interfaces only) — an
   easy future move into core.

## Commands

- Run the server: `npx tsx src/index.ts` (Express on `http://localhost:8080`)
- Tests: `npm test` (Mocha, specs in `test/unit/*.spec.ts`; `pretest` runs the
  boundary checker)
- Type-check: `npx tsc --noEmit` (tsconfig sets `noEmit`; there is no build step)
