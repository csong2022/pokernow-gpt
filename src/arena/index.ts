import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadRegistry, toAIConfig } from '../core/ai/model-registry.ts';
import { PokerKitClient } from './engine/pokerkit-client.ts';
import { TableConfig } from './engine/protocol.ts';
import { Agent, LLMAgent, StubAgent } from './agent.ts';
import { calibrationAgents } from './scripted-agent.ts';
import { HandLog } from './hand-log.ts';
import { runHands } from './runner.ts';
import { runDuplicate, RotationMode } from './duplicate-runner.ts';
import { currentGitCommit, formatOf, startRun } from './run-manifest.ts';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Composition root owns the registry path; core never hardcodes it.
const REGISTRY_PATH = path.resolve(__dirname, '..', 'config', 'models.json');

// --llm entries that are deterministic reference opponents, not paid registry models.
const REFERENCE_TOKENS = new Set(['stub', 'tight', 'loose', 'aggro']);

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
    playstyle?: string; // comma-separated per-seat playstyle, aligned to --llm (e.g. "passive,neutral,aggressive")
    tags: string[];
    notes: string;
    runsRoot: string;
}

// Playstyles the system prompt understands (see ai-query.helper playstyleToPrompt).
const VALID_PLAYSTYLES = new Set(['pro', 'aggressive', 'passive', 'neutral']);

function parseArgs(argv: string[]): Args {
    const get = (flag: string): string | undefined => {
        const i = argv.indexOf(flag);
        return i >= 0 ? argv[i + 1] : undefined;
    };
    // Collect every occurrence of a repeatable flag, allowing comma-separated values.
    const getAll = (flag: string): string[] => {
        const out: string[] = [];
        for (let i = 0; i < argv.length; i++) {
            if (argv[i] === flag && argv[i + 1] != null) out.push(...argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean));
        }
        return out;
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
        playstyle: get('--playstyle'),
        tags: getAll('--tag'),
        notes: get('--notes') ?? '',
        runsRoot: get('--runs-root') ?? 'arena-runs',
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
    // Reference tokens are deterministic, free opponents so one paid model can play
    // against a FIXED reference field (style smoke: "gpt-5.4-mini,aggro,tight").
    // "stub" = generic passive; "tight"/"loose"/"aggro" = scripted threshold agents
    // ("aggro" open-raises, so the paid model gets 3-bet opportunities).
    const cal = new Map(calibrationAgents().map((a) => [a.name, a]));
    const registry = ids.some((id) => !REFERENCE_TOKENS.has(id)) ? loadRegistry(REGISTRY_PATH) : null;
    // Per-seat playstyle, aligned to --llm; defaults to neutral. Lets us vary STYLE
    // while holding model + reasoning effort fixed (e.g. one model at passive/neutral/
    // aggressive). Ignored for reference tokens (stub/threshold agents have no prompt).
    const playstyles = (args.playstyle ?? '').split(',').map((s) => s.trim());
    for (const ps of playstyles) {
        if (ps && !VALID_PLAYSTYLES.has(ps)) throw new Error(`--playstyle "${ps}" invalid; use ${[...VALID_PLAYSTYLES].join('/')}`);
    }
    return ids.map((id, seat) => {
        if (id === 'stub') return new StubAgent(`stub#${seat}`);
        const ref = cal.get(id);
        if (ref) return ref; // deterministic + stateless -> safe to reuse
        const playstyle = playstyles[seat] || 'neutral';
        // toAIConfig throws "unknown model id: X (not in registry)" on an unregistered id.
        return new LLMAgent(seat, toAIConfig(registry!, id, playstyle), gameId);
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

    const kind = args.llm ? 'LLM' : 'stub';
    const models = args.llm ? args.llm.split(',').map((s) => s.trim()).filter((s) => s && !REFERENCE_TOKENS.has(s)) : [];
    const format = formatOf(args.players);
    const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
    const replaysPerDeal = args.duplicate ? (args.rotation === 'full' ? factorial(args.players) : args.players) : 1;

    // Auto-tags so the index is a complete, filterable record of what exists.
    const tags = [...new Set([
        ...args.tags,
        ...(kind === 'stub' ? ['stub'] : []),
        ...(args.duplicate ? [] : ['plain']),
    ])];
    const notes = [
        args.notes,
        format === 'HU' && args.duplicate ? 'rotation full≡cyclic at HU' : '',
    ].filter(Boolean).join('; ');

    // Composition root owns run identity: create arena-runs/<runId>/ + manifest now,
    // then write hands.jsonl into it. Runners stay unaware (they just take a HandLog).
    const run = startRun(args.runsRoot, {
        createdAt: new Date().toISOString(),
        gitCommit: currentGitCommit(),
        format,
        models,
        rotation: args.duplicate ? args.rotation : 'none',
        deals: args.duplicate ? args.deals : null,
        replaysPerDeal,
        tags,
        notes,
        results: null,
    });

    const client = new PokerKitClient();
    client.start();
    const log = new HandLog(run.handsPath);
    const agents = buildAgents(args, gameId);

    try {
        if (args.duplicate) {
            const total = args.deals * replaysPerDeal;
            console.log(`Arena (duplicate-deck, ${args.rotation} rotation): ${args.deals} deals x ${replaysPerDeal} = ${total} hands, ${kind} agents -> ${run.dir}`);
            await runDuplicate({ client, config, agents, deals: args.deals, log, rotation: args.rotation });
            console.log(`Done. Wrote ${total} hand records (${args.deals} deals) to ${run.handsPath}`);
        } else {
            console.log(`Arena: ${args.hands} hands, ${args.players} players, ${kind} agents -> ${run.dir}`);
            await runHands({ client, config, agents, hands: args.hands, log });
            console.log(`Done. Wrote ${args.hands} hand records to ${run.handsPath}`);
        }
        console.log(`Run id: ${run.runId}  (manifest: ${run.dir}/manifest.json)`);
    } finally {
        client.stop();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
