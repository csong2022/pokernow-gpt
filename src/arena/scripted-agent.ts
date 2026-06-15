import { Game } from '../core/game/game.model.ts';

import { StateView } from './engine/protocol.ts';
import { DesiredAction } from './action-policy.ts';
import { Agent } from './agent.ts';

const RANK_VALUE: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    T: 10, '10': 10, J: 11, Q: 12, K: 13, A: 14,
};

// Crude deterministic preflop-ish hand score in [0,1] from two hole cards.
function holeScore(cards: string[]): number {
    if (cards.length < 2) return 0;
    const r1 = RANK_VALUE[cards[0].slice(0, -1)] ?? 0;
    const r2 = RANK_VALUE[cards[1].slice(0, -1)] ?? 0;
    const high = Math.max(r1, r2);
    const low = Math.min(r1, r2);
    const suited = cards[0].slice(-1) === cards[1].slice(-1);
    let score = (high + low) / 28;
    if (r1 === r2) score += 0.30;          // pair
    if (suited) score += 0.08;             // suited
    const gap = high - low;
    if (gap === 1) score += 0.06;          // connected
    else score -= Math.min(gap, 5) * 0.02; // gappers
    return Math.max(0, Math.min(1, score));
}

export interface ThresholdParams {
    name: string;
    raiseT: number;        // score >= this and facing a bet -> raise (or open-raise)
    callT: number;         // score >= this and facing a bet -> call
    betT: number;          // score >= this and unbet pot -> bet
    raiseToBB: number;     // open/raise size in BB
    betPotFraction: number;
}

// Deterministic, RNG-free rule-based agent. It REACTS to whether it's facing a
// bet, so who-acts-before-whom changes its decisions — which is what makes the
// duplicate cyclic-vs-full distinction measurable at 3-max. Distinct thresholds
// make distinct "models".
export class ThresholdAgent implements Agent {
    readonly name: string;
    constructor(private readonly p: ThresholdParams) {
        this.name = p.name;
    }

    startHand(): void {}

    async decide(_game: Game, view: StateView, heroSeat: number): Promise<DesiredAction> {
        const la = view.legal_actions!;
        const score = holeScore(view.hole_cards[heroSeat] ?? []);
        const facingBet = la.check_call && la.check_call_amount > 0;

        if (facingBet) {
            if (la.raise && score >= this.p.raiseT) return { kind: 'raise', amountBB: this.p.raiseToBB };
            if (score >= this.p.callT) return { kind: 'call' };
            return la.fold ? { kind: 'fold' } : { kind: 'check' };
        }
        // Unbet pot: open/bet strong hands, otherwise check.
        if (la.raise && score >= this.p.betT) {
            const potBB = view.total_pot / view.big_blind;
            return { kind: 'bet', amountBB: Math.max(this.p.raiseToBB, potBB * this.p.betPotFraction) };
        }
        return { kind: 'check' };
    }
}

// Three distinct deterministic styles for calibration / smoke use.
export function calibrationAgents(): ThresholdAgent[] {
    return [
        new ThresholdAgent({ name: 'tight', raiseT: 0.78, callT: 0.55, betT: 0.68, raiseToBB: 3, betPotFraction: 0.5 }),
        new ThresholdAgent({ name: 'loose', raiseT: 0.55, callT: 0.32, betT: 0.45, raiseToBB: 3, betPotFraction: 0.5 }),
        new ThresholdAgent({ name: 'aggro', raiseT: 0.60, callT: 0.42, betT: 0.50, raiseToBB: 4, betPotFraction: 0.75 }),
    ];
}
