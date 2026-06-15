import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadRegistry, toAIConfig } from '../core/ai/model-registry.ts';
import { PokerKitClient } from './engine/pokerkit-client.ts';
import { TableConfig } from './engine/protocol.ts';
import { Agent, LLMAgent, StubAgent } from './agent.ts';
import { HandLog } from './hand-log.ts';
import { runHands } from './runner.ts';
import { runDuplicate, RotationMode } from './duplicate-runner.ts';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Composition root owns the registry path; core never hardcodes it.
const REGISTRY_PATH = path.resolve(__dirname, '..', 'config', 'models.json');

interface Args {
    hands: number;
    deals: number;
    duplicate: boolean;
    rotation: RotationMode;
    players: number;
    sb: number;
    bb: number;
    minBet: number;
    stack: number;
    mode: 'cash' | 'tournament';
    llm?: string; // comma-separated registry model ids, one per seat (e.g. "claude-haiku-4-5,gpt-5.4-nano")
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
    const duplicate = argv.includes('--duplicate');
    return {
        hands,
        deals: num('--deals', 25),
        duplicate,
        rotation: (get('--rotation') as RotationMode) ?? 'cyclic',
        players,
        bb,
        sb: num('--sb', Math.floor(bb / 2) || 1),
        minBet: num('--min-bet', bb),
        stack: num('--stack', 200),
        mode: (get('--mode') as 'cash' | 'tournament') ?? 'cash',
        llm: get('--llm'),
        out: get('--out') ?? path.join('arena-logs', `${duplicate ? 'dup' : 'hands'}-${Date.now()}.jsonl`),
    };
}

function buildAgents(args: Args, gameId: string): Agent[] {
    if (!args.llm) {
        return Array.from({ length: args.players }, (_, seat) => new StubAgent(`stub#${seat}`));
    }
    const ids = args.llm.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length !== args.players) {
        throw new Error(`--llm lists ${ids.length} model ids but --players is ${args.players}`);
    }
    const registry = loadRegistry(REGISTRY_PATH);
    return ids.map((id, seat) => {
        // toAIConfig throws "unknown model id: X (not in registry)" on an unregistered id.
        const cfg = toAIConfig(registry, id, 'neutral');
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
    const agents = buildAgents(args, gameId);
    const kind = args.llm ? 'LLM' : 'stub';

    try {
        if (args.duplicate) {
            const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
            const replays = args.rotation === 'full' ? factorial(args.players) : args.players;
            const total = args.deals * replays;
            console.log(`Arena (duplicate-deck, ${args.rotation} rotation): ${args.deals} deals x ${replays} = ${total} hands, ${kind} agents -> ${args.out}`);
            await runDuplicate({ client, config, agents, deals: args.deals, log, rotation: args.rotation });
            console.log(`Done. Wrote ${total} hand records (${args.deals} deals) to ${args.out}`);
        } else {
            console.log(`Arena: ${args.hands} hands, ${args.players} players, ${kind} agents -> ${args.out}`);
            await runHands({ client, config, agents, hands: args.hands, log });
            console.log(`Done. Wrote ${args.hands} hand records to ${args.out}`);
        }
    } finally {
        client.stop();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
