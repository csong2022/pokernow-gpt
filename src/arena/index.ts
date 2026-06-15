import dotenv from 'dotenv';
import path from 'path';

import { AIConfig } from '../core/ai/ai-config.interface.ts';
import { PokerKitClient } from './engine/pokerkit-client.ts';
import { TableConfig } from './engine/protocol.ts';
import { Agent, LLMAgent, StubAgent } from './agent.ts';
import { HandLog } from './hand-log.ts';
import { runHands } from './runner.ts';

dotenv.config();

interface Args {
    hands: number;
    players: number;
    sb: number;
    bb: number;
    minBet: number;
    stack: number;
    mode: 'cash' | 'tournament';
    llm?: string; // "Provider:model,Provider:model" (one per seat)
    out: string;
}

function parseArgs(argv: string[]): Args {
    const get = (flag: string): string | undefined => {
        const i = argv.indexOf(flag);
        return i >= 0 ? argv[i + 1] : undefined;
    };
    const num = (flag: string, def: number): number => {
        const v = get(flag);
        return v == null ? def : Number(v);
    };
    const hands = num('--hands', 5);
    const players = num('--players', 2);
    const bb = num('--bb', 2);
    return {
        hands,
        players,
        bb,
        sb: num('--sb', Math.floor(bb / 2) || 1),
        minBet: num('--min-bet', bb),
        stack: num('--stack', 200),
        mode: (get('--mode') as 'cash' | 'tournament') ?? 'cash',
        llm: get('--llm'),
        out: get('--out') ?? path.join('arena-logs', `hands-${Date.now()}.jsonl`),
    };
}

function buildAgents(args: Args, gameId: string): Agent[] {
    if (!args.llm) {
        return Array.from({ length: args.players }, (_, seat) => new StubAgent(`stub#${seat}`));
    }
    const specs = args.llm.split(',').map((s) => s.trim()).filter(Boolean);
    if (specs.length !== args.players) {
        throw new Error(`--llm lists ${specs.length} models but --players is ${args.players}`);
    }
    return specs.map((spec, seat) => {
        const [provider, model_name] = spec.split(':');
        if (!provider || !model_name) throw new Error(`bad --llm spec "${spec}" (want Provider:model)`);
        const cfg: AIConfig = { provider, model_name, playstyle: 'neutral' };
        return new LLMAgent(seat, cfg, gameId);
    });
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    const gameId = 'arena';
    const config: TableConfig = {
        blinds: [args.sb, args.bb],
        min_bet: args.minBet,
        starting_stacks: args.stack,
        player_count: args.players,
        mode: args.mode,
    };

    const client = new PokerKitClient();
    client.start();
    const log = new HandLog(args.out);

    console.log(`Arena: ${args.hands} hands, ${args.players} players, ${args.llm ? 'LLM' : 'stub'} agents -> ${args.out}`);
    try {
        await runHands({ client, config, agents: buildAgents(args, gameId), hands: args.hands, log });
        console.log(`Done. Wrote ${args.hands} hand records to ${args.out}`);
    } finally {
        client.stop();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
