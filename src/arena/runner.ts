import { PokerKitClient } from './engine/pokerkit-client.ts';
import { StateView, TableConfig } from './engine/protocol.ts';
import { ArenaEnvironment } from './environment.ts';
import { mapStateView } from './state-mapper.ts';
import { InMemoryPlayerStatsRepository } from './player-stats.repository.ts';
import { PlayerStatsRepository } from '../core/player/playerstats-repository.interface.ts';
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

export interface HandPlayResult {
    view: StateView;
    malformed: MalformedEvent[];
    resolved: Array<{ seat: number; desired: unknown; engineAction: unknown }>;
    decisionEvents: Array<{ seat: number; kind: string }>;
}

const MAX_STEPS_PER_HAND = 1000; // safety valve against an engine/agent stall

// Run the decision loop for ONE hand (the hand must already be started). Pure
// routing: map state for the actor, ask its agent, clamp, apply. Shared by the
// plain runner and the duplicate-deck runner so they play hands identically.
export async function playDecisionLoop(
    env: ArenaEnvironment,
    firstView: StateView,
    seatAgents: Agent[],
    repo: PlayerStatsRepository,
): Promise<HandPlayResult> {
    let view = firstView;
    const malformed: MalformedEvent[] = [];
    const resolved: HandPlayResult['resolved'] = [];
    const decisionEvents: HandPlayResult['decisionEvents'] = [];

    let steps = 0;
    while (!view.hand_over && steps < MAX_STEPS_PER_HAND) {
        steps++;
        const seat = view.actor_index;
        if (seat == null || view.legal_actions == null) {
            view = await env.getState();
            if (view.actor_index == null && !view.hand_over) break;
            continue;
        }
        const game = await mapStateView(view, seat, repo);
        const agent = seatAgents[seat];
        const desired = await agent.decide(game, view, seat);
        if (agent.drainEvents) for (const kind of agent.drainEvents()) decisionEvents.push({ seat, kind });
        const r = resolveAction(seat, desired, view.legal_actions, view.big_blind);
        if (r.malformed) malformed.push(r.malformed);
        resolved.push({ seat, desired, engineAction: r.engineAction });
        view = await env.applyAction(r.engineAction);
    }
    return { view, malformed, resolved, decisionEvents };
}

// Plain sequential runner: N independent hands (random decks).
export async function runHands(opts: RunOptions): Promise<void> {
    const { client, config, agents, hands, log } = opts;
    const gameId = opts.gameId ?? 'arena';
    const repo = new InMemoryPlayerStatsRepository();
    const env = new ArenaEnvironment(client, gameId);

    await client.createGame({ game_id: gameId, ...config });

    for (let hand = 0; hand < hands; hand++) {
        agents.forEach((a) => a.startHand());
        const first = await env.startHand();
        const { malformed, resolved, decisionEvents } = await playDecisionLoop(env, first, agents, repo);
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
            decision_events: decisionEvents,
        });
    }

    await env.end();
}
