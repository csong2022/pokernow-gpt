## PokerNow GPT

<a id="readme-top"></a>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
       <ul>
        <li><a href="#why-chatgpt-or-other-llms-over-gto">Why ChatGPT over GTO?</a></li>
       </ul>
      <ul>
        <li><a href="#built-with">Built With</a></li>
        <li><a href="#project-layout">Project Layout</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#installation">Installation</a></li>
        <li><a href="#running-the-bot">Running the Bot</a></li>
      </ul>
    </li>
    <li>
      <a href="#the-arena">The Arena</a>
      <ul>
        <li><a href="#arena-setup">Arena Setup</a></li>
        <li><a href="#running-a-benchmark">Running a Benchmark</a></li>
        <li><a href="#analyzing-results">Analyzing Results</a></li>
      </ul>
    </li>
    <li>
      <a href="#supported-models">Supported Models</a>
      <ul>
        <li><a href="#model-registry">Model Registry</a></li>
      </ul>
    </li>
    <li><a href="#development">Development</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
  </ol>
</details>



<!-- ABOUT THE PROJECT -->
## About The Project

A Poker bot designed for [PokerNow](https://www.pokernow.club) using ChatGPT (or other models! check the Supported Models section below) to make decisions for the user. The bot web scrapes and fetches logs from PokerNow, building a model of the live game: the stakes, the user's hole cards, every player's position and stack size, the current pot size, the current street and shown community cards, and previous actions made by the the bot and other players.

This model is used to formulate a query, fed into an LLM model. The output is parsed to reach a decision for the user, which is then executed automatically by the webdriver. The history of queries is maintained across a single hand and passed back into the model so that it can "remember" previous actions, such as who was the preflop aggressor.

The model is asked to reason first and then close with `Final Answer: <action> <size>`, matching the Kaggle Game Arena harness so rankings are comparable and reasoning models can actually reason. The parser anchors on the *last* `Final Answer:` line and ignores the reasoning body, so "I considered folding but will raise" resolves to a raise. If the output still can't be parsed, the decision engine re-prompts once and then falls back to a clamp/default safety net; both events are recorded, which is what the arena's per-model reliability table is built from. Each provider logs the raw response separately from the parsed action — for audit only, never feeding game state or analysis.

During the operation of the bot, a cache is maintained to track the stats of every player in the table (VPIP, PFR, 3-bet, fold-to-3-bet, aggression frequency). After the session ends, a SQLite database is updated with the players' stats, tracked by the player's name. This data will be retrieved the next time the user plays against that opponent again, building a stronger model of the opponent's tendencies the more the user plays against them. Each player's stats are used in the query, allowing the bot to make personalized exploitative adjustments to its strategy.

The project also ships an **[Arena](#the-arena)** — an offline LLM-vs-LLM poker benchmark that runs on a real rules engine, so you can measure which model actually plays better poker before pointing it at a live table.

### Why ChatGPT (or other LLMs) over GTO?

A common question that is asked is why would someone use an LLM to determine the best possible actions over GTO strategy (Game Theory Optimal)? GTO strategies are generally considered a "perfect" way to play poker, with a balanced, aggressive, and unexploitable strategy.

GTO strategies are mostly solved for heads-up play (2 players) and has fewer data on how a hand should be played multi-handed (3+ players). As you increase the number of players participating in the pot, it becomes harder to follow an optimal strategy created for 2 or 3 players max. Weaker tables found online can have many loose players, increasing the chance of pots going multi-way postflop.

Furthermore, GTO strategies generally can't make use of opponents' VPIP (voluntary put money in pot) and PFR (pre-flop raise) stats to make exploitative adjustments to its strategy. One could argue that while GTO would perform the best against another bot using GTO or a human playing as close to GTO as possible, an agent utilizing an LLM could generate more profit against weaker opponents that stray far from GTO.

As ChatGPT and LLMs/generative models as a whole improve over time, we can and should expect ChatGPT to become a stronger, more profitable poker player.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



### Built With

* [Node][Node-url]
* [Express][Express-url]
* [Puppeteer][Puppeteer-url]
* [SQLite][SQLite-url]
* [PokerKit][PokerKit-url] (Python — the arena's rules engine)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Project Layout

The codebase is split into three parts, and the split is enforced by a checker
rather than convention alone:

| Layer | Path | What it owns |
| --- | --- | --- |
| **core** | `src/core/**` | The environment-agnostic "poker brain": LLM provider abstraction, prompt construction, domain models, decision logic. Knows poker, not *where* the game is played. |
| **live** | `src/live/**` | Everything PokerNow-specific: the Puppeteer driver, log scraping/parsing, state building, action execution, the bot runner, and the REST API. |
| **arena** | `src/arena/**` | The LLM-vs-LLM benchmark on an owned engine. Implements the same state-in / action-out seam as live and reuses the core brain verbatim. |

State goes **in** to core; actions come **out**. `core` never imports `live` or
`arena`, and `arena` never imports `live` — so the same decision engine that
plays a real PokerNow table also plays the benchmark, with no branching on
which environment it's in. Core touches neither the browser nor the database: it
reaches both through injected ports, which is what lets the arena substitute its
own implementations. `scripts/check-boundaries.ts` enforces the whole dependency
DAG — `npm run check:boundaries` is a non-failing report, and `pretest` runs it
in strict mode so `npm test` and CI fail on a stray cross-layer import.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- GETTING STARTED -->
## Getting Started

### Installation

1. Get an API key for at least one provider:
   - OpenAI — [https://platform.openai.com/docs/overview](https://platform.openai.com/docs/overview)
   - Google AI — [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   - Anthropic — [https://console.anthropic.com](https://console.anthropic.com)
2. Clone the repo
   ```sh
   git clone https://github.com/csong2022/pokernow-gpt.git
   ```
3. Install NPM packages
   ```sh
   npm install
   ```
4. Create a `.env` file in the base project directory `./pokernow-gpt` and define your API key(s)
   ```
   OPENAI_API_KEY=YOUR_API_KEY
   GOOGLEAI_API_KEY=YOUR_API_KEY
   CLAUDEAI_API_KEY=YOUR_API_KEY
   ```
   Only the key for the provider you actually use is required.
5. (Optional) Adjust bot and webdriver settings in `src/config/bot.config.json` and `src/config/webdriver.config.json`.
6. (Optional) If you want to run the [Arena](#the-arena), set up the Python engine — see [Arena Setup](#arena-setup).

### Running the Bot

The app exposes a REST API on `http://localhost:8080`. Start the server:

```sh
npx tsx src/index.ts
```

Before creating a bot, make sure the PokerNow game is already set up with another player acting as host (you can start a new game at [https://www.pokernow.club/start-game](https://www.pokernow.club/start-game)).

#### Create a bot (join a game)

Send a `POST` request to `/bot/create`. The bot will open a headless browser, navigate to the game, and request a seat. The response resolves once the host accepts (or rejects) the ingress request.

```sh
curl -X POST http://localhost:8080/bot/create \
  -H "Content-Type: application/json" \
  -d '{
    "game_id": "pglXXXXXXXXXXXX",
    "name": "Bot1",
    "stack_size": 1000,
    "ai_settings": {
      "provider": "OpenAI",
      "model_name": "gpt-5.4-mini",
      "playstyle": "neutral",
      "reasoning": "medium"
    }
  }'
```

| Field | Notes |
| --- | --- |
| `provider` | `"OpenAI"`, `"Google"`, or `"Anthropic"`. |
| `model_name` | The **provider's own API model string** (e.g. `gpt-5.4-mini`, `claude-opus-5`), not an arena registry id. See [Supported Models](#supported-models). |
| `playstyle` | Steers the system prompt. `"neutral"` is the default. |
| `reasoning` | Optional: `none` \| `low` \| `medium` \| `high`. Maps to each provider's own thinking knob. Use `none` for models that don't reason. |

The `game_id` is the string at the end of the PokerNow URL: `pokernow.club/games/<game_id>`. On success the response returns a `bot_uuid` — save it to stop or retry the bot later.

```json
{ "bot_uuid": "xxxx-xxxx-xxxx-xxxx", "code": "ok" }
```

#### Retry table entry

If the host rejected the ingress request, retry with a different name and/or stack size:

```sh
curl -X POST http://localhost:8080/bot/create/retry \
  -H "Content-Type: application/json" \
  -d '{
    "bot_uuid": "xxxx-xxxx-xxxx-xxxx",
    "name": "Bot2",
    "stack_size": 500
  }'
```

#### Stop a bot

The bot exits after the current hand finishes.

```sh
curl -X POST http://localhost:8080/bot/stop \
  -H "Content-Type: application/json" \
  -d '{ "bot_uuid": "xxxx-xxxx-xxxx-xxxx" }'
```

The bot runs a single browser instance — log polling shares the game page rather
than opening a second one — and it paces its decisions off the table's own action
clock instead of a fixed delay, so it doesn't time out at a fast table or look
robotic at a slow one.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- THE ARENA -->
## The Arena

The arena is an offline benchmark that sits LLMs down at the same table and
measures who actually wins. It runs on **[PokerKit][PokerKit-url]**, a real
Python rules engine, so no poker rules are reimplemented — and it reuses the
exact prompt construction and decision engine the live bot uses, so results
transfer.

Two things make the numbers trustworthy:

- **Duplicate-deck variance reduction.** Each deal is played multiple times with
  the seat→model assignment rotated, so every model sees the same cards from
  every position. Card luck cancels out when results are grouped by deal, which
  is what makes a few hundred hands informative instead of noise.
- **Statelessness by construction.** Arena agents get no opponent history — the
  prompt-context port is wired to a no-op, so there is no code path that reads
  it. That keeps replays identical and makes a model's win rate attributable to
  the model rather than to in-run adaptation.

### Arena Setup

One-time Python venv setup:

```sh
py -m venv engine-py/.venv
engine-py/.venv/Scripts/python.exe -m pip install -r engine-py/requirements.txt   # Windows
# POSIX: engine-py/.venv/bin/python -m pip install -r engine-py/requirements.txt
```

The client auto-selects `Scripts/python.exe` vs `bin/python` by platform.

### Running a Benchmark

```sh
# Stub agents — deterministic legal play, no API cost. Good for a smoke test.
npx tsx src/arena/index.ts --hands 25 --players 3

# Real models. --llm takes REGISTRY IDS (see Supported Models) and needs the
# matching provider keys in .env.
npx tsx src/arena/index.ts --hands 10 --players 2 --llm "gpt-5.4-nano,gemini-3.1-flash-lite-preview"

# Duplicate-deck variance reduction (the mode you want for real comparisons).
npx tsx src/arena/index.ts --duplicate --deals 50 --players 3 --rotation full \
  --tag hypothesis-test --notes "why this run exists"
```

`--rotation` picks how seats are permuted per deal:

| Mode | Replays per deal | Use when |
| --- | --- | --- |
| `cyclic` (default) | `P` | Cheap runs and larger tables. Removes seat bias, but for 3+ players the pairwise opponent *ordering* stays confounded. |
| `full` | `P!` | Ranking experiments. Exact first- and second-order cancellation; only practical at heads-up/3-max (2 and 6 replays). |

The cost of the `cyclic` shortcut is measured, not guessed — `npm run calibrate`
plays deterministic agents both ways on identical decks and reports the residual.

Seats can also be given a `--playstyle` individually, which steers that agent's
system prompt; a non-neutral playstyle is folded into the agent's identity so
seats stay distinguishable in the logs. For prompt experiments there's a
probe-only system-prompt override (used for the tightness probes), which replaces
the playstyle prompt outright rather than adding to the playstyle map.

Each run writes `arena-runs/<runId>/` containing a tracked `manifest.json` (what
was run: models, format, rotation, git commit, tags) and a gitignored
`hands.jsonl` (one replayable record per hand, including the full prompt and
reasoning trace behind each decision).

### Analyzing Results

Analysis is a pure offline pass over the JSONL — the engine doesn't need to be running.

```sh
npm run analyze arena-runs/<run_id>/hands.jsonl     # a path (file or dir)
npm run analyze -- --format HU --tag kaggle-validation --write-results   # or a filter
```

It reports:

- **bb/100, mbb/hand, 95% CI, net bb** per model — plus a variance-reduced table for duplicate runs.
- **Bradley-Terry ranking** scaled to Elo, fit per format, with a deal-level bootstrap CI. This is a *frequency* statistic (who wins more hands) while bb/100 is a *margin* statistic (who wins more chips) — they can disagree, and that disagreement is informative, which is why both are reported.
- **Style table** — VPIP / PFR / 3-Bet / Fold-to-3-Bet / AFq per model, derived from the logged actions. How each model plays, not just whether it won.
- **Decision reliability** — per-model rethink and fallback rates (how often a model's output failed to parse).
- **Integrity guards** — chip conservation, seat→model consistency, and a hard refusal to pool heads-up results with 3-max.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- SUPPORTED MODELS -->
## Supported Models

**Providers:** `OpenAI`, `Google`, `Anthropic`

The table below is the current registry. The **id** is the stable key used by the
arena (`--llm`); the live REST API takes the provider's own API model string in
`model_name` (for most entries these are the same string). **Reasoning** is the
thinking level the model is configured to use — `none` means the model doesn't reason.

### OpenAI

| Id | Reasoning |
| --- | --- |
| `gpt-5.6-sol` | none |
| `gpt-5.6-terra` | none |
| `gpt-5.6-luna` | none |
| `gpt-5.5` | medium |
| `gpt-5.5-pro` | medium |
| `gpt-5.4` | medium |
| `gpt-5.4-mini` | medium |
| `gpt-5.4-nano` | none |
| `gpt-5.4-pro` | medium |
| `gpt-5.3-chat-latest` | none |
| `gpt-5.2` | medium |
| `gpt-5.2-pro` | medium |
| `gpt-5.2-chat-latest` | none |
| `gpt-5.1` | medium |
| `gpt-5.1-chat-latest` | none |
| `o3` | medium |

### Google

| Id | Reasoning |
| --- | --- |
| `gemini-3.6-flash` | none |
| `gemini-3.5-flash` | medium |
| `gemini-3.5-flash-lite` | none |
| `gemini-3.1-pro-preview` | medium |
| `gemini-3.1-flash-lite` | none |
| `gemini-3.1-flash-lite-preview` | none |
| `gemini-3-pro-preview` | medium |
| `gemini-3-flash-preview` | medium |

### Anthropic

| Id | Reasoning |
| --- | --- |
| `claude-fable-5` | medium |
| `claude-opus-5` | medium |
| `claude-sonnet-5` | medium |
| `claude-opus-4-8` | medium |
| `claude-opus-4-7` | medium |
| `claude-opus-4-6` | medium |
| `claude-opus-4-5` | none |
| `claude-sonnet-4-6` | medium |
| `claude-sonnet-4-5` | none |
| `claude-haiku-4-5` | none |

### Model Registry

`src/config/models.json` is **script-managed data, not code** — it's read at
runtime and validated on load, and `scripts/update-models.ts` is its only writer:

```sh
npm run update-models
```

That fetches each provider's live model list, keeps the allowlisted families,
and merges without clobbering — it preserves ids, `addedAt`, costs, and
`reasoning`; collapses dated snapshots (`gpt-5.4-nano-2026-03-17`) to a family
id; deprecates rather than deletes models that disappear, so ids in historical
run logs stay resolvable; and writes deterministically, so a re-run with no
upstream changes produces a zero diff.

The registry replaced a hardcoded model allowlist in the service factory, which
kept drifting from what the providers actually served. Keeping the stable `id`
separate from the volatile `apiModelString` means a preview→GA rename or a
version bump can land underneath an id without invalidating the ids recorded in
historical run logs.

Two fields aren't in any provider list endpoint and are maintained by hand:
per-1M-token **costs** and the **reasoning** level. New models land with cost `0`
and reasoning `none` until set; both are preserved across re-runs. Don't hand-edit
the file for anything else — re-run the script.

The reasoning level is a single setting that each provider service maps to its
own native knob: **OpenAI** sets `reasoning_effort`, **Anthropic** sets adaptive
thinking plus effort (with a larger token budget to fit the reasoning), and
**Gemini** ignores it, since those models reason on their own.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- DEVELOPMENT -->
## Development

```sh
npx tsc --noEmit            # type-check (no build step; tsconfig sets noEmit)
npm test                    # Mocha unit tests (pretest runs the boundary checker)
npm run check:boundaries    # non-failing layering report while working
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- LICENSE -->
## License

Distributed under the MIT License. See `LICENSE.txt` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTACT -->
## Contact

pokernowgpt@gmail.com

Project Link: [https://github.com/csong2022/pokernow-gpt](https://github.com/csong2022/pokernow-gpt)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->
[Node-url]: https://nodejs.org/en
[Express-url]: https://expressjs.com/
[Puppeteer-url]: https://pptr.dev/
[SQLite-url]: https://www.sqlite.org/
[PokerKit-url]: https://github.com/uoftcprg/pokerkit
