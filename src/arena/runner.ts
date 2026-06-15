import { PokerKitClient } from './engine/pokerkit-client.ts';
import { TableConfig } from './engine/protocol.ts';
import { ArenaEnvironment } from './environment.ts';
import { mapStateView } from './state-mapper.ts';
import { InMemoryPlayerStatsRepository } from './player-stats.repository.ts';
import { Agent } from './agent.ts';
import { MalformedEvent, resolveAction } from './action-policy.ts';
import { HandLog } from './hand-log.ts';

export interface RunOptions {
    client: PokerKitClient;
    config: TableConfig;
    agents: Agent[]; // one per seat, length === player_count
    hands: number;
    log: HandLog;
    gameId?: string;
}

const MAX_STEPS_PER_HAND = 1000; // safety valve against an engine/agent stall

// Runs N hands sequentially: create_game -> per hand { start_hand -> decision
// loop -> showdown -> log }. Rules/payouts are PokerKit's; this only routes
// decisions and records the result.
export async function runHands(opts: RunOptions): Promise<void> {
    const { client, config, agents, hands, log } = opts;
    const gameId = opts.gameId ?? 'arena';
    const repo = new InMemoryPlayerStatsRepository();
    const env = new ArenaEnvironment(client, gameId);

    await client.createGame({ game_id: gameId, ...config });

    for (let hand = 0; hand < hands; hand++) {
        agents.forEach((a) => a.startHand());
        let view = await env.startHand();

        const malformed: MalformedEvent[] = [];
        const resolved: Array<{ seat: number; desired: unknown; engineAction: unknown }> = [];

        let steps = 0;
        while (!view.hand_over && steps < MAX_STEPS_PER_HAND) {
            steps++;
            const seat = view.actor_index;
            if (seat == null || view.legal_actions == null) {
                // No decision pending but hand not over — engine should have dealt;
                // re-read once, then bail to avoid a spin loop.
                view = await env.getState();
                if (view.actor_index == null && !view.hand_over) break;
                continue;
            }
            const game = await mapStateView(view, seat, repo);
            const desired = await agents[seat].decide(game, view, seat);
            const r = resolveAction(seat, desired, view.legal_actions, view.big_blind);
            if (r.malformed) malformed.push(r.malformed);
            resolved.push({ seat, desired, engineAction: r.engineAction });
            view = await env.applyAction(r.engineAction);
        }

        const sd = await env.showdown();
        log.write({
            hand,
            game_id: gameId,
            config,
            agents: agents.map((a) => a.name),
            ...sd.hand_record,
            winners: sd.winners,
            payouts: sd.payouts,
            resolved_actions: resolved,
            malformed_events: malformed,
        });
    }

    await env.end();
}
