import { Action } from '../../core/poker/action.enum.ts';
import type { ActionEntry, HandRecord, StyleStats } from './types.ts';
import { modelIdOf } from './aggregate.ts';

// Offline behavioral style stats (VPIP/PFR/3-bet/Fold-to-3-bet/AFq) over the
// ordered engine action list. Pure: no engine, no live imports. The 3-bet logic
// mirrors live's detectPreflopAggression (src/live/pokernow/log-processing.util.ts)
// but is REIMPLEMENTED here over ActionEntry[] so the analysis stays self-contained.
//
// Denominators: VPIP/PFR over hands the model was dealt into; 3-Bet over 3-bet
// opportunities; Fold-to-3-Bet over hands the model faced a 3-bet; AFq =
// (bets+raises)/(bets+raises+calls+folds) across all streets. Blind posts are
// excluded (the engine emits none).

interface Acc {
    hands: number;
    vpip: number;
    pfr: number;
    tbOpp: number;
    tb: number;
    faced: number;
    folded: number;
    bets: number;
    raises: number;
    calls: number;
    folds: number;
}

const PREFLOP = 0;
const isAggressive = (type: string): boolean => type === Action.RAISE || type === Action.BET;
const isVoluntary = (type: string): boolean => isAggressive(type) || type === Action.CALL;

function emptyAcc(): Acc {
    return { hands: 0, vpip: 0, pfr: 0, tbOpp: 0, tb: 0, faced: 0, folded: 0, bets: 0, raises: 0, calls: 0, folds: 0 };
}

// Per-hand, per-seat preflop facts: did the seat VPIP, did it PFR, did it have a
// 3-bet opportunity / 3-bet, and (for the opener) did it face / fold to a 3-bet.
// Single chronological pass over the preflop actions, mirroring live's logic.
function analyzePreflop(actions: ActionEntry[]): Map<number, { vpip: boolean; pfr: boolean; tbOpp: boolean; tb: boolean; faced: boolean; folded: boolean }> {
    const seats = new Map<number, { vpip: boolean; pfr: boolean; tbOpp: boolean; tb: boolean; faced: boolean; folded: boolean }>();
    const get = (seat: number) => {
        let s = seats.get(seat);
        if (!s) { s = { vpip: false, pfr: false, tbOpp: false, tb: false, faced: false, folded: false }; seats.set(seat, s); }
        return s;
    };

    let voluntaryRaises = 0;
    let openerSeat: number | null = null;
    let threeBetMade = false;
    let openerResponded = false;
    const acted = new Set<number>();

    for (const a of actions) {
        if (a.street_index !== PREFLOP) continue;
        if (a.type === Action.POST) continue;
        const s = get(a.seat);

        if (isVoluntary(a.type)) s.vpip = true;
        if (isAggressive(a.type)) s.pfr = true;

        // 3-bet opportunity / 3-bet: first time this seat acts with exactly one
        // prior voluntary raise on the table (the open).
        if (!acted.has(a.seat) && voluntaryRaises === 1) {
            s.tbOpp = true;
            if (isAggressive(a.type)) s.tb = true;
        }
        // Opener = first voluntary raiser.
        if (voluntaryRaises === 0 && isAggressive(a.type)) openerSeat = a.seat;
        // A 3-bet just happened (a raise on top of the open).
        if (voluntaryRaises === 1 && isAggressive(a.type)) threeBetMade = true;
        // Opener's first response to the 3-bet.
        if (threeBetMade && openerSeat !== null && a.seat === openerSeat && !openerResponded) {
            openerResponded = true;
            get(openerSeat).faced = true;
            if (a.type === Action.FOLD) get(openerSeat).folded = true;
        }

        acted.add(a.seat);
        if (isAggressive(a.type)) voluntaryRaises += 1;
    }
    return seats;
}

export function computeStyleByModel(records: HandRecord[]): StyleStats[] {
    const accs = new Map<string, Acc>();
    const acc = (model: string) => {
        let a = accs.get(model);
        if (!a) { a = emptyAcc(); accs.set(model, a); }
        return a;
    };

    for (const rec of records) {
        if (!rec.actions || !rec.agents) continue; // can't derive style without the action list

        // Hands dealt: one row per seat the model occupied (matches the win-rate hands count).
        for (let seat = 0; seat < rec.agents.length; seat++) {
            acc(modelIdOf(rec.agents[seat])).hands += 1;
        }

        // Preflop facts per seat.
        const pre = analyzePreflop(rec.actions);
        for (const [seat, f] of pre) {
            const agent = rec.agents[seat];
            if (agent == null) continue;
            const a = acc(modelIdOf(agent));
            if (f.vpip) a.vpip += 1;
            if (f.pfr) a.pfr += 1;
            if (f.tbOpp) a.tbOpp += 1;
            if (f.tb) a.tb += 1;
            if (f.faced) a.faced += 1;
            if (f.folded) a.folded += 1;
        }

        // Aggression counts over ALL streets.
        for (const act of rec.actions) {
            const agent = rec.agents[act.seat];
            if (agent == null) continue;
            const a = acc(modelIdOf(agent));
            switch (act.type) {
                case Action.BET: a.bets += 1; break;
                case Action.RAISE: a.raises += 1; break;
                case Action.CALL: a.calls += 1; break;
                case Action.FOLD: a.folds += 1; break;
            }
        }
    }

    const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : 0);
    const out: StyleStats[] = [];
    for (const [model, a] of accs) {
        const afqDenom = a.bets + a.raises + a.calls + a.folds;
        out.push({
            model,
            hands: a.hands,
            vpipPct: pct(a.vpip, a.hands),
            pfrPct: pct(a.pfr, a.hands),
            threeBetPct: pct(a.tb, a.tbOpp),
            foldToThreeBetPct: pct(a.folded, a.faced),
            afqPct: pct(a.bets + a.raises, afqDenom),
            vpipHands: a.vpip,
            pfrHands: a.pfr,
            threeBetOpportunities: a.tbOpp,
            threeBetHands: a.tb,
            facedThreeBet: a.faced,
            foldedToThreeBet: a.folded,
            bets: a.bets,
            raises: a.raises,
            calls: a.calls,
            folds: a.folds,
        });
    }
    out.sort((x, y) => y.vpipPct - x.vpipPct);
    return out;
}
