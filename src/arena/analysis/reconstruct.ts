import type { ActionEntry, DecisionLog, HandRecord } from './types.ts';
import { modelIdOf } from './aggregate.ts';

// Offline hand reconstructor: turns one persisted hand record back into a fully
// explicable replay — who held what, the street-by-street board + ordered actions
// with amounts, each decision's parsed action (and raw reasoning, if logged), and
// final chip deltas — WITHOUT the engine. This is the substrate a future visualizer
// reads; pure (types only), reads existing fields, never the engine or stat passes.

// Cumulative community-card count by street index (0 preflop, 1 flop, 2 turn, 3 river).
const STREET_BOARD_COUNT = [0, 3, 4, 5];
const STREET_LABEL = ['preflop', 'flop', 'turn', 'river'];

export interface PlayerView {
    seat: number;
    model: string;
    hole: string[];
}
export interface StreetReplay {
    street: number;
    label: string;
    board: string[];      // community cards visible on this street
    actions: Array<{ seat: number; model: string; type: string; amount: number }>;
}
export interface ResultView {
    seat: number;
    model: string;
    delta: number;
}
export interface ReconstructedHand {
    players: PlayerView[];
    streets: StreetReplay[];
    results: ResultView[];
    decisions: DecisionLog[]; // pass-through: prompt / raw_response / parsed_action / events
}

export function reconstructHand(rec: HandRecord): ReconstructedHand {
    const players: PlayerView[] = (rec.agents ?? []).map((a, seat) => ({
        seat,
        model: modelIdOf(a),
        hole: rec.hole_cards?.[seat] ?? [],
    }));
    const modelAt = (seat: number): string => players[seat]?.model ?? `seat${seat}`;
    const board = rec.board ?? [];

    const byStreet = new Map<number, ActionEntry[]>();
    for (const a of rec.actions ?? []) {
        if (!byStreet.has(a.street_index)) byStreet.set(a.street_index, []);
        byStreet.get(a.street_index)!.push(a);
    }
    const streets: StreetReplay[] = [...byStreet.keys()].sort((x, y) => x - y).map((s) => ({
        street: s,
        label: STREET_LABEL[s] ?? `street${s}`,
        board: board.slice(0, STREET_BOARD_COUNT[s] ?? board.length),
        actions: byStreet.get(s)!.map((a) => ({ seat: a.seat, model: modelAt(a.seat), type: a.type, amount: a.amount })),
    }));

    const results: ResultView[] = (rec.deltas ?? []).map((delta, seat) => ({ seat, model: modelAt(seat), delta }));

    return { players, streets, results, decisions: rec.decisions ?? [] };
}

// Human-readable replay of a hand, for quick inspection / debugging.
export function renderHand(rec: HandRecord): string {
    const r = reconstructHand(rec);
    const lines: string[] = [];
    lines.push(`Hand ${rec.hand}${rec.deal_id != null ? ` (deal ${rec.deal_id}, rotation ${rec.rotation})` : ''}`);
    for (const p of r.players) lines.push(`  seat ${p.seat} ${p.model}: ${p.hole.join(' ') || '??'}`);
    for (const s of r.streets) {
        lines.push(`  -- ${s.label}${s.board.length ? ` [${s.board.join(' ')}]` : ''} --`);
        for (const a of s.actions) {
            lines.push(`     ${a.model} ${a.type}${a.amount ? ` ${a.amount}` : ''}`);
        }
    }
    lines.push('  result: ' + r.results.map((x) => `${x.model} ${x.delta >= 0 ? '+' : ''}${x.delta}`).join(', '));
    return lines.join('\n');
}
