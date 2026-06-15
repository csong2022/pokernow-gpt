import { PokerKitClient } from './engine/pokerkit-client.ts';
import { TableConfig } from './engine/protocol.ts';
import { ArenaEnvironment } from './environment.ts';
import { InMemoryPlayerStatsRepository } from './player-stats.repository.ts';
import { Agent } from './agent.ts';
import { HandLog } from './hand-log.ts';
import { generateDeck } from './deck.ts';
import { playDecisionLoop } from './runner.ts';

export interface DuplicateRunOptions {
    client: PokerKitClient;
    config: TableConfig;
    agents: Agent[]; // one per model; length === player_count
    deals: number;
    log: HandLog;
    gameId?: string;
    rng?: () => number;
}

// Duplicate-deck harness (full rotation). For each deal we generate ONE deck and
// replay it P times (P = player_count), rotating which model sits in which seat,
// so every model plays the same cards in every position. Card luck cancels when
// the analysis sums a model's results across the deal. Hands are tagged with
// deal_id + rotation so the analysis can group them; the per-hand log is
// otherwise identical to the plain runner.
export async function runDuplicate(opts: DuplicateRunOptions): Promise<void> {
    const { client, config, agents, deals, log } = opts;
    const P = config.player_count;
    if (agents.length !== P) {
        throw new Error(`runDuplicate: ${agents.length} agents but player_count is ${P}`);
    }
    const gameId = opts.gameId ?? 'arena';
    const rng = opts.rng ?? Math.random;
    const repo = new InMemoryPlayerStatsRepository();
    const env = new ArenaEnvironment(client, gameId);

    await client.createGame({ game_id: gameId, ...config });

    let handIndex = 0;
    for (let deal = 0; deal < deals; deal++) {
        const deck = generateDeck(rng);
        for (let rotation = 0; rotation < P; rotation++) {
            // seat -> model: rotate the assignment so each model visits each seat once.
            const seatAgents = Array.from({ length: P }, (_, seat) => agents[(((seat - rotation) % P) + P) % P]);
            seatAgents.forEach((a) => a.startHand());

            const first = await env.startHand({ deck });
            const { malformed, resolved } = await playDecisionLoop(env, first, seatAgents, repo);
            const sd = await env.showdown();

            log.write({
                hand: handIndex++,
                deal_id: deal,
                rotation,
                game_id: gameId,
                config,
                agents: seatAgents.map((a) => a.name),
                ...sd.hand_record,
                winners: sd.winners,
                payouts: sd.payouts,
                resolved_actions: resolved,
                malformed_events: malformed,
            });
        }
    }

    await env.end();
}
