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

Prompt context that differs per environment goes through the `HandContextBuilder`
port (`src/core/poker/hand-context-builder.interface.ts`): `query-construction`
and the decision loop are single-sourced and just insert whatever
`buildOpponentSection(game)` returns. Live injects `StatsContextBuilder`
(`src/live/bot/`), which emits the VPIP/PFR/3-bet/AFq opponent block from the
table's stats (the exploitative thesis). The arena injects `NoOpponentContext`
(`src/arena/`), which returns `""` — so an arena agent is a pure function of
current hand state **by construction** (no code path reads opponent history). That
statelessness is load-bearing: duplicate-deck variance cancellation needs
identical replays, and cross-run comparability needs bb/100 attributable to the
model, not to adaptation. A future opponent-aware arena arm (the deliberate
exploitation experiment) is a builder swap, not a flag.

Per-decision betting context — exact amount-to-call, legal raise band (min/max
total), live opponent stacks, and the live-players list — is engine-provided info
the prompt surfaces so the model isn't left inferring it. It rides in on `Table`
setters (`setBettingContext`, `setCurrentStacks`, `setLivePlayers`) that the
environment's state builder populates; the arena's `state-mapper` fills them from
the engine's `legal_actions`/`stacks`/folds. They're **additive and nullable** —
`query-construction` omits each line when unset, so the live path (which doesn't
set them yet) produces byte-identical prompts to before. The pre-query pacing
delay is injectable on `DecisionEngine` (live keeps 2s to look human at the
PokerNow table; the arena passes 0).

**Output regime: reasoning + `Final Answer:`** (matches the Kaggle Game Arena
harness so rankings are comparable, and lets reasoning models actually reason).
The prompt asks the model to reason, then end with `Final Answer: <action> <size>`
(BB units, TOTAL street bet — Kaggle uses chips, so cross-harness comparison is
ordinal only). `parseResponse` (`ai-query.helper.ts`) anchors on the LAST
`Final Answer:` line and ignores the reasoning body (so "considered folding but
will raise" → raise). On a parse failure the `DecisionEngine` does ONE
`RETHINK_PROMPT` re-prompt, then falls back to the existing clamp/default safety
net; `rethink`/`fallback` are emitted as `DecisionEvent`s via an injected sink,
which the arena threads into each hand record's `decision_events` (analysis prints
a per-model rethink/fallback "Decision reliability" table). Each provider service
logs the raw response (reasoning + final answer) separately from the parsed
action — for audit only; it never enters game state, the JSONL action data, or the
style/analysis signal. Non-reasoning Claude `max_tokens` is 4096 to fit visible
reasoning + the final line.

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
  *deal* one shuffled deck is generated and replayed with rotated seat→model
  assignments, so every model plays the same cards in different positions; card
  luck cancels when the analysis groups by `deal_id`. Two `--rotation` modes:
  - `cyclic` (default): `P` rotations — each model in each seat once (a Latin
    square). Removes first-order seat bias. **= full permutations only at HU**;
    for `P>=3` pairwise opponent *ordering* stays confounded (A keeps the same
    neighbours across rotations), an uncancelled residual invisible in the point
    estimate but able to perturb a close ranking.
  - `full`: all `P!` seatings — exact first- and second-order cancellation for
    deterministic play. Cost is factorial, so it's a non-issue at HU/3-max (2/6
    replays) but impractical beyond. **Run ranking experiments (e.g. HU-vs-3max
    transfer) with `--rotation full`**; keep `cyclic` for cheap/larger runs.
  - The cost of the shortcut is empirical, not a guess: `npm run calibrate` plays
    deterministic agents both ways on identical decks and reports the residual
    (measured ~1.1–1.45x wider reduced CI at 3-max — bigger for more
    position-reactive agents).
- **Analysis** (`src/arena/analysis/`, pure offline pass over the JSONL):
  `npm run analyze <file|dir>` prints per-model bb/100, mbb/hand, 95% CI, net bb,
  malformed rate, runs integrity guards (chip conservation, seat→model, …), and
  writes a JSON report. A single run's report lands in its run dir
  (`arena-runs/<runId>/analysis.json`, gitignored); only multi-run/filter reports
  go to the flat `arena-analysis/`. For duplicate runs it adds a
  variance-reduced table (same point estimate, tighter CI; reduction is exact
  only for deterministic strategies — LLM temperature leaves residual decision
  noise). It also prints a per-model **style table** (`style.ts`): VPIP / PFR /
  3-Bet / Fold-to-3-Bet / AFq, keyed by `modelIdOf` (summed across seats), derived
  from the JSONL `actions[]` — how each model plays, not just who won. Style is
  over RAW per-hand rows (not per-deal blocks): behavioral frequencies, so
  cross-replay non-independence matters less than for CIs, but the report says so.
  Imports core types only (+ the core `Action` enum); never the engine — runs with
  the engine off.
- **Bradley-Terry ranking** (`bradley-terry.ts`, reported ALONGSIDE bb/100):
  Kaggle-comparable FREQUENCY statistic. Reduction unit = the HAND: per hand,
  group chip `deltas` by `modelIdOf` (a model in two seats contributes the SUM of
  its seats; a model vs itself yields no pair), then compare every distinct pair —
  higher total delta wins, equal = draw (a 3-max hand → 3 pairwise outcomes, which
  are NOT independent — kingmaking — so independence is handled in the CI). Fit is
  a hand-rolled L2-penalized MLE (gradient ascent, draws = half-credit, betas
  centered to mean 0), scaled to Elo `R = 1000 + 400/ln10·beta`. CIs come from a
  **deal-level bootstrap** (resample `deal_id` blocks with replacement, refit;
  per-hand only for plain runs, noted) — wider but honest vs resampling correlated
  replays. NEVER pools HU with 3-max (fit per format, same guard as bb/100).
  bb/100 (margin) and BT (frequency) can DIVERGE — a model can win more hands yet
  lose chips — and that divergence is the point of reporting both.
- **Run registry** (`arena-runs/<runId>/{manifest.json,hands.jsonl}`): a run's
  identity lives in metadata, not its filename. `src/arena/run-manifest.ts` defines
  the `RunManifest` (runId, createdAt, gitCommit, format, models = **stable registry
  ids**, rotation, deals, replaysPerDeal, tags, notes, results). The composition
  root (`arena/index.ts`) creates the dir + manifest at run start (`startRun`) and
  the runner writes `hands.jsonl` into it (hand-log schema unchanged; runId comes
  from the directory, not denormalized per row). `src/arena/analysis/manifest-index.ts`
  is the pure/offline index: `loadManifests` + `byFormat`/`byModel`/`byTag`/`filterRuns`
  predicates (no DB, no DSL). `analyze` accepts those filters as well as a path;
  when a selection spans multiple formats it groups per format and **never pools**
  HU with 3max (a correctness guard), and `--write-results` backfills each run's
  own `results` into its manifest. A single-run analysis (single-path at a run, or
  a filter resolving to one run) writes its full report to
  `arena-runs/<runId>/analysis.json`; multi-run reports go to flat `arena-analysis/`.
  **Git split:** `manifest.json` is tracked (the small, versioned record of what
  was run, self-describing without the data); the bulky/derived per-run artifacts
  (`arena-runs/**/hands.jsonl`, `arena-runs/**/analysis.json`) are gitignored. Migrated pre-scheme
  runs carry a `pre-manifest-migration` tag; stub/calibration runs have `models: []`
  with the agent labels in `notes`.
- **Model registry** (`src/config/models.json`, loader `src/core/ai/model-registry.ts`):
  script-managed DATA, not code — **read at runtime via `fs` (never import-baked)**,
  validated loud on load. The stable `id` is the key referenced across the arena
  (run configs use ids); `apiModelString` is the volatile provider surface string
  and may change underneath a stable id (preview→GA, version bumps) — mirrors the
  `modelIdOf` "stable key, volatile field" idea. The loader takes the file PATH
  from the composition root (`arena/index.ts`), so core hardcodes no path; it
  resolves `id → AIConfig` (`toAIConfig`) and throws `unknown model id: X` on an
  unregistered id. **`scripts/update-models.ts` is the sole writer** (`npm run
  update-models`): fetches each provider's live model list, keeps an allowlisted
  family (`gpt-5.x*`, `gemini-3*` text-gen, `claude-*-4*`), and merges
  non-clobbering — preserving ids/addedAt/deprecated/costs/reasoning, collapsing
  dated snapshots to a family id, deprecating (never deleting) vanished models,
  and writing deterministically (sorted, fixed key order) so reruns are zero-diff.
  Costs and `reasoning` aren't in any list endpoint → hand-maintained; `reasoning`
  is a level (`none` | `low` | `medium` | `high`, `none` = doesn't reason). New
  models default to cost 0 / reasoning `none` until set by hand (preserved across
  reruns). Humans don't hand-edit the file; re-run the script.
  The level flows `toAIConfig → AIConfig.reasoning → createAIService → AIService`
  and each provider service maps it to its own knob: **OpenAI** sets
  `reasoning_effort` (low/medium/high); **Claude** sets adaptive thinking
  (`thinking:{type:"adaptive"}` + `output_config.effort`) with a bigger token
  budget and a defensive retry-without-thinking on the 400 you get from a model
  that doesn't support it (so only adaptive-capable Claudes — Opus 4.6+/Sonnet
  4.6 — are non-`none` in the registry; Haiku 4.5 / Sonnet 4.5 / Opus 4.5 are
  `none`); **Gemini** is a no-op (pinned SDK 0.14.1 has no `thinkingConfig`; the
  models reason automatically).
- **Python venv setup** (one-time):
  ```sh
  py -m venv engine-py/.venv
  engine-py/.venv/Scripts/python.exe -m pip install -r engine-py/requirements.txt   # Windows
  # POSIX: engine-py/.venv/bin/python -m pip install -r engine-py/requirements.txt
  ```
  The client auto-selects `Scripts/python.exe` vs `bin/python` by platform. The
  venv, `arena-analysis/`, and the derived per-run artifacts
  (`arena-runs/**/hands.jsonl`, `arena-runs/**/analysis.json`) are gitignored (run
  `manifest.json`s are tracked). (`arena-logs/` is retired.)
- **Out of scope (so far):** GTO/EV-loss scoring, ranking systems, feeding
  opponent stats back into arena agent decisions (the deliberate exploitation
  experiment — left as a `HandContextBuilder` swap), concurrency, durable runs.
  Stacks reset to the configured starting stack each hand (clean per-hand deltas;
  no bust handling).

## Commands

- Run the server: `npx tsx src/index.ts` (Express on `http://localhost:8080`)
- Run the arena (stub agents, no API cost):
  `npx tsx src/arena/index.ts --hands 25 --players 3`
- Run the arena (LLMs; `--llm` takes registry **ids**, needs the provider keys in `.env`):
  `npx tsx src/arena/index.ts --hands 10 --players 2 --llm "gpt-5.4-nano,gemini-3.1-flash-lite-preview"`
- Update the model registry (sole writer; idempotent):
  `npm run update-models`
- Run the arena (duplicate-deck variance reduction; `--rotation cyclic|full`, default cyclic):
  `npx tsx src/arena/index.ts --duplicate --deals 50 --players 3 --rotation full`
  (tag/annotate a run: `--tag hypothesis-test --notes "..."`)
- Analyze logs (offline; engine not needed) — single path OR manifest filter:
  `npm run analyze arena-runs/<run_id>/hands.jsonl` (or any `.jsonl`/dir), or
  `npm run analyze -- --format HU --tag kaggle-validation [--write-results]`
  (filter spans multiple formats → grouped per format, never pooled)
- Calibrate the cyclic-vs-full residual with deterministic agents:
  `npm run calibrate` (`CAL_DEALS=300`)
- Tests: `npm test` (Mocha, specs in `test/unit/*.spec.ts`; `pretest` runs the
  boundary checker in `--strict`)
- Type-check: `npx tsc --noEmit` (tsconfig sets `noEmit`; there is no build step)
