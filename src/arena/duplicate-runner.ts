import { PokerKitClient } from './engine/pokerkit-client.ts';
import { TableConfig } from './engine/protocol.ts';
import { ArenaEnvironment } from './environment.ts';
import { InMemoryPlayerStatsRepository } from './player-stats.repository.ts';
import { Agent } from './agent.ts';
import { HandLog } from './hand-log.ts';
import { generateDeck } from './deck.ts';
import { playDecisionLoop } from './runner.ts';

export type RotationMode = 'cyclic' | 'full';

export interface DuplicateRunOptions {
    client: PokerKitClient;
    config: TableConfig;
    agents: Agent[]; // one per model; length === player_count
    deals: number;
    log: HandLog;
    gameId?: string;
    rng?: () => number;
    rotation?: RotationMode; // default 'cyclic'
}

function permutations(items: number[]): number[][] {
    if (items.length <= 1) return [items.slice()];
    const out: number[][] = [];
    for (let i = 0; i < items.length; i++) {
        const rest = [...items.slice(0, i), ...items.slice(i + 1)];
        for (const p of permutations(rest)) out.push([items[i], ...p]);
    }
    return out;
}

// Seatings replayed for one deck. Each seating maps seat -> agent index.
//   cyclic: P rotations — each model in each seat once (Latin square). Removes
//           first-order seat bias; for P>=3 pairwise opponent ORDERING stays
//           confounded (A always has the same neighbours). = full perms at HU.
//   full:   all P! seatings — exact first- and second-order cancellation for
//           deterministic play; cost is factorial, so only use at small tables.
export function seatings(playerCount: number, mode: RotationMode): number[][] {
    if (mode === 'full') return permutations([...Array(playerCount).keys()]);
    return Array.from({ length: playerCount }, (_, rot) =>
        Array.from({ length: playerCount }, (_, seat) => ((seat - rot) % playerCount + playerCount) % playerCount),
    );
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
    const dealSeatings = seatings(P, opts.rotation ?? 'cyclic');

    await client.createGame({ game_id: gameId, ...config });

    let handIndex = 0;
    for (let deal = 0; deal < deals; deal++) {
        const deck = generateDeck(rng);
        for (let rotation = 0; rotation < dealSeatings.length; rotation++) {
            // seat -> model for this replay of the same deck.
            const seatAgents = dealSeatings[rotation].map((agentIdx) => agents[agentIdx]);
            seatAgents.forEach((a) => a.startHand());

            const first = await env.startHand({ deck });
            const { malformed, resolved, decisionEvents, decisions } = await playDecisionLoop(env, first, seatAgents, repo);
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
                decision_events: decisionEvents,
                decisions,
            });
        }
    }

    await env.end();
}
