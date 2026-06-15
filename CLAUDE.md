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

## Known violations = migration roadmap

These exist today and are intentionally **not** fixed (each is a follow-up step):

1. `src/core/poker/log-processing.util.ts` and
   `src/core/poker/message-processing.util.ts` are **PokerNow-specific parsers
   physically living inside core**. They should move to `live`. Until then they
   trigger the violations below.
2. `src/core/game/table.model.ts` → imports `message-processing.util.ts` (parser)
   and `src/services/db/playerstatsapi.service.ts` (DB service). Decouple the DB
   dependency (inject it) and drop the parser import when the parsers move.
3. `src/core/player/playeraction.model.ts` → imports `log-processing.util.ts`
   (only for the `Action` type — relocate that type when the parsers move).

Other couplings noted for later (not core, so not flagged, but on the seam):
- `src/bot/decision-engine.ts` imports `PuppeteerService` (live) alongside core
  query helpers — it straddles the seam and needs splitting.
- `src/bot/hand-state.ts` is already clean (core models/interfaces only) — an
  easy future move into core.

## Commands

- Run the server: `npx tsx src/index.ts` (Express on `http://localhost:8080`)
- Tests: `npm test` (Mocha, specs in `test/unit/*.spec.ts`; `pretest` runs the
  boundary checker)
- Type-check: `npx tsc --noEmit` (tsconfig sets `noEmit`; there is no build step)
