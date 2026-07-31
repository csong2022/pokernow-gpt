import crypto from 'crypto';

import { Game } from '../../core/game/game.model.ts';
import { Table } from '../../core/game/table.model.ts';

import { AIService, BotAction } from '../../core/ai/ai-client.interface.ts';
import { LogService } from '../pokernow/log.service.ts';
import { HandOutcomesAPIService } from '../../services/db/handoutcomes.service.ts';
import { PlayerStatsAPIService } from '../../services/db/playerstatsapi.service.ts';
import { PuppeteerService } from '../pokernow/puppeteer.service.ts';

import { AIConfig } from '../../core/ai/ai-config.interface.ts';
import { sleep } from '../../utils/bot-timeout.helper.ts';
import { DebugMode, logResponse } from '../../utils/error-handling.util.ts';
import { Logger } from '../../utils/logger.util.ts';

import { ActionExecutor } from '../pokernow/action-executor.ts';
import { DecisionEngine, DecisionTrace } from '../../core/poker/decision-engine.ts';
import { StatsContextBuilder } from './stats-context-builder.ts';
import { PuppeteerActionAvailability } from '../pokernow/puppeteer-action-availability.ts';
import { HandState } from '../../core/game/hand-state.ts';
import { GameStateBuilder, ProcessPlayersGuard } from '../pokernow/state-builder.ts';

// A completed live decision, streamed worker -> main after each decide(). Plain
// serializable object (structured-clone safe — no class instances). Superset of the
// arena DecisionLog (street/prompt/raw_response/parsed_action/events) plus the live
// game context a standalone display needs, so one dashboard component renders both.
export interface LiveDecisionEvent {
    bot_uuid: string;
    hand_number: number;
    street: string;            // "" preflop | "flop" | "turn" | "river"
    holeCards: string[];
    board: string[];           // community cards visible this street (empty preflop)
    pot: number;               // BB
    heroStack: number;         // BB
    toCall: number | null;     // null until live betting-context is wired
    action: string;            // parsed action, e.g. "raise"
    amount: number;            // BB total
    prompt: string;            // mirrors arena DecisionLog.prompt
    reasoning: string;         // raw model text: reasoning + Final Answer (record-only)
    events: { kind: string }[]; // rethink/fallback, mirrors arena DecisionLog.events
    timestamp: number;         // Date.now()
}

// Fire-and-forget sink the worker wires to port.postMessage. Kept generic so Bot
// stays decoupled from worker_threads.
export type BotEventEmit = (message: { event_name: string; payload: unknown }) => void;

const RUNOUT_CARD_RE = /(10|[2-9TJQKA])([shdc])/gi;
function parseRunout(runout: string): string[] {
    if (!runout) return [];
    return Array.from(runout.matchAll(RUNOUT_CARD_RE), (m) => m[1] + m[2]);
}

export class Bot {
    private bot_uuid: crypto.UUID;
    private game_id: string;
    private debug_mode: DebugMode;
    private query_retries: number;
    private query_delay_ms: number;
    private fetch_sleep_ms: number;

    private ai_service: AIService;
    private log_service: LogService;
    private player_service: PlayerStatsAPIService;
    private hand_outcomes_service: HandOutcomesAPIService;
    private puppeteer_service: PuppeteerService;
    private logger: Logger;

    private state: HandState;

    private stateBuilder!: GameStateBuilder;
    private decisionEngine!: DecisionEngine;
    private executor!: ActionExecutor;

    // Optional worker->main event sink (SSE streaming); undefined = no streaming.
    private emit?: BotEventEmit;
    // Latest decision trace, stashed by the DecisionEngine onDecision sink so tick()
    // can fold prompt/raw_response/events into the streamed decision event.
    private lastTrace?: DecisionTrace;

    constructor(
        bot_uuid: crypto.UUID,
        ai_service: AIService,
        ai_config: AIConfig,
        log_service: LogService,
        player_service: PlayerStatsAPIService,
        hand_outcomes_service: HandOutcomesAPIService,
        puppeteer_service: PuppeteerService,
        logger: Logger,
        game_id: string,
        debug_mode: DebugMode,
        query_retries: number,
        query_delay_ms: number,
        fetch_sleep_ms: number,
        emit?: BotEventEmit,
    ) {
        this.bot_uuid = bot_uuid;
        this.ai_service = ai_service;
        this.log_service = log_service;
        this.player_service = player_service;
        this.hand_outcomes_service = hand_outcomes_service;
        this.puppeteer_service = puppeteer_service;
        this.logger = logger;
        this.game_id = game_id;
        this.debug_mode = debug_mode;
        this.query_retries = query_retries;
        this.query_delay_ms = query_delay_ms;
        this.fetch_sleep_ms = fetch_sleep_ms;
        this.emit = emit;

        this.state = new HandState(bot_uuid, ai_config.provider, ai_config.model_name, game_id);
    }

    public stop(): void {
        this.state.active = false;
    }

    public async run(process_players_guard?: ProcessPlayersGuard): Promise<void> {
        await this.initialize(process_players_guard);
        while (this.state.active) {
            await this.tick();
        }
    }

    public async tick(): Promise<void> {
        const game = await this.stateBuilder.build();
        if (!game) return;
        const decision = await this.decisionEngine.decide(game);
        this.emitDecision(game, decision);
        await this.executor.execute(decision);
    }

    // Stream the completed decision worker->main, fire-and-forget. Runs AFTER
    // decide() returns (off the action-clock critical path) and never throws into
    // the tick loop — streaming must not affect play.
    private emitDecision(game: Game, decision: BotAction): void {
        if (!this.emit) return;
        try {
            const table = game.getTable();
            const hero = game.getHero();
            const trace = this.lastTrace;
            const payload: LiveDecisionEvent = {
                bot_uuid: this.bot_uuid,
                hand_number: this.state.hand_number,
                street: table.getStreet() ?? "",
                holeCards: hero ? hero.getHand() : [],
                board: parseRunout(table.getRunout()),
                pot: table.getPot(),
                heroStack: hero ? hero.getStackSize() : 0,
                toCall: table.getAmountToCall(),
                action: decision.action_str,
                amount: decision.bet_size_in_BBs,
                prompt: trace?.prompt ?? "",
                reasoning: trace?.raw_response ?? this.ai_service.getLastRawResponse(),
                events: (trace?.events ?? []).map((kind) => ({ kind })),
                timestamp: Date.now(),
            };
            this.emit({ event_name: `${this.bot_uuid}-decision`, payload });
        } catch (err) {
            this.logger.error("Failed to emit decision event (non-fatal):", err);
        }
    }

    public async openGame(): Promise<void> {
        this.logger.info(`The PokerNow game with id: ${this.game_id} will now open.`);

        logResponse(await this.puppeteer_service.navigateToGame(this.game_id), this.debug_mode);
        logResponse(await this.puppeteer_service.waitForGameInfo(), this.debug_mode);

        this.logger.info("Getting game info.");
        const res = await this.puppeteer_service.getGameInfo();
        logResponse(res, this.debug_mode);
        if (res.code !== "success") {
            throw new Error("Failed to get game info.");
        }
        const game_info = this.puppeteer_service.convertGameInfo(res.data as string);
        this.state.table = new Table(this.player_service);
        this.state.game = new Game(this.game_id, this.state.table, game_info.big_blind, game_info.small_blind, game_info.game_type, 30);
    }

    public async enterTableInProgress(name: string, stack_size: number): Promise<void> {
        this.logger.info(`Your player name will be ${name}.`);
        this.state.bot_name = name;
        this.ai_service.setBotName(name);

        this.logger.info(`Your initial stack size will be ${stack_size}.`);

        await sleep(1000);
        this.logger.info(`Attempting to enter table with name: ${name} and stack size: ${stack_size}.`);
        const res = await this.puppeteer_service.sendEnterTableRequest(name, stack_size);

        if (res.code === "success") {
            this.logger.info("Waiting for table host to accept ingress request.");
            if (logResponse(await this.puppeteer_service.waitForTableEntry(), this.debug_mode) !== "success") {
                throw new Error("Table ingress request rejected, please try again.");
            }
        } else {
            throw res.error;
        }
    }

    private async initialize(guard?: ProcessPlayersGuard): Promise<void> {
        logResponse(await this.puppeteer_service.openLogPanel(), this.debug_mode);
        try {
            const hand_info_res = await this.puppeteer_service.getStartingHandInfo();
            if (hand_info_res.code === "success" && hand_info_res.data.hand_number > 0) {
                this.state.hand_number = hand_info_res.data.hand_number;
                this.logger.info("Initialized hand number from log:", this.state.hand_number);
            } else {
                this.logger.info("No hand info in log yet, defaulting hand number to 1.");
            }
        } finally {
            logResponse(await this.puppeteer_service.closeLogPanel(), this.debug_mode);
        }

        const num_res = await this.puppeteer_service.getNumPlayers();
        if (num_res.code === "success") {
            this.state.table.setNumPlayers(Number(num_res.data));
        }

        this.stateBuilder = new GameStateBuilder(
            this.puppeteer_service,
            this.log_service,
            this.ai_service,
            this.hand_outcomes_service,
            this.state,
            this.logger,
            this.debug_mode,
            guard,
            this.fetch_sleep_ms,
        );
        this.decisionEngine = new DecisionEngine(
            this.ai_service,
            new PuppeteerActionAvailability(this.puppeteer_service),
            new StatsContextBuilder(),
            this.state,
            this.logger,
            this.query_retries,
            this.query_delay_ms,
            undefined, // onEvent (rethink/fallback) — folded into the trace below
            (trace) => { this.lastTrace = trace; }, // onDecision: stash for streaming
        );
        this.executor = new ActionExecutor(
            this.puppeteer_service,
            this.state,
            this.logger,
            this.debug_mode,
        );
    }
}
