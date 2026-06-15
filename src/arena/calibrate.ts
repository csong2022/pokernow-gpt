import { unlinkSync } from 'fs';

import { PokerKitClient } from './engine/pokerkit-client.ts';
import { TableConfig } from './engine/protocol.ts';
import { HandLog } from './hand-log.ts';
import { RotationMode, runDuplicate } from './duplicate-runner.ts';
import { calibrationAgents } from './scripted-agent.ts';
import { seededRng } from './deck.ts';
import { loadHandLogs } from './analysis/load.ts';
import { aggregateByModel } from './analysis/aggregate.ts';
import { ModelSummary } from './analysis/types.ts';

// Quantifies the cost of the cyclic rotation shortcut. With DETERMINISTIC agents
// and the SAME decks, we run the duplicate harness both ways at 3-max and compare
// the variance-reduced CI. Both modes cancel first-order (card) luck; only `full`
// also cancels pairwise opponent-ordering, so a residual `cyclic > full` is the
// price of the shortcut — a number, not "standard practice".

const DEALS = Number(process.env.CAL_DEALS ?? 300);
const SEED = 0xC0FFEE;

async function run(client: PokerKitClient, mode: RotationMode, out: string): Promise<ModelSummary[]> {
    const config: TableConfig = { blinds: [1, 2], min_bet: 2, starting_stacks: 200, player_count: 3, mode: 'cash' };
    try { unlinkSync(out); } catch { /* fresh file */ }
    await runDuplicate({
        client,
        config,
        agents: calibrationAgents(),
        deals: DEALS,
        log: new HandLog(out),
        rng: seededRng(SEED),       // same seed => identical decks across modes
        rotation: mode,
        gameId: `cal-${mode}`,
    });
    return aggregateByModel(loadHandLogs(out));
}

async function main(): Promise<void> {
    const client = new PokerKitClient();
    client.start();
    try {
        const cyclic = await run(client, 'cyclic', 'arena-analysis/cal-cyclic.jsonl');
        const full = await run(client, 'full', 'arena-analysis/cal-full.jsonl');
        const byFull = new Map(full.map((s) => [s.model, s]));

        console.log(`\nDeterministic duplicate calibration — 3-max, ${DEALS} deals, identical decks (seed ${SEED.toString(16)})`);
        console.log('Variance-reduced 95% CI half-width in bb/100 (lower = more variance removed):\n');
        console.log(['model', 'cyclic +/-', 'full +/-', 'cyclic residual'].map((c) => c.padEnd(16)).join(''));
        console.log('-'.repeat(64));
        for (const c of cyclic) {
            const f = byFull.get(c.model)!;
            const cyc = c.reduced!.ci95HalfWidthBBPer100 ?? NaN;
            const ful = f.reduced!.ci95HalfWidthBBPer100 ?? NaN;
            const residual = ful > 0 ? `${(cyc / ful).toFixed(2)}x wider` : 'n/a';
            console.log([c.model, cyc.toFixed(2), ful.toFixed(2), residual].map((x) => String(x).padEnd(16)).join(''));
        }
        console.log('\ncyclic each seat once (Latin square); full = all P! seatings (exact 1st+2nd order).');
        console.log('A cyclic residual > 1x is the uncancelled pairwise opponent-ordering variance.');
    } finally {
        client.stop();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
