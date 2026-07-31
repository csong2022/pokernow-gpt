import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadRegistry, toAIConfig } from '../core/ai/model-registry.ts';
import { AIConfig } from '../core/ai/ai-config.interface.ts';
import { PokerKitClient } from './engine/pokerkit-client.ts';
import { TableConfig } from './engine/protocol.ts';
import { Agent, LLMAgent, StubAgent } from './agent.ts';
import { calibrationAgents } from './scripted-agent.ts';
import { HandLog } from './hand-log.ts';
import { runHands } from './runner.ts';
import { runDuplicate, RotationMode } from './duplicate-runner.ts';
import { currentGitCommit, formatOf, startRun } from './run-manifest.ts';

dotenv.config({ quiet: true });

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
    probePrompt?: string; // probe-only tightness system-prompt key, applied to LLM seats
    tags: string[];
    notes: string;
    runsRoot: string;
}

// Playstyles the system prompt understands (see ai-query.helper playstyleToPrompt).
const VALID_PLAYSTYLES = new Set(['pro', 'aggressive', 'passive', 'neutral']);

// Probe-only tightness system-prompt overrides (NOT part of the shared playstyle
// set). Applied to the paid seat via --probe-prompt to test whether genuine
// tight-selective (low-VPIP) play is inducible. Arena-only, experiment scaffolding.
const TIGHTNESS_PROBES: Record<string, string> = {
    nit: "You are an extremely tight ('nit') poker player. Play ONLY premium starting hands — roughly the top 15-20% (big pairs, strong broadways, strong aces) — and FOLD the large majority of hands preflop. Hand selection comes first: fold marginal and speculative holdings regardless of position, price, or pot odds.",
    'anti-odds': "You are a disciplined, selective poker player. Do NOT enter pots based on price or pot odds — a cheap call or small amount to complete is NOT a reason to play a weak hand. Preflop, decide purely on hand strength and playability: fold weak and marginal holdings even when the call is cheap or you are getting good odds. Only continue with hands you would happily play for a raise.",
    tag: "You are a tight-aggressive ('TAG') poker player. Be very selective preflop — fold the majority of starting hands — but when you do play, be aggressive (raise rather than call, bet for value and pressure). Tight selection first, aggression second.",
    // Concrete hand-range list (~top 30%) — adjective-based calibration was bimodal
    // (strict prompts -> VPIP 3, hedged prompts -> VPIP 83). An explicit range anchors better.
    tight: "You are a tight, disciplined poker player. Preflop, play ONLY these starting hands and FOLD everything else: any pocket pair 66 or higher; ace-ten or stronger (AT, AJ, AQ, AK); king-queen (KQ); any suited ace (Axs); and suited connectors 87s and higher. Fold all other hands preflop regardless of position or price. Postflop, play normally based on hand strength.",
};

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
        probePrompt: get('--probe-prompt'),
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
    // Per-seat STYLE token, aligned to --llm; defaults to neutral. A token is either
    // a playstyle (pro/aggressive/passive/neutral) or a tightness-probe key
    // (nit/anti-odds/tag/tight). This lets ONE model run multiple styles in the same
    // table (e.g. "tight,neutral,aggressive") for a within-model style contrast — each
    // with a distinct identity label so the analysis can separate them. Ignored for
    // reference tokens (stub/threshold agents have no prompt).
    const styleTokens = (args.playstyle ?? '').split(',').map((s) => s.trim());
    for (const t of styleTokens) {
        if (t && !VALID_PLAYSTYLES.has(t) && !(t in TIGHTNESS_PROBES)) {
            throw new Error(`--playstyle "${t}" not a playstyle (${[...VALID_PLAYSTYLES].join('/')}) or probe (${Object.keys(TIGHTNESS_PROBES).join('/')})`);
        }
    }
    if (args.probePrompt && !(args.probePrompt in TIGHTNESS_PROBES)) {
        throw new Error(`--probe-prompt "${args.probePrompt}" invalid; use ${Object.keys(TIGHTNESS_PROBES).join('/')}`);
    }
    return ids.map((id, seat) => {
        if (id === 'stub') return new StubAgent(`stub#${seat}`);
        const ref = cal.get(id);
        if (ref) return ref; // deterministic + stateless -> safe to reuse
        const token = styleTokens[seat] || 'neutral';
        // toAIConfig throws "unknown model id: X (not in registry)" on an unregistered id.
        let cfg: AIConfig;
        let label: string | undefined;
        if (token in TIGHTNESS_PROBES) {
            cfg = toAIConfig(registry!, id, 'neutral');
            cfg.systemPrompt = TIGHTNESS_PROBES[token];
            label = token;
        } else {
            cfg = toAIConfig(registry!, id, token);
            label = token !== 'neutral' ? token : undefined;
        }
        // Run-wide --probe-prompt applies to any paid seat that didn't set a probe itself.
        if (args.probePrompt && !cfg.systemPrompt) {
            cfg.systemPrompt = TIGHTNESS_PROBES[args.probePrompt];
            label = args.probePrompt;
        }
        return new LLMAgent(seat, cfg, gameId, undefined, label);
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
