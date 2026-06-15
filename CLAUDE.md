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
  (`src/services/db/` is shared infrastructure and stays outside `live/`; see The
  seam. `src/config/` is live-only but its move is cosmetic.)
- **arena** (`src/arena/**`) — an LLM-vs-LLM poker benchmark on an owned engine
  (PokerKit). Implements the SAME seam as live (state-in / action-out) and reuses
  the core brain (ai, query-construction, decision-engine) verbatim. Depends on
  core; **never** on live. See "Arena + the Python engine" below.

## The seam

State goes **in** to core; actions come **out**. Today that crossing happens via
the live adapter's `state-builder` (state in) and `action-executor` (actions
out).

**The dependency DAG (enforced — see Enforcement):**

- **core** may import only core + `utils` + its own ports. Never `live/`,
  `arena/`, `services/db/`, or `http/`.
- **live** may import core + shared infra (`utils`, `services/db`, `config`,
  `interfaces`). Never `arena/`.
- **arena** (future) may import core + shared infra. Never `live/` (the PokerNow
  adapter) or `http/`.

So `services/db` is **shared infrastructure**, not a live concern — both live and
(eventually) arena persist through it. It deliberately sits outside `live/` so
arena can use it without reaching across the `arena ↛ live` boundary.

Core persists/reads player stats through the `PlayerStatsRepository` port
(`src/core/player/playerstats-repository.interface.ts`), which the DB service
implements and which is injected into `Table` — so core never imports a DB
service. (`log-processing.interface` stays in core; only the `*.util` parsers
are live.)

## Enforcement

A lightweight checker (`scripts/check-boundaries.ts`, no ESLint — runs on the
existing `tsx`) holds a **per-layer rule table**: each layer declares the import
substrings it may not reference, and the checker scans every layer that exists.
This enforces the whole DAG above, not just the core seam — a stray
`arena -> live` import will fail the day `src/arena` lands, with no extra wiring
(rules for absent layers sit dormant).

```sh
npm run check:boundaries          # report mode: print violations, exit 0
npm run check:boundaries:strict   # strict mode: exit 1 on any violation
```

The boundary is **enforced**: `pretest` runs `check:boundaries:strict`, so
`npm test` (and CI) fails on any forbidden cross-layer import. Use the plain
`check:boundaries` for a non-failing report while working.

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

`npm run check:boundaries` reports **0 violations**, and the boundary is enforced:
`pretest` runs it in `--strict` mode, so any future `core -> live` import fails
`npm test` / CI.

## Remaining cleanups (optional, not on the critical path)

- `src/services/db/` is **shared infrastructure** — keep it at `src/` root (or
  rename to `src/persistence/`); do NOT move it under `live/`, or arena would
  have to reach across the `arena ↛ live` boundary to persist. `HandOutcomes`
  (keyed by model) is in fact the data store arena's benchmark would populate.
- `src/config/` is live-only today (both JSONs are imported solely by
  `live/bot/bot-manager.ts`); moving it under `live/` is harmless tidying, no
  correctness gain — only worth doing if already editing there.
- `src/interfaces/` should be **split, not bulk-moved**: `message.interface` and
  the `WorkerConfig`/`WebDriverConfig`/`BotConfig` halves are live orchestration
  (→ `live/`). `AIConfig` has already been lifted to `src/core/ai/ai-config.interface.ts`
  (shared by live and arena); `config.interface.ts` now imports it from core.
- `src/core/poker/log-processing.interface.ts` stays in core (it defines
  `ProcessedLogs`, consumed by core's `HandState`), but its `Data`/`Log` types
  describe the PokerNow log API shape and may belong in live later.

## Arena + the Python engine

The arena benchmarks LLMs against each other on a real rules engine, **PokerKit**
(Python), so no poker logic is reimplemented in TS.

- **`engine-py/`** (NOT under `src/`) — a long-lived Python "state-transition
  oracle" (`server.py`) that owns PokerKit `State` objects keyed by `game_id` and
  enforces all rules. It speaks **line-delimited JSON-RPC over stdin/stdout**
  (`{id, method, params}` → `{id, result|error}`, one object per line; stdout is
  protocol-only, diagnostics go to stderr). Methods: `create_game`, `start_hand`
  (accepts an optional explicit `deck`), `get_state`, `apply_action`, `showdown`,
  `end_game`. Cards are PokerKit short form ("Th"); chip amounts are raw. Hole,
  burn, and board cards are all dealt from the provided deck (burns are manual
  too) and the deck is persisted for the whole hand, so a given deck string
  reproduces a hand exactly — the basis for duplicate-deck replay.
- **The boundary:** `src/arena/engine/pokerkit-client.ts` *spawns* the Python
  process (it does not import it). `src/arena/environment.ts` is the seam;
  `src/arena/state-mapper.ts` maps `state_view` → the core `Game` (normalizing
  chips → BB, "Th" → "10h") so `query-construction` / `decision-engine` are reused
  unchanged. `src/arena/agent.ts` has a `StubAgent` (deterministic legal play) and
  an `LLMAgent` (core decision-engine + a provider via `AIConfig`); illegal model
  actions are clamped to legal min/max or fall back to check-else-fold, each
  logged as a malformed-action event. `runner.ts` plays independent hands;
  `duplicate-runner.ts` is the variance-reduction harness (below). Both share
  `playDecisionLoop` and write one replayable JSONL record per hand via `hand-log.ts`.
- **Duplicate-deck variance reduction** (`deck.ts`, `duplicate-runner.ts`): per
  *deal* one shuffled deck is generated and replayed `P` times (full rotation),
  rotating which model sits in which seat, so every model plays the same cards in
  every position. Hands are tagged `deal_id` + `rotation`. Card luck cancels when
  the analysis groups by deal.
- **Analysis** (`src/arena/analysis/`, pure offline pass over the JSONL):
  `npm run analyze <file|dir>` prints per-model bb/100, mbb/hand, 95% CI, net bb,
  malformed rate, runs integrity guards (chip conservation, seat→model, …), and
  writes a JSON report to `arena-analysis/`. For duplicate runs it adds a
  variance-reduced table (same point estimate, tighter CI; reduction is exact
  only for deterministic strategies — LLM temperature leaves residual decision
  noise). Imports core types only; never the engine — runs with the engine off.
- **Python venv setup** (one-time):
  ```sh
  py -m venv engine-py/.venv
  engine-py/.venv/Scripts/python.exe -m pip install -r engine-py/requirements.txt   # Windows
  # POSIX: engine-py/.venv/bin/python -m pip install -r engine-py/requirements.txt
  ```
  The client auto-selects `Scripts/python.exe` vs `bin/python` by platform. The
  venv and `arena-logs/` are gitignored.
- **Out of scope (so far):** GTO/EV-loss scoring, ranking systems, style stats
  (VPIP/PFR), concurrency, durable runs. Stacks reset to the configured starting
  stack each hand (clean per-hand deltas; no bust handling).

## Commands

- Run the server: `npx tsx src/index.ts` (Express on `http://localhost:8080`)
- Run the arena (stub agents, no API cost):
  `npx tsx src/arena/index.ts --hands 25 --players 3`
- Run the arena (LLMs, needs `OPENAI_API_KEY`/`GOOGLEAI_API_KEY` in `.env`):
  `npx tsx src/arena/index.ts --hands 10 --players 2 --llm "OpenAI:gpt-5.4-nano,Google:gemini-3.1-flash-lite-preview"`
- Run the arena (duplicate-deck variance reduction, full rotation):
  `npx tsx src/arena/index.ts --duplicate --deals 50 --players 2`
- Analyze logs (offline; engine not needed):
  `npm run analyze arena-logs/<file-or-dir>.jsonl`
- Tests: `npm test` (Mocha, specs in `test/unit/*.spec.ts`; `pretest` runs the
  boundary checker in `--strict`)
- Type-check: `npx tsc --noEmit` (tsconfig sets `noEmit`; there is no build step)
