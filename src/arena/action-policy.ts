import { EngineAction, LegalActions } from './engine/protocol.ts';

// What an agent wants to do, in poker terms (before legality is enforced).
export type DesiredAction =
    | { kind: 'fold' }
    | { kind: 'check' }
    | { kind: 'call' }
    | { kind: 'bet'; amountBB: number }
    | { kind: 'raise'; amountBB: number }
    | { kind: 'allin' };

export interface MalformedEvent {
    seat: number;
    desired: DesiredAction;
    resolved: EngineAction;
    reason: string;
}

export interface ResolvedAction {
    engineAction: EngineAction;
    malformed?: MalformedEvent;
}

// Safe default when a desired action is illegal: check if possible, else fold.
function checkElseFold(legal: LegalActions): EngineAction {
    if (legal.check_call && legal.check_call_amount === 0) return { action: 'check_call' };
    if (legal.fold) return { action: 'fold' };
    return { action: 'check_call' };
}

/**
 * Map a desired action onto a legal engine action, clamping bet sizes to
 * [min, max] and falling back to check-else-fold for illegal action types.
 * Every clamp/fallback is reported as a MalformedEvent (a future quality signal)
 * so the runner can log it; the loop never crashes on a bad model output.
 */
export function resolveAction(seat: number, desired: DesiredAction, legal: LegalActions, bb: number): ResolvedAction {
    const bad = (resolved: EngineAction, reason: string): ResolvedAction => ({
        engineAction: resolved,
        malformed: { seat, desired, resolved, reason },
    });

    switch (desired.kind) {
        case 'fold':
            if (legal.fold) return { engineAction: { action: 'fold' } };
            return bad(checkElseFold(legal), 'fold illegal (nothing to fold to) -> check/fold');

        case 'check':
            if (legal.check_call && legal.check_call_amount === 0) return { engineAction: { action: 'check_call' } };
            return bad(legal.fold ? { action: 'fold' } : checkElseFold(legal), 'check illegal (facing a bet) -> fold');

        case 'call':
            if (legal.check_call) return { engineAction: { action: 'check_call' } };
            return bad(checkElseFold(legal), 'call illegal -> check/fold');

        case 'bet':
        case 'raise': {
            if (!legal.raise || legal.min == null || legal.max == null) {
                return bad(checkElseFold(legal), `${desired.kind} illegal -> check/fold`);
            }
            const target = Math.round(desired.amountBB * bb); // BB -> chips
            const want = Number.isFinite(target) ? target : legal.min;
            const clamped = Math.max(legal.min, Math.min(legal.max, want));
            if (clamped !== want) {
                return bad({ action: 'raise', amount: clamped }, `bet ${want} chips clamped to [${legal.min}, ${legal.max}]`);
            }
            return { engineAction: { action: 'raise', amount: clamped } };
        }

        case 'allin': {
            if (legal.raise && legal.max != null) return { engineAction: { action: 'raise', amount: legal.max } };
            if (legal.check_call) return bad({ action: 'check_call' }, 'all-in: raise illegal -> call');
            return bad(checkElseFold(legal), 'all-in illegal -> check/fold');
        }
    }
}
