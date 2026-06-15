# pokernow-gpt — architecture & boundary rules

## Layout: core / live / arena

This codebase is being refactored toward a three-part layout. Keep new code on
the correct side of the seam.

- **core** (`src/core/**`) — the environment-agnostic "poker brain": LLM provider
  abstraction (`src/core/ai/`), prompt construction
  (`src/core/poker/query-construction.helper.ts`), domain models
  (`src/core/game/`, `src/core/player/`), decision logic
  (`src/core/poker/decision-engine.ts`), and (eventually) opponent-stats. Core
  knows poker, not *where* the game is played.
- **live** (`src/live/**`) — everything PokerNow-specific, depends on core:
  - `src/live/pokernow/` — the table adapter: Puppeteer driver
    (`puppeteer.service.ts`), log scraping (`log.service.ts`), log/message
    parsers, state building (`state-builder.ts`), action execution
    (`action-executor.ts`), and the `ActionAvailability` adapter.
  - `src/live/bot/` — the bot runner/lifecycle (`bot.ts`, `worker.ts`,
    `bot-manager.ts`, `eventemitters/`). `bot.ts` is the composition root that
    wires core + the pokernow adapter together.
  - `src/live/http/` — the REST control API (`controllers/`, `routes/`).
  (`src/services/db/` and `src/config/` remain outside `live/` for now.)
- **arena** — a future multi-LLM benchmark on an owned poker engine. Depends on
  core. **Not built yet — do not scaffold it.**

## The seam

State goes **in** to core; actions come **out**. Today that crossing happens via
the live adapter's `state-builder` (state in) and `action-executor` (actions
out).

**Rule: `src/core/**` must never import live/adapter code.** Forbidden modules:

- `puppeteer.service`
- `log.service`
- `log-processing.util` (the live parser; `log-processing.interface` is core)
- `message-processing.util`
- `action-executor`
- `state-builder`
- anything under `http/` (the REST API)
- anything under `services/db/` (DB services)

Core persists/reads player stats through the `PlayerStatsRepository` port
(`src/core/player/playerstats-repository.interface.ts`), which the DB service
implements and which is injected into `Table` — so core never imports a DB service.

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

The PokerNow adapter now lives under **`src/live/pokernow/`**: the log/message
parsers (`log-processing.util.ts`, `message-processing.util.ts`), the Puppeteer
driver (`puppeteer.service.ts`), the log scraper (`log.service.ts`), state
building (`state-builder.ts`), and action execution (`action-executor.ts`). The
`Action` domain enum was lifted to `src/core/poker/action.enum.ts` so both core
(`PlayerAction`) and the live parsers can share it without core depending on
live. `Table` no longer parses raw PokerNow messages: the adapter
(`src/live/pokernow/state-builder.ts`) parses and passes the stack map in via
`Table.setIdToStack(...)`. Core also no longer imports any DB service — `Table`
depends on the injected `PlayerStatsRepository` port. The per-hand runtime state
container `HandState` now lives in core (`src/core/game/hand-state.ts`). The
decision logic (`src/core/poker/decision-engine.ts`) is core too: it no longer
talks to the browser — it validates the AI's chosen action through the
`ActionAvailability` port (`src/core/poker/action-availability.interface.ts`),
which the live `PuppeteerActionAvailability` adapter implements and `bot.ts`
injects.

The bot runner and REST API now live under `src/live/bot/` and `src/live/http/`,
so all PokerNow-specific code is under `src/live/**` and `core` is fully isolated.

`npm run check:boundaries` reports **0 violations**. The structural migration is
complete — **CI can switch to `--strict`** (`npx tsx scripts/check-boundaries.ts
--strict`) to fail the build on any future `core -> live` import.

## Remaining cleanups (optional, not on the critical path)

- Flip CI / `pretest` to `--strict` now that core is clean.
- `src/services/db/` and `src/config/` still sit at `src/` root; they're
  infrastructure shared by live, and could move under `src/live/` later.
- `src/core/poker/log-processing.interface.ts` stays in core (it defines
  `ProcessedLogs`, consumed by core's `HandState`), but its `Data`/`Log` types
  describe the PokerNow log API shape and may belong in live later.
- `src/interfaces/` (`config.interface`, `message.interface`) are live/worker
  concerns and could move under `src/live/` later.

## Commands

- Run the server: `npx tsx src/index.ts` (Express on `http://localhost:8080`)
- Tests: `npm test` (Mocha, specs in `test/unit/*.spec.ts`; `pretest` runs the
  boundary checker)
- Type-check: `npx tsc --noEmit` (tsconfig sets `noEmit`; there is no build step)
