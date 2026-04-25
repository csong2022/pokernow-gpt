import crypto from 'crypto';

import { Game } from '../core/game/game.model.ts';
import { Table } from '../core/game/table.model.ts';

import { AIService } from '../services/ai/ai-client.interface.ts';
import { LogService } from '../services/logs/log.service.ts';
import { PlayerStatsAPIService } from '../services/db/playerstatsapi.service.ts';
import { PuppeteerService } from '../services/puppeteer/puppeteer.service.ts';

import { sleep } from '../utils/bot-timeout.helper.ts';
import { DebugMode, logResponse } from '../utils/error-handling.util.ts';

import { ActionExecutor } from './action-executor.ts';
import { DecisionEngine } from './decision-engine.ts';
import { HandState } from './hand-state.ts';
import { GameStateBuilder, ProcessPlayersGuard } from './state-builder.ts';

export class Bot {
    private bot_uuid: crypto.UUID;
    private game_id: string;
    private debug_mode: DebugMode;
    private query_retries: number;

    private ai_service: AIService;
    private log_service: LogService;
    private player_service: PlayerStatsAPIService;
    private puppeteer_service: PuppeteerService;

    private state = new HandState();

    private stateBuilder!: GameStateBuilder;
    private decisionEngine!: DecisionEngine;
    private executor!: ActionExecutor;

    constructor(
        bot_uuid: crypto.UUID,
        ai_service: AIService,
        log_service: LogService,
        player_service: PlayerStatsAPIService,
        puppeteer_service: PuppeteerService,
        game_id: string,
        debug_mode: DebugMode,
        query_retries: number,
    ) {
        this.bot_uuid = bot_uuid;
        this.ai_service = ai_service;
        this.log_service = log_service;
        this.player_service = player_service;
        this.puppeteer_service = puppeteer_service;
        this.game_id = game_id;
        this.debug_mode = debug_mode;
        this.query_retries = query_retries;
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
        await this.executor.execute(decision);
    }

    public async openGame(): Promise<void> {
        console.log(`The PokerNow game with id: ${this.game_id} will now open.`);

        logResponse(await this.puppeteer_service.navigateToGame(this.game_id), this.debug_mode);
        logResponse(await this.puppeteer_service.waitForGameInfo(), this.debug_mode);

        console.log("Getting game info.");
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
        console.log(`Your player name will be ${name}.`);
        this.state.bot_name = name;
        this.ai_service.setBotName(name);

        console.log(`Your initial stack size will be ${stack_size}.`);

        await sleep(1000);
        console.log(`Attempting to enter table with name: ${name} and stack size: ${stack_size}.`);
        const res = await this.puppeteer_service.sendEnterTableRequest(name, stack_size);

        if (res.code === "success") {
            console.log("Waiting for table host to accept ingress request.");
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
                console.log("Initialized hand number from log:", this.state.hand_number);
            } else {
                console.log("No hand info in log yet, defaulting hand number to 1.");
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
            this.state,
            this.debug_mode,
            guard,
        );
        this.decisionEngine = new DecisionEngine(
            this.ai_service,
            this.puppeteer_service,
            this.state,
            this.query_retries,
        );
        this.executor = new ActionExecutor(
            this.puppeteer_service,
            this.state,
            this.debug_mode,
        );
    }
}
